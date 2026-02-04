// src/main.js
import { layoutForest } from "./tree/layout.js";
import { renderForest } from "./tree/render.js";
import { renderWires } from "./tree/wires.js";
import { attachPanZoom } from "./tree/interactions.js";
import { normalizeStarRoots } from "./tree/starRoots.js";

import { createModalManager } from "./modal/modal.js";
import { createViewerPanel } from "./modal/viewerPanel.js";

import { CAMERA_CONFIG } from "./config.js";

// DOM
const canvasEl = document.getElementById("canvas");
const viewportEl = document.getElementById("viewport");
const wiresEl = document.getElementById("wires");

// Viewer state (read-only)
const state = {
  roots: [],
  nodes: {},
  pan: { x: CAMERA_CONFIG.pointA.x, y: CAMERA_CONFIG.pointA.y },
  zoom: CAMERA_CONFIG.viewer.startZoom
};

// Pan/zoom
const panzoom = attachPanZoom({
  canvasEl,
  viewportEl,
  wiresEl,
  state,
  minZoom: CAMERA_CONFIG.zoomLimits.min,
  maxZoom: CAMERA_CONFIG.zoomLimits.max
});

// Modal root for viewer
const modalRootEl = document.createElement("div");
modalRootEl.id = "modal-root";
document.body.appendChild(modalRootEl);

// Modal manager
const modal = createModalManager({ modalRootEl });

// Boot
await loadStateFromJson();
render();

// Intro animation (viewer only)
panzoom.setEnabled(false);
panzoom.setZoomLimits(CAMERA_CONFIG.zoomLimits.min, CAMERA_CONFIG.zoomLimits.max);
panzoom.setCamera({
  x: CAMERA_CONFIG.pointA.x,
  y: CAMERA_CONFIG.pointA.y,
  zoom: CAMERA_CONFIG.viewer.startZoom
});
render();

animateCamera({
  from: {
    x: CAMERA_CONFIG.pointA.x,
    y: CAMERA_CONFIG.pointA.y,
    zoom: CAMERA_CONFIG.viewer.startZoom
  },
  to: {
    x: CAMERA_CONFIG.pointB.x,
    y: CAMERA_CONFIG.pointB.y,
    zoom: CAMERA_CONFIG.viewer.endZoom
  },
  durationMs: CAMERA_CONFIG.viewer.introMs,
  onUpdate: (cam) => {
    panzoom.setCamera(cam);
    // Layout doesn't change during camera tween; transform only.
    panzoom.applyTransform();
  },
  onDone: () => {
    // Snap to exact end values (avoid tiny float drift)
    panzoom.setCamera({
      x: CAMERA_CONFIG.pointB.x,
      y: CAMERA_CONFIG.pointB.y,
      zoom: CAMERA_CONFIG.viewer.endZoom
    });
    panzoom.setEnabled(true);
  }
});

// -----------------------------
// Rendering
// -----------------------------
function render() {
  const layout = layoutForest(state);

  renderForest({
    state,
    layout,
    viewportEl,
    mode: "viewer",
    onNodeClick,
    // IMPORTANT: star tiles render the SOURCE node's files (no duplication)
    getFilesForNode: (id) => state.nodes[id]?.files || {}
  });

  renderWires({ state, layout, wiresEl });

  panzoom.applyTransform();
}

// -----------------------------
// Viewer interactions
// -----------------------------
function onNodeClick(nodeId) {
  const n = state.nodes[nodeId];
  if (!n) return;

  // ⭐ Star tiles should do nothing on click
  if (n.kind === "star") return;

  const panel = createViewerPanel({
    nodeId,
    getNode: (id) => state.nodes[id],
    onRequestClose: () => modal.closeModal()
  });

  const header = document.createElement("div");
  header.className = "modal-header-content";

  const title = document.createElement("div");
  title.className = "modal-header-title";
  title.textContent = n.title?.trim() ? n.title : `Node: ${nodeId}`;

  const hint = document.createElement("div");
  hint.className = "modal-header-hint";
  hint.textContent = "Esc to close";

  header.appendChild(title);
  header.appendChild(hint);

  modal.openModal({
    headerContent: header,
    panel,
    footerContent: panel.footerEl
  });
}

// -----------------------------
// Load JSON (static)
// -----------------------------
async function loadStateFromJson() {
  const res = await fetch("/data/sketches.json");
  if (!res.ok) throw new Error("Failed to load /data/sketches.json");

  const data = await res.json();

  state.roots = Array.isArray(data.roots) ? data.roots : [];
  state.nodes = data.nodes || {};

  // normalize expandedChildren arrays -> Sets for layout
  for (const node of Object.values(state.nodes)) {
    node.children = Array.isArray(node.children) ? node.children : [];
    node.expandedChildren = new Set(
      Array.isArray(node.expandedChildren) ? node.expandedChildren : []
    );

    node.kind = node.kind || "normal";
    node.title = node.title || "";
    node.description = node.description || "";
    node.thumbnailPath = node.thumbnailPath || "";

    // Star refs may not have files; keep as {} safely
    node.files = node.files || {};
    node.sourceId = node.sourceId || "";
    node.starredId = node.starredId || "";
  }

  normalizeStarRoots(state);
}

// -----------------------------
// Camera tween helper
// -----------------------------
function animateCamera({ from, to, durationMs, onUpdate, onDone }) {
  const t0 = performance.now();

  const ease = (t) => t * t * (3 - 2 * t); // smoothstep

  function frame(now) {
    const raw = (now - t0) / durationMs;
    const t = Math.max(0, Math.min(1, raw));
    const k = ease(t);

    onUpdate({
      x: lerp(from.x, to.x, k),
      y: lerp(from.y, to.y, k),
      zoom: lerp(from.zoom, to.zoom, k)
    });

    if (t < 1) requestAnimationFrame(frame);
    else onDone?.();
  }

  requestAnimationFrame(frame);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
