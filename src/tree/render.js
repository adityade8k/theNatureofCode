// src/tree/render.js
import { createP5Runner } from "../modal/runner.js";
import { isStarRootNode } from "./starRoots.js";

export function renderForest({
  state,
  layout,
  viewportEl,
  mode = "viewer",
  onNodeClick,
  onAddChild,
  onSpawnBranch,
  onStarNode,
  onDeleteStar,
  getFilesForNode,            // (nodeId) => files
  onSaveThumbnailForNode      // async (sourceId, dataUrl) => newThumbPath (or "")
}) {
  const { pos, metrics } = layout;
  const { nodeSize, rowHeight } = metrics;

  // Stable viewport structure
  let headerEl = viewportEl.querySelector("#worldHeader");
  let headerTagEl = viewportEl.querySelector("#headerTag");
  let worldEl = viewportEl.querySelector("#world");

  if (!headerEl) {
    headerEl = document.createElement("div");
    headerEl.id = "worldHeader";
    headerEl.className = "canvas-header canvas-header-positioned";
    viewportEl.appendChild(headerEl);
  }

  // A small author/semester tag next to the world header
  if (!headerTagEl) {
    headerTagEl = document.createElement("div");
    headerTagEl.id = "headerTag";
    headerTagEl.className = "header-tag canvas-header-positioned";
    viewportEl.appendChild(headerTagEl);
  }

  if (!worldEl) {
    worldEl = document.createElement("div");
    worldEl.id = "world";
    viewportEl.appendChild(worldEl);
  }

  worldEl.innerHTML = "";

  // Header anchored above first non-star root
  const firstRoot = (state.roots || []).find((id) => {
    const node = state.nodes[id];
    return node && !isStarRootNode(node, id);
  }) || (state.roots || [])[0];
  const rp = firstRoot ? pos[firstRoot] : null;
  

  headerEl.textContent = "the Nature of Code";
  headerTagEl.textContent = `Aditya De
ITP | NYU
Spring 2026`;
  

  for (const [colId, p] of Object.entries(pos)) {
    const col = renderColumn({
      state,
      colId,
      x: p.x,
      yTop: p.yTop,
      depth: p.depth,
      nodeSize,
      rowHeight,
      mode,
      onNodeClick,
      onAddChild,
      onSpawnBranch,
      onStarNode,
      onDeleteStar,
      getFilesForNode,
      onSaveThumbnailForNode
    });
    worldEl.appendChild(col);
  }
}

function renderColumn({
  state,
  colId,
  x,
  yTop,
  depth,
  nodeSize,
  rowHeight,
  mode,
  onNodeClick,
  onAddChild,
  onSpawnBranch,
  onStarNode,
  onDeleteStar,
  getFilesForNode,
  onSaveThumbnailForNode
}) {
  const node = state.nodes[colId];

  const col = document.createElement("div");
  col.className = "column-wrap";
  col.style.left = `${x}px`;
  col.style.top = `${yTop}px`;

  if (depth === 0) {
    if (!isStarRootNode(node, colId)) {
      const title = (node?.title || "").trim();
      if (title) {
        const header = document.createElement("div");
        header.className = "root-title";
        header.textContent = title;
        col.appendChild(header);
      }
    }
  }

  const expanded = toSet(node?.expandedChildren);

  (node?.children || []).forEach((childId) => {
    const child = state.nodes[childId];
    if (!child) return;

    const isStar = child.kind === "star";

    const row = document.createElement("div");
    row.className = "row";

    let tile;

    if (isStar) {
      tile = renderStarTile({
        state,
        starNode: child,
        nodeSize,
        mode,
        getFilesForNode,
        onDeleteStar,
        onSaveThumbnailForNode
      });
      tile.addEventListener("click", (e) => e.stopPropagation());
    } else {
      tile = document.createElement("div");
      tile.className = "square";
      tile.style.width = `${nodeSize}px`;
      tile.style.height = `${nodeSize}px`;

      if (child.thumbnailPath && child.thumbnailPath.trim()) {
        tile.classList.add("has-thumb");
        tile.style.backgroundImage = `url(${child.thumbnailPath})`;
        tile.textContent = "";
      } else {
        tile.classList.remove("has-thumb");
        tile.style.backgroundImage = "";
        tile.textContent = child.title?.trim()
          ? ""
          : (child.label || child.id);
      }

      tile.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof onNodeClick === "function") onNodeClick(childId);
      });
    }

    row.appendChild(tile);

    if (mode === "editor" && !isStar) {
      const alreadyBranched = expanded.has(childId);
      if (!alreadyBranched) {
        const arrow = document.createElement("button");
        arrow.className = "btn";
        arrow.type = "button";
        arrow.textContent = "→";
        arrow.title = "Spawn branch";
        arrow.addEventListener("click", (e) => {
          e.stopPropagation();
          if (typeof onSpawnBranch === "function") onSpawnBranch(colId, childId);
        });
        row.appendChild(arrow);
      }

      const isAlreadyStarred = !!child.starredId && !!state.nodes[child.starredId];
      if (!isAlreadyStarred) {
        const starBtn = document.createElement("button");
        starBtn.className = "btn";
        starBtn.type = "button";
        starBtn.textContent = "★";
        starBtn.title = "Create starred live tile";
        starBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (typeof onStarNode === "function") onStarNode(childId);
        });
        row.appendChild(starBtn);
      }
    }

    col.appendChild(row);
  });

  if (mode === "editor" && !isStarRootNode(node, colId)) {
    const plus = document.createElement("button");
    plus.className = "btn-plus";
    plus.type = "button";
    plus.textContent = "+";
    plus.title = "Add child";
    plus.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof onAddChild === "function") onAddChild(colId);
    });
    col.appendChild(plus);
  }

  return col;
}

/**
 * ⭐ Star tile: thumbnail idle -> run sketch on hover -> capture thumb on leave -> reset state
 */
function renderStarTile({
  state,
  starNode,
  nodeSize,
  mode,
  getFilesForNode,
  onDeleteStar,
  onSaveThumbnailForNode
}) {
  const baseSize = nodeSize * 2;

  const wrap = document.createElement("div");
  wrap.className = "square star-square star-square-wrap";
  wrap.style.width = `${baseSize}px`;
  wrap.style.height = `${baseSize}px`;

  const sourceId = starNode.sourceId;
  const sourceNode = state.nodes[sourceId];

  // IDLE VIEW: show source thumbnail
  function setThumbBackground(path) {
    if (path) {
      wrap.classList.add("has-thumb");
      wrap.style.backgroundImage = `url(${path})`;
    } else {
      wrap.classList.remove("has-thumb");
      wrap.style.backgroundImage = "";
    }
  }
  setThumbBackground(sourceNode?.thumbnailPath || "");

  // Runtime (created only while hovered)
  let iframe = null;
  let runner = null;
  let hovering = false;
  let capturing = false;
  let offCanvasDim = null;
  let lastCanvasDim = null;

  function getZoom() {
    return typeof state?.zoom === "number" && state.zoom > 0 ? state.zoom : 1;
  }

  function getMinScreenPx() {
    return Math.round(window.innerHeight * 0.25);
  }

  function shouldExpandAtZoom() {
    const zoom = getZoom();
    const minScreen = getMinScreenPx();
    const baseScreen = baseSize * zoom;
    return baseScreen < minScreen;
  }

  function normalizeCanvasDim(dim) {
    if (!dim) return null;
    const cssWidth = Number(dim.cssWidth) || Number(dim.width) || 0;
    const cssHeight = Number(dim.cssHeight) || Number(dim.height) || 0;
    if (!cssWidth || !cssHeight) return null;
    return { cssWidth, cssHeight };
  }

  function applyCanvasScale(targetWidth, targetHeight, dim) {
    if (!runner || !dim) return;
    const scaleW = targetWidth / dim.cssWidth;
    const scaleH = targetHeight / dim.cssHeight;
    const scale = Math.min(scaleW, scaleH);
    runner.setScale?.(scale);
  }

  function applyHoverSize(canvasDim, expand) {
    const zoom = getZoom();
    const minScreen = getMinScreenPx();
    const minWorld = minScreen / zoom;
    const dim = normalizeCanvasDim(canvasDim);
    const aspectRatio = dim ? dim.cssWidth / dim.cssHeight : 1;

    let targetWidth;
    let targetHeight;

    if (expand) {
      if (aspectRatio >= 1) {
        targetHeight = minWorld;
        targetWidth = minWorld * aspectRatio;
      } else {
        targetWidth = minWorld;
        targetHeight = minWorld / aspectRatio;
      }
      wrap.classList.add("star-expanded");
    } else {
      targetWidth = baseSize;
      targetHeight = baseSize;
      wrap.classList.remove("star-expanded");
    }

    wrap.style.width = `${targetWidth}px`;
    wrap.style.height = `${targetHeight}px`;
    wrap.style.transform = "";

    applyCanvasScale(targetWidth, targetHeight, dim);
  }

  function collapseToTile() {
    // Reset to base size with smooth transition
    wrap.style.width = `${baseSize}px`;
    wrap.style.height = `${baseSize}px`;
    wrap.style.transform = "";
    wrap.classList.remove("star-expanded");
  }

  async function mountSketchFresh() {
    // Remove thumbnail background while live sketch runs
    wrap.style.backgroundImage = "";

    iframe = document.createElement("iframe");
    iframe.className = "star-iframe";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.tabIndex = 0;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.transform = "";
    iframe.style.transformOrigin = "";

    wrap.appendChild(iframe);

    // Use natural canvas size, then scale the iframe to match the tile.
    runner = createP5Runner({ iframeEl: iframe, fitToFrame: false });

    const files =
      typeof getFilesForNode === "function" ? (getFilesForNode(sourceId) || {}) : {};

    runner.run({ nodeId: starNode.id, files });

    // Listen for canvas dimensions to expand tile to match
    offCanvasDim = runner.onCanvasDim((_nodeId, width, height, cssWidth, cssHeight) => {
      lastCanvasDim = { width, height, cssWidth, cssHeight };
      // Only expand if still hovering (user might have moved away)
      if (hovering && !capturing) {
        applyHoverSize(lastCanvasDim, shouldExpandAtZoom());
      }
    });

    // Give it a moment to draw at least one frame
    await wait(60);
    runner.resume?.();

    // Focus for keyboard events
    try {
      iframe.focus();
      iframe.contentWindow?.focus?.();
    } catch (_) { }
  }

  function unmountSketchReset() {
    try {
      if (offCanvasDim) {
        offCanvasDim();
        offCanvasDim = null;
      }
      runner?.destroy?.();
    } catch (_) { }
    runner = null;

    if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    iframe = null;
  }

  function requestThumbOnce(timeoutMs = 1200) {
    return new Promise((resolve) => {
      if (!runner) return resolve(null);

      let done = false;
      const offThumb = runner.onThumb((_id, dataUrl) => {
        if (done) return;
        done = true;
        offThumb?.();
        offErr?.();
        resolve(dataUrl || null);
      });
      const offErr = runner.onError((_id, err) => {
        if (done) return;
        done = true;
        offThumb?.();
        offErr?.();
        resolve(null);
      });

      runner.requestThumbnail();

      setTimeout(() => {
        if (done) return;
        done = true;
        offThumb?.();
        offErr?.();
        resolve(null);
      }, timeoutMs);
    });
  }

  function setStarWireFocus(activeStarId) {
    const wiresEl = document.getElementById("wires");
    if (!wiresEl) return;
    const starWires = wiresEl.querySelectorAll("path.star-wire");
    if (!starWires.length) return;

    starWires.forEach((path) => {
      if (!activeStarId) {
        path.style.display = "";
        return;
      }

      const pathStarId = path.getAttribute("data-star-id");
      path.style.display = pathStarId === activeStarId ? "" : "none";
    });
  }

  // Hover handlers
  wrap.addEventListener("mouseenter", async () => {
    if (hovering || capturing) return; // Prevent duplicate events
    hovering = true;
    setStarWireFocus(starNode.id);
    
    // Initial expansion (will be adjusted when canvas dimensions are received)
    applyHoverSize(lastCanvasDim, shouldExpandAtZoom());

    // Only mount if not already mounted
    if (!iframe && !capturing) {
      await mountSketchFresh();
    }
  });

  wrap.addEventListener("mouseleave", async () => {
    if (!hovering) return; // Prevent duplicate events
    hovering = false;
    setStarWireFocus(null);

    // Collapse immediately for smooth animation
    collapseToTile();

    // If we don't have a running sketch, we're done
    if (!runner || capturing) {
      return;
    }

    capturing = true;

    // Pause first to preserve the last rendered frame (optional)
    runner.pause?.();

    // Capture thumb
    const dataUrl = await requestThumbOnce(1600);

    // Save thumb to SOURCE node via callback (editor.js updates state + disk)
    let newPath = "";
    if (dataUrl && typeof onSaveThumbnailForNode === "function") {
      try {
        newPath = (await onSaveThumbnailForNode(sourceId, dataUrl)) || "";
      } catch (_) {
        newPath = "";
      }
    }

    // Reset sketch state by fully unmounting iframe
    unmountSketchReset();

    // Show updated thumb (or fallback to existing source thumb)
    const freshSourceThumb = state.nodes[sourceId]?.thumbnailPath || "";
    setThumbBackground(newPath || freshSourceThumb);

    capturing = false;
  });

  // Star tiles never open editor/viewer
  wrap.addEventListener("click", (e) => e.stopPropagation());

  if (mode === "editor") {
    const del = document.createElement("button");
    del.className = "btn star-delete-btn";
    del.type = "button";
    del.textContent = "✕";
    del.title = "Delete starred tile";

    del.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof onDeleteStar === "function") onDeleteStar(starNode.id);
    });

    wrap.appendChild(del);
  }

  return wrap;
}

function toSet(v) {
  if (!v) return new Set();
  if (v instanceof Set) return v;
  if (Array.isArray(v)) return new Set(v);
  return new Set();
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
