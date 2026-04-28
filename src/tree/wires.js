/**
 * Draw SVG wires for expanded branches + starred nodes.
 *
 * Defensive version:
 * - Never draws wires to missing nodes
 * - Never draws wires if parent-child relationship no longer exists
 * - Star wires only draw when source.starredId exists and is valid
 */

import { isStarRootNode, findParentColumnRef } from "./starRoots.js";
import {
  getChildrenForSet,
  getNodeChildren,
  getNodeChildSets,
  makeColumnId,
  parseColumnId
} from "./childrenModel.js";
import { WIRE_CONFIG } from "../config.js";

export function renderWires({ state, layout, wiresEl }) {
  const { pos, edges, metrics } = layout;
  const { nodeSize, rowHeight } = metrics;

  // Star tiles are 2× size; layout.js provides starRowHeight
  const starRowHeight = metrics.starRowHeight ?? (nodeSize * 2 + (metrics.gapY ?? 0));

  wiresEl.setAttribute("width", String(WIRE_CONFIG.svgSize));
  wiresEl.setAttribute("height", String(WIRE_CONFIG.svgSize));
  wiresEl.setAttribute("viewBox", `0 0 ${WIRE_CONFIG.svgSize} ${WIRE_CONFIG.svgSize}`);
  wiresEl.innerHTML = "";
  ensureArrowMarker(wiresEl);

  // ------------------------------------------------------------
  // 0) Same-column wires between neighboring tiles
  // ------------------------------------------------------------
  for (const [colId, p] of Object.entries(pos)) {
    if (!p) continue;

    const { nodeId, setId } = parseColumnId(colId);
    const node = state.nodes[nodeId];
    if (!node) continue;

    const children = getChildrenForSet(node, setId).filter((id) => !!state.nodes[id]);
    if (children.length < 2) continue;

    const isStarColumn = isStarRootNode(node, nodeId);
    const rowH = isStarColumn ? starRowHeight : rowHeight;
    const tileSize = isStarColumn ? nodeSize * 2 : nodeSize;
    const x = p.x + tileSize / 2;

    for (let i = 0; i < children.length - 1; i++) {
      const y1 = p.yTop + i * rowH + tileSize;
      const y2 = p.yTop + (i + 1) * rowH;

      drawCubicWire({
        wiresEl,
        x1: x,
        y1,
        x2: x,
        y2,
        stroke: WIRE_CONFIG.sameColumnStroke,
        width: WIRE_CONFIG.sameColumnStrokeWidth,
        className: "same-column-wire",
        data: {
          "from-id": children[i],
          "to-id": children[i + 1]
        }
      });
    }
  }

  // ------------------------------------------------------------
  // 1) Normal expanded-branch wires (existing behavior)
  // ------------------------------------------------------------
  for (const edge of edges) {
    const parentColId = edge?.parentColId;
    const childColId = edge?.childColId;
    const childId = edge?.childId;
    if (!parentColId || !childColId || !childId) continue;

    const { nodeId: parentId, setId: parentSetId } = parseColumnId(parentColId);
    const parentNode = state.nodes[parentId];
    const childNode = state.nodes[childId];

    // HARD SAFETY CHECKS
    if (!parentNode) continue;
    if (!childNode) continue;

    // Child must still be an actual child of parent
    const parentChildren = getChildrenForSet(parentNode, parentSetId);
    if (!parentChildren.includes(childId)) continue;

    const p = pos[parentColId];
    const c = pos[childColId];
    if (!p || !c) continue;

    const rowIndex = parentChildren.indexOf(childId);
    if (rowIndex < 0) continue;

    // Parent square → right edge
    const x1 = p.x + nodeSize;
    const y1 = p.yTop + rowIndex * rowHeight + nodeSize / 2;

    // Child column → left edge (top square anchor)
    const x2 = c.x;
    const y2 = c.yTop + nodeSize / 2;

    drawCubicWire({
      wiresEl,
      x1,
      y1,
      x2,
      y2,
      className: "branch-wire",
      data: {
        "from-id": childId,
        "to-id": getChildrenForSet(childNode, parseColumnId(childColId).setId)[0] || childId
      }
    });
  }

  // ------------------------------------------------------------
  // 2) Star wires: source tile → star tile in STAR columns
  // ------------------------------------------------------------
  const starRootIndex = new Map();
  for (const [starRootId, starRoot] of Object.entries(state.nodes || {})) {
    if (!isStarRootNode(starRoot, starRootId)) continue;
    const starSetId = getNodeChildSets(starRoot)[0]?.id || "default";
    const starColId = makeColumnId(starRootId, starSetId);
    const kids = getNodeChildren(starRoot);
    for (let i = 0; i < kids.length; i++) {
      starRootIndex.set(kids[i], { starColId, rowIndex: i });
    }
  }

  if (starRootIndex.size === 0) return;

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

    const starRootRef = starRootIndex.get(starId);
    if (!starRootRef) continue;

    const { starColId, rowIndex: starRowIndex } = starRootRef;
    const starPos = pos[starColId];
    if (!starPos) continue;

    // Find the parent column that actually displays this source tile
    const parentRef = findParentColumnRef(state, sourceId);
    if (!parentRef) continue;

    const parentNode = state.nodes[parentRef.parentId];
    const p = pos[parentRef.columnId];
    if (!parentNode || !p) continue;

    const rowIndex = getChildrenForSet(parentNode, parentRef.setId).indexOf(sourceId);
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
      stroke: WIRE_CONFIG.starStroke,
      width: WIRE_CONFIG.starStrokeWidth,
      dash: WIRE_CONFIG.starDash,
      className: "star-wire",
      data: {
        "star-id": starId,
        "source-id": sourceId,
        "from-id": sourceId,
        "to-id": starId
      }
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
  stroke = WIRE_CONFIG.stroke,
  width = WIRE_CONFIG.strokeWidth,
  dash = null,
  className = "",
  data = null
}) {
  const mid = (x1 + x2) / 2;
  const vertical = Math.abs(x1 - x2) < 0.001;
  const d = vertical
    ? `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`
    : `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", ["wire-path", className].filter(Boolean).join(" "));
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", String(width));
  path.setAttribute("marker-end", "url(#wire-arrow)");
  if (dash) path.setAttribute("stroke-dasharray", dash);
  if (data && typeof data === "object") {
    for (const [key, value] of Object.entries(data)) {
      if (value == null || value === "") continue;
      path.setAttribute(`data-${key}`, String(value));
    }
  }

  wiresEl.appendChild(path);
}

function ensureArrowMarker(wiresEl) {
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  const markerWidth = WIRE_CONFIG.arrowMarkerWidth;
  const markerHeight = WIRE_CONFIG.arrowMarkerHeight;
  marker.setAttribute("id", "wire-arrow");
  marker.setAttribute("viewBox", `0 0 ${markerWidth} ${markerHeight}`);
  marker.setAttribute("markerWidth", String(markerWidth));
  marker.setAttribute("markerHeight", String(markerHeight));
  marker.setAttribute("refX", String(markerWidth));
  marker.setAttribute("refY", String(markerHeight / 2));
  marker.setAttribute("orient", "auto");
  marker.setAttribute("markerUnits", "userSpaceOnUse");
  marker.setAttribute("overflow", "visible");

  const tip = document.createElementNS("http://www.w3.org/2000/svg", "path");
  tip.setAttribute(
    "d",
    `M 0 0 L ${markerWidth} ${markerHeight / 2} L 0 ${markerHeight} z`
  );
  tip.setAttribute("fill", WIRE_CONFIG.arrowFill);

  marker.appendChild(tip);
  defs.appendChild(marker);
  wiresEl.appendChild(defs);
}
