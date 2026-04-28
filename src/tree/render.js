// src/tree/render.js
import { createP5Runner } from "../modal/runner.js";
import { isStarRootNode } from "./starRoots.js";
import {
  getChildrenForSet,
  getNodeChildren,
  getNodeChildSets,
  parseColumnId
} from "./childrenModel.js";
import { CANVAS_INTRO_CONFIG, TILE_INDEX_CONFIG } from "../config.js";

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
  onEditRootTitle,
  onDeleteRoot,
  getFilesForNode,            // (nodeId) => files
  onSaveThumbnailForNode      // async (sourceId, dataUrl) => newThumbPath (or "")
}) {
  const { pos, metrics } = layout;
  const { nodeSize, rowHeight, gapY, plusHeight } = metrics;

  // Stable viewport structure
  let headerEl = viewportEl.querySelector("#worldHeader");
  let headerTagEl = viewportEl.querySelector("#headerTag");
  let introTextEl = viewportEl.querySelector("#introText");
  let worldEl = viewportEl.querySelector("#world");

  if (!headerEl) {
    headerEl = document.createElement("div");
    headerEl.id = "worldHeader";
    viewportEl.appendChild(headerEl);
  }
  headerEl.classList.add("canvas-header", "canvas-header-positioned");
  headerEl.style.transform = `translate(${CANVAS_INTRO_CONFIG.header.x}px, ${CANVAS_INTRO_CONFIG.header.y}px)`;

  // A small author/semester tag next to the world header
  if (!headerTagEl) {
    headerTagEl = document.createElement("div");
    headerTagEl.id = "headerTag";
    viewportEl.appendChild(headerTagEl);
  }
  headerTagEl.classList.add("header-tag", "canvas-header-positioned");
  headerTagEl.style.transform = `translate(${CANVAS_INTRO_CONFIG.subheader.x}px, ${CANVAS_INTRO_CONFIG.subheader.y}px)`;

  if (!introTextEl) {
    introTextEl = document.createElement("div");
    introTextEl.id = "introText";
    viewportEl.appendChild(introTextEl);
  }
  introTextEl.classList.add("intro-text", "canvas-header-positioned");
  introTextEl.style.transform = `translate(${CANVAS_INTRO_CONFIG.body.x}px, ${CANVAS_INTRO_CONFIG.body.y}px)`;
  introTextEl.style.width = `${CANVAS_INTRO_CONFIG.body.width}px`;

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
  const firstRootSetId = firstRoot ? (getNodeChildSets(state.nodes[firstRoot])[0]?.id || "default") : "";
  const firstRootColId = firstRoot ? `${firstRoot}::${firstRootSetId}` : "";
  const rp = firstRootColId ? pos[firstRootColId] : null;
  

  headerEl.textContent = CANVAS_INTRO_CONFIG.header.text;
  headerTagEl.textContent = CANVAS_INTRO_CONFIG.subheader.text;
  introTextEl.textContent = CANVAS_INTRO_CONFIG.body.text;
  
  const tileSerials = createTileSerialMap(state);

  for (const [colId, p] of Object.entries(pos)) {
    const col = renderColumn({
      state,
      colId,
      x: p.x,
      yTop: p.yTop,
      depth: p.depth,
      nodeSize,
      rowHeight,
      gapY,
      plusHeight,
      tileSerials,
      mode,
      onNodeClick,
      onAddChild,
      onSpawnBranch,
      onStarNode,
      onDeleteStar,
      onEditRootTitle,
      onDeleteRoot,
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
  gapY,
  plusHeight,
  tileSerials,
  mode,
  onNodeClick,
  onAddChild,
  onSpawnBranch,
  onStarNode,
  onDeleteStar,
  onEditRootTitle,
  onDeleteRoot,
  getFilesForNode,
  onSaveThumbnailForNode
}) {
  const { nodeId, setId } = parseColumnId(colId);
  const node = state.nodes[nodeId];

  const col = document.createElement("div");
  col.className = "column-wrap";
  col.style.left = `${x}px`;
  col.style.top = `${yTop}px`;

  if (depth === 0) {
    const firstSetId = getNodeChildSets(node)[0]?.id || "default";
    if (!isStarRootNode(node, nodeId) && setId === firstSetId) {
      const title = (node?.title || "").trim();
      if (title) {
        const header = document.createElement("div");
        header.className = "root-title";

        if (mode === "editor") {
          const controls = document.createElement("span");
          controls.className = "root-title-controls";

          const edit = document.createElement("button");
          edit.className = "root-title-btn";
          edit.type = "button";
          edit.textContent = "Edit";
          edit.title = "Edit root title";
          edit.addEventListener("click", (e) => {
            e.stopPropagation();
            if (typeof onEditRootTitle === "function") onEditRootTitle(nodeId);
          });

          const del = document.createElement("button");
          del.className = "root-title-btn root-title-delete";
          del.type = "button";
          del.textContent = "Delete";
          del.title = "Delete root";
          del.addEventListener("click", (e) => {
            e.stopPropagation();
            if (typeof onDeleteRoot === "function") onDeleteRoot(nodeId);
          });

          controls.appendChild(edit);
          controls.appendChild(del);
          header.appendChild(controls);
        }

        const text = document.createElement("span");
        text.className = "root-title-text";
        text.textContent = title;
        header.appendChild(text);

        col.appendChild(header);
      }
    }
  }

  const children = getChildrenForSet(node, setId);

  children.forEach((childId, index) => {
    const child = state.nodes[childId];
    if (!child) return;

    const isStar = child.kind === "star";

    const row = document.createElement("div");
    row.className = "row";
    row.style.marginBottom = index < children.length - 1 ? `${gapY}px` : "0";

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

      const title = (child.title || "").trim();
      const description = (child.description || "").trim();
      if (title || description) {
        const meta = document.createElement("div");
        meta.className = "tile-hover-meta";
        meta.style.setProperty("--tile-title-window", `${Math.max(20, nodeSize - 16)}px`);

        if (title) {
          const titleBand = document.createElement("div");
          titleBand.className = "tile-hover-title-band";

          const titleEl = document.createElement("div");
          titleEl.className = "tile-hover-title";

          const titleText = document.createElement("span");
          titleText.className = "tile-hover-title-text";
          titleText.textContent = title;

          titleEl.appendChild(titleText);
          titleBand.appendChild(titleEl);
          meta.appendChild(titleBand);
        }

        if (description) {
          const descEl = document.createElement("div");
          descEl.className = "tile-hover-description";
          descEl.textContent = description;
          meta.appendChild(descEl);
        }

        tile.appendChild(meta);
      }

      tile.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof onNodeClick === "function") onNodeClick(childId);
      });
    }

    const tileStack = document.createElement("div");
    tileStack.className = "tile-stack";
    tileStack.dataset.nodeId = childId;
    if (isStar && child.sourceId) tileStack.dataset.sourceId = child.sourceId;

    const serial = !isStar && TILE_INDEX_CONFIG.show ? tileSerials.get(childId) : "";
    if (serial) {
      const serialEl = document.createElement("div");
      serialEl.className = "tile-serial";
      serialEl.textContent = serial;
      serialEl.style.setProperty("--tile-index-offset-x", `${TILE_INDEX_CONFIG.offsetX}px`);
      serialEl.style.setProperty("--tile-index-color", TILE_INDEX_CONFIG.color);
      serialEl.style.setProperty("--tile-index-font-size", `${TILE_INDEX_CONFIG.fontSize}px`);
      serialEl.style.setProperty("--tile-index-font-weight", String(TILE_INDEX_CONFIG.fontWeight));
      tileStack.appendChild(serialEl);
    }

    tileStack.appendChild(tile);
    row.appendChild(tileStack);

    if (mode === "editor" && !isStar) {
      const arrow = document.createElement("button");
      arrow.className = "btn";
      arrow.type = "button";
      arrow.textContent = "→";
      arrow.title = "Spawn new child set";
      arrow.addEventListener("click", (e) => {
        e.stopPropagation();
          if (typeof onSpawnBranch === "function") onSpawnBranch(nodeId, childId);
      });
      row.appendChild(arrow);

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

  if (mode === "editor" && !isStarRootNode(node, nodeId)) {
    const plus = document.createElement("button");
    plus.className = "btn-plus";
    plus.type = "button";
    plus.style.width = `${nodeSize}px`;
    plus.style.height = `${plusHeight}px`;
    plus.textContent = "+";
    plus.title = "Add child";
    plus.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof onAddChild === "function") onAddChild(nodeId, setId);
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

  function setFeaturedChainFocus(activeStarId) {
    const wiresEl = document.getElementById("wires");
    const viewportEl = document.getElementById("viewport");
    if (!wiresEl || !viewportEl) return;

    const chainIds = activeStarId
      ? getFeaturedChainIds(state, sourceId, activeStarId)
      : null;

    viewportEl.classList.toggle("featured-chain-active", !!chainIds);
    wiresEl.classList.toggle("featured-chain-active", !!chainIds);

    viewportEl.querySelectorAll(".tile-stack").forEach((tile) => {
      const id = tile.getAttribute("data-node-id");
      tile.classList.toggle("featured-chain-keep", !!chainIds && chainIds.has(id));
    });

    wiresEl.querySelectorAll("path.wire-path").forEach((path) => {
      if (!chainIds) {
        path.style.display = "";
        return;
      }

      const starId = path.getAttribute("data-star-id");
      if (starId) {
        path.style.display = starId === activeStarId ? "" : "none";
        return;
      }

      const fromId = path.getAttribute("data-from-id");
      const toId = path.getAttribute("data-to-id");
      path.style.display = fromId && toId && chainIds.has(fromId) && chainIds.has(toId)
        ? ""
        : "none";
    });
  }

  // Hover handlers
  wrap.addEventListener("mouseenter", async () => {
    if (hovering || capturing) return; // Prevent duplicate events
    hovering = true;
    setFeaturedChainFocus(starNode.id);
    
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
    setFeaturedChainFocus(null);

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

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getFeaturedChainIds(state, sourceId, starId) {
  const chain = new Set([sourceId, starId]);
  const visitedTargets = new Set();

  function findParentSetRef(childId) {
    for (const [parentId, node] of Object.entries(state.nodes || {})) {
      if (!node) continue;
      for (const set of getNodeChildSets(node)) {
        const children = Array.isArray(set.children) ? set.children : [];
        const index = children.indexOf(childId);
        if (index >= 0) return { parentId, parentNode: node, children, index };
      }
    }
    return null;
  }

  function addPathTo(targetId) {
    if (!targetId || visitedTargets.has(targetId)) return;
    visitedTargets.add(targetId);

    const parentRef = findParentSetRef(targetId);
    if (!parentRef) {
      chain.add(targetId);
      return;
    }

    for (let i = 0; i <= parentRef.index; i++) {
      chain.add(parentRef.children[i]);
    }

    if (
      parentRef.parentNode?.kind !== "root" &&
      !isStarRootNode(parentRef.parentNode, parentRef.parentId)
    ) {
      chain.add(parentRef.parentId);
      addPathTo(parentRef.parentId);
    }
  }

  addPathTo(sourceId);

  return chain;
}

function createTileSerialMap(state) {
  const serials = new Map();

  for (const rootId of state.roots || []) {
    const root = state.nodes[rootId];
    if (!root || isStarRootNode(root, rootId)) continue;

    let next = 1;
    const visited = new Set();

    function visit(nodeId) {
      if (!nodeId || visited.has(nodeId)) return;
      const node = state.nodes[nodeId];
      if (!node || node.kind === "star" || isStarRootNode(node, nodeId)) return;

      visited.add(nodeId);
      if (nodeId !== rootId) serials.set(nodeId, String(next++));

      for (const childId of getNodeChildren(node)) {
        visit(childId);
      }
    }

    visit(rootId);
  }

  return serials;
}
