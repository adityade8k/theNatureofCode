import { TEXT_BOX_CONFIG } from "../config.js";

export function renderTextBoxes({
  textBoxes = [],
  viewportEl,
  mode = "viewer",
  selectedId = "",
  onSelect,
  onUpdate,
  onCommit,
  onDelete
}) {
  let layerEl = viewportEl.querySelector("#textBoxLayer");
  if (!layerEl) {
    layerEl = document.createElement("div");
    layerEl.id = "textBoxLayer";
    layerEl.className = "text-box-layer";
    viewportEl.appendChild(layerEl);
  }

  layerEl.innerHTML = "";

  for (const box of textBoxes) {
    const el = renderTextBox({
      box: normalizeTextBox(box),
      mode,
      selected: mode === "editor" && box.id === selectedId,
      onSelect,
      onUpdate,
      onCommit,
      onDelete
    });
    layerEl.appendChild(el);
  }
}

export function normalizeTextBox(box) {
  return {
    id: String(box?.id || ""),
    text: String(box?.text || ""),
    x: numberOr(box?.x, 0),
    y: numberOr(box?.y, 0),
    width: Math.max(TEXT_BOX_CONFIG.minWidth, numberOr(box?.width, TEXT_BOX_CONFIG.width)),
    height: Math.max(TEXT_BOX_CONFIG.minHeight, numberOr(box?.height, TEXT_BOX_CONFIG.height)),
    fontSize: Math.max(TEXT_BOX_CONFIG.minFontSize, numberOr(box?.fontSize, TEXT_BOX_CONFIG.fontSize))
  };
}

function renderTextBox({ box, mode, selected, onSelect, onUpdate, onCommit, onDelete }) {
  const wrap = document.createElement("div");
  wrap.className = `text-box${selected ? " is-selected" : ""}`;
  wrap.style.left = `${box.x}px`;
  wrap.style.top = `${box.y}px`;
  wrap.style.width = `${box.width}px`;
  wrap.style.height = `${box.height}px`;
  wrap.dataset.textBoxId = box.id;

  const content = document.createElement("div");
  content.className = "text-box-content";
  content.style.fontSize = `${box.fontSize}px`;

  if (mode === "editor") {
    content.contentEditable = selected ? "true" : "false";
    content.spellcheck = false;
    if (selected) {
      content.textContent = box.text;
    } else {
      renderLinkedText(content, box.text);
    }
    content.addEventListener("input", () => {
      onUpdate?.(box.id, { text: getEditablePlainText(content) });
    });
    content.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (e.shiftKey) {
        e.preventDefault();
        insertLineBreak();
        onUpdate?.(box.id, { text: getEditablePlainText(content) });
        return;
      }
      e.preventDefault();
      content.blur();
      onCommit?.(box.id);
    });

    wrap.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      onSelect?.(box.id);
    });
  } else {
    content.contentEditable = "false";
    renderLinkedText(content, box.text);
  }

  wrap.appendChild(content);

  if (mode === "editor" && selected) {
    const toolbar = document.createElement("div");
    toolbar.className = "text-box-toolbar";

    const moveHandle = document.createElement("button");
    moveHandle.className = "text-box-move-handle";
    moveHandle.type = "button";
    moveHandle.title = "Move text box";
    moveHandle.setAttribute("aria-label", "Move text box");
    moveHandle.textContent = "✥";

    const size = document.createElement("input");
    size.type = "number";
    size.min = String(TEXT_BOX_CONFIG.minFontSize);
    size.max = String(TEXT_BOX_CONFIG.maxFontSize);
    size.step = "1";
    size.value = String(Math.round(box.fontSize));
    size.title = "Text size";
    size.addEventListener("pointerdown", (e) => e.stopPropagation());
    size.addEventListener("input", () => {
      const fontSize = Math.max(TEXT_BOX_CONFIG.minFontSize, Number(size.value) || box.fontSize);
      content.style.fontSize = `${fontSize}px`;
      onUpdate?.(box.id, { fontSize });
    });
    size.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      onCommit?.(box.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "text-box-delete-btn";
    deleteButton.type = "button";
    deleteButton.title = "Delete text box";
    deleteButton.setAttribute("aria-label", "Delete text box");
    deleteButton.textContent = "×";
    deleteButton.addEventListener("pointerdown", (e) => e.stopPropagation());
    deleteButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onDelete?.(box.id);
    });

    toolbar.appendChild(moveHandle);
    toolbar.appendChild(size);
    toolbar.appendChild(deleteButton);
    wrap.appendChild(toolbar);

    const handle = document.createElement("div");
    handle.className = "text-box-resize-handle";
    handle.title = "Resize";
    wrap.appendChild(handle);

    attachDrag({ wrap, dragEl: moveHandle, box, onUpdate, onCommit });
    attachResize({ wrap, handle, box, onUpdate, onCommit });
  }

  return wrap;
}

function attachDrag({ wrap, dragEl, box, onUpdate, onCommit }) {
  dragEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("input")) return;
    e.preventDefault();
    e.stopPropagation();
    dragEl.setPointerCapture(e.pointerId);

    const start = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      x: box.x,
      y: box.y,
      zoom: getViewportZoom(wrap)
    };

    const move = (ev) => {
      const dx = (ev.clientX - start.pointerX) / start.zoom;
      const dy = (ev.clientY - start.pointerY) / start.zoom;
      const next = { x: start.x + dx, y: start.y + dy };
      wrap.style.left = `${next.x}px`;
      wrap.style.top = `${next.y}px`;
      onUpdate?.(box.id, next);
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onCommit?.(box.id, { keepSelected: true });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  });
}

function attachResize({ wrap, handle, box, onUpdate, onCommit }) {
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);

    const start = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      width: box.width,
      height: box.height,
      zoom: getViewportZoom(wrap)
    };

    const move = (ev) => {
      const width = Math.max(TEXT_BOX_CONFIG.minWidth, start.width + (ev.clientX - start.pointerX) / start.zoom);
      const height = Math.max(TEXT_BOX_CONFIG.minHeight, start.height + (ev.clientY - start.pointerY) / start.zoom);
      wrap.style.width = `${width}px`;
      wrap.style.height = `${height}px`;
      onUpdate?.(box.id, { width, height });
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onCommit?.(box.id, { keepSelected: true });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  });
}

function getViewportZoom(el) {
  const viewport = el.closest("#viewport");
  const transform = viewport ? getComputedStyle(viewport).transform : "";
  if (!transform || transform === "none") return 1;
  const values = transform.match(/matrix\(([^)]+)\)/)?.[1]?.split(",") || [];
  const scale = Number(values[0]);
  return scale > 0 ? scale : 1;
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function renderLinkedText(el, text) {
  el.textContent = "";

  const pattern = /\*([^\*\n]+)\*\[([^\]\s]+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      el.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const a = document.createElement("a");
    a.className = "text-box-link";
    a.href = normalizeHref(match[2]);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = match[1];
    a.addEventListener("pointerdown", (e) => e.stopPropagation());
    a.addEventListener("click", (e) => e.stopPropagation());
    el.appendChild(a);

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    el.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function normalizeHref(raw) {
  const href = String(raw || "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  return `https://${href}`;
}

function insertLineBreak() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createElement("br"));
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function getEditablePlainText(el) {
  let out = "";

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue || "";
      return;
    }

    if (node.nodeName === "BR") {
      out += "\n";
      return;
    }

    for (const child of node.childNodes) walk(child);
  }

  walk(el);
  return out;
}
