import { CANVAS_IMAGE_CONFIG } from "../config.js";

export function renderCanvasImages({
  images = [],
  viewportEl,
  mode = "viewer",
  selectedId = "",
  onSelect,
  onUpdate,
  onCommit,
  onDelete
}) {
  let layerEl = viewportEl.querySelector("#canvasImageLayer");
  if (!layerEl) {
    layerEl = document.createElement("div");
    layerEl.id = "canvasImageLayer";
    layerEl.className = "canvas-image-layer";
    viewportEl.appendChild(layerEl);
  }

  layerEl.innerHTML = "";

  for (const image of images) {
    const el = renderCanvasImage({
      image: normalizeCanvasImage(image),
      mode,
      selected: mode === "editor" && image.id === selectedId,
      onSelect,
      onUpdate,
      onCommit,
      onDelete
    });
    layerEl.appendChild(el);
  }
}

export function normalizeCanvasImage(image) {
  return {
    id: String(image?.id || ""),
    src: String(image?.src || ""),
    alt: String(image?.alt || ""),
    x: numberOr(image?.x, 0),
    y: numberOr(image?.y, 0),
    width: Math.max(CANVAS_IMAGE_CONFIG.minWidth, numberOr(image?.width, CANVAS_IMAGE_CONFIG.width)),
    height: Math.max(CANVAS_IMAGE_CONFIG.minHeight, numberOr(image?.height, CANVAS_IMAGE_CONFIG.height)),
    aspectRatio: Math.max(0.01, numberOr(
      image?.aspectRatio,
      numberOr(image?.width, CANVAS_IMAGE_CONFIG.width) / numberOr(image?.height, CANVAS_IMAGE_CONFIG.height)
    ))
  };
}

function renderCanvasImage({ image, mode, selected, onSelect, onUpdate, onCommit, onDelete }) {
  const wrap = document.createElement("div");
  wrap.className = `canvas-image${selected ? " is-selected" : ""}`;
  wrap.style.left = `${image.x}px`;
  wrap.style.top = `${image.y}px`;
  wrap.style.width = `${image.width}px`;
  wrap.style.height = `${image.height}px`;
  wrap.dataset.canvasImageId = image.id;

  const img = document.createElement("img");
  img.className = "canvas-image-media";
  img.src = image.src;
  img.alt = image.alt;
  img.draggable = false;
  wrap.appendChild(img);

  if (mode === "editor") {
    wrap.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      onSelect?.(image.id);
    });
  }

  if (mode === "editor" && selected) {
    const toolbar = document.createElement("div");
    toolbar.className = "canvas-image-toolbar";

    const moveHandle = document.createElement("button");
    moveHandle.className = "canvas-image-move-handle";
    moveHandle.type = "button";
    moveHandle.title = "Move image";
    moveHandle.setAttribute("aria-label", "Move image");
    moveHandle.textContent = "✥";

    const deleteButton = document.createElement("button");
    deleteButton.className = "canvas-image-delete-btn";
    deleteButton.type = "button";
    deleteButton.title = "Delete image";
    deleteButton.setAttribute("aria-label", "Delete image");
    deleteButton.textContent = "×";
    deleteButton.addEventListener("pointerdown", (e) => e.stopPropagation());
    deleteButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onDelete?.(image.id);
    });

    toolbar.appendChild(moveHandle);
    toolbar.appendChild(deleteButton);
    wrap.appendChild(toolbar);

    const handle = document.createElement("div");
    handle.className = "canvas-image-resize-handle";
    handle.title = "Resize";
    wrap.appendChild(handle);

    attachDrag({ wrap, dragEl: moveHandle, image, onUpdate, onCommit });
    attachResize({ wrap, handle, image, onUpdate, onCommit });
  }

  return wrap;
}

function attachDrag({ wrap, dragEl, image, onUpdate, onCommit }) {
  dragEl.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragEl.setPointerCapture(e.pointerId);

    const start = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      x: image.x,
      y: image.y,
      zoom: getViewportZoom(wrap)
    };

    const move = (ev) => {
      const next = {
        x: start.x + (ev.clientX - start.pointerX) / start.zoom,
        y: start.y + (ev.clientY - start.pointerY) / start.zoom
      };
      wrap.style.left = `${next.x}px`;
      wrap.style.top = `${next.y}px`;
      onUpdate?.(image.id, next);
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onCommit?.(image.id, { keepSelected: true });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  });
}

function attachResize({ wrap, handle, image, onUpdate, onCommit }) {
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);

    const start = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      width: image.width,
      height: image.height,
      aspectRatio: image.aspectRatio || image.width / image.height || 1,
      zoom: getViewportZoom(wrap)
    };

    const move = (ev) => {
      const deltaX = (ev.clientX - start.pointerX) / start.zoom;
      const deltaY = (ev.clientY - start.pointerY) / start.zoom;
      const widthFromX = start.width + deltaX;
      const widthFromY = (start.height + deltaY) * start.aspectRatio;
      const width = Math.max(CANVAS_IMAGE_CONFIG.minWidth, Math.max(widthFromX, widthFromY));
      const height = Math.max(CANVAS_IMAGE_CONFIG.minHeight, width / start.aspectRatio);
      const next = { width, height };
      wrap.style.width = `${next.width}px`;
      wrap.style.height = `${next.height}px`;
      onUpdate?.(image.id, next);
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onCommit?.(image.id, { keepSelected: true });
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
