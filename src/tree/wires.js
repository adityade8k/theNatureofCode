/**
 * Draw SVG wires for expanded branches + starred nodes.
 *
 * Defensive version:
 * - Never draws wires to missing nodes
 * - Never draws wires if parent-child relationship no longer exists
 * - Star wires only draw when source.starredId exists and is valid
 */

const STAR_ROOT_ID = "__STARRED__";

export function renderWires({ state, layout, wiresEl }) {
  const { pos, edges, metrics } = layout;
  const { nodeSize, rowHeight } = metrics;

  // Star tiles are 2× size; layout.js provides starRowHeight
  const starRowHeight = metrics.starRowHeight ?? (nodeSize * 2 + (metrics.gapY ?? 14));

  wiresEl.setAttribute("width", "50000");
  wiresEl.setAttribute("height", "50000");
  wiresEl.setAttribute("viewBox", "0 0 50000 50000");
  wiresEl.innerHTML = "";

  // ------------------------------------------------------------
  // 1) Normal expanded-branch wires (existing behavior)
  // ------------------------------------------------------------
  for (const [parentId, childId] of edges) {
    const parentNode = state.nodes[parentId];
    const childNode = state.nodes[childId];

    // HARD SAFETY CHECKS
    if (!parentNode) continue;
    if (!childNode) continue;

    // Child must still be an actual child of parent
    if (!parentNode.children?.includes(childId)) continue;

    const p = pos[parentId];
    const c = pos[childId];
    if (!p || !c) continue;

    const rowIndex = parentNode.children.indexOf(childId);
    if (rowIndex < 0) continue;

    // Parent square → right edge
    const x1 = p.x + nodeSize;
    const y1 = p.yTop + rowIndex * rowHeight + nodeSize / 2;

    // Child column → left edge (top square anchor)
    const x2 = c.x;
    const y2 = c.yTop + nodeSize / 2;

    drawCubicWire({ wiresEl, x1, y1, x2, y2 });
  }

  // ------------------------------------------------------------
  // 2) Star wires: source tile → star tile in STAR column
  // ------------------------------------------------------------
  const starRoot = state.nodes[STAR_ROOT_ID];
  const starPos = pos[STAR_ROOT_ID];

  if (!starRoot || !starPos) return;

  const starChildren = Array.isArray(starRoot.children) ? starRoot.children : [];

  for (const [sourceId, sourceNode] of Object.entries(state.nodes)) {
    if (!sourceNode) continue;

    // Only normal-ish nodes can have starredId (star nodes themselves should not)
    if (sourceNode.kind === "star") continue;

    const starId = sourceNode.starredId;
    if (!starId) continue;

    const starNode = state.nodes[starId];
    if (!starNode || starNode.kind !== "star") continue;

    // Validate linkage
    if (starNode.sourceId !== sourceId) continue;

    // Must be present under the star root
    const starRowIndex = starChildren.indexOf(starId);
    if (starRowIndex < 0) continue;

    // Find the parent column that actually displays this source tile
    const parentId = findParentColumnId(state, sourceId);
    if (!parentId) continue;

    const parentNode = state.nodes[parentId];
    const p = pos[parentId];
    if (!parentNode || !p) continue;

    const rowIndex = parentNode.children.indexOf(sourceId);
    if (rowIndex < 0) continue;

    // Source tile → right edge
    const x1 = p.x + nodeSize;
    const y1 = p.yTop + rowIndex * rowHeight + nodeSize / 2;

    // Star tile (2× tile) → left edge
    // Center of 2× tile is at +nodeSize from its row top
    const x2 = starPos.x;
    const y2 = starPos.yTop + starRowIndex * starRowHeight + nodeSize;

    drawCubicWire({
      wiresEl,
      x1,
      y1,
      x2,
      y2,
      stroke: "rgba(255,255,255,0.35)",
      width: 2.25
    });
  }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function drawCubicWire({
  wiresEl,
  x1,
  y1,
  x2,
  y2,
  stroke = "rgba(255,255,255,0.25)",
  width = 2
}) {
  const mid = (x1 + x2) / 2;

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", String(width));

  wiresEl.appendChild(path);
}

function findParentColumnId(state, childId) {
  // Returns the first node whose children includes childId.
  // In your data model, a node should have a single parent column.
  for (const [id, n] of Object.entries(state.nodes)) {
    if (!n || !Array.isArray(n.children)) continue;
    if (n.children.includes(childId)) return id;
  }
  return null;
}
