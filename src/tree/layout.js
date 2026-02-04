/**
 * Tidy “subtree span” layout for a forest of rooted trees.
 *
 * We lay out *columns* (a node’s children-list UI) such that:
 * - x = depth * COL_X_STEP
 * - y is computed so subtrees never overlap (span-based stacking)
 *
 * Supports multiple roots stacked vertically (forest).
 *
 * Special:
 * - A "__STARRED__" column (if present) is NOT treated as a stacked root.
 *   It is placed as a single right-most column to the right of the deepest visible column.
 *
 * Expected state shape:
 * {
 *   roots: [nodeId, ...],
 *   nodes: {
 *     [id]: {
 *       id,
 *       children: [childId, ...],
 *       expandedChildren: Set OR Array   // children whose branch (child column) is visible
 *       kind?: "star" | ...
 *     }
 *   }
 * }
 */

import { isStarRootNode, STAR_ROOT_PREFIX, LEGACY_STAR_ROOT_ID } from "./starRoots.js";

export function layoutForest(state, opts = {}) {
  const {
    nodeSize = 90,
    gapY = 14,
    gapX = 140,
    plusHeight = 44,
    siblingGap = 26,
    rootGap = 80
  } = opts;

  const ROW_H = nodeSize + gapY;
  const COL_X_STEP = nodeSize + gapX;

  // Star tiles are 2× in size, so their rows are taller.
  const STAR_ROW_H = nodeSize * 2 + gapY;

  // --- helpers ------------------------------------------------

  const getNode = (id) => state.nodes[id];

  const expandedSet = (node) => {
    // allow Set in-memory, or Array from JSON
    const v = node?.expandedChildren;
    if (!v) return new Set();
    if (v instanceof Set) return v;
    return new Set(Array.isArray(v) ? v : []);
  };

  const columnHeight = (nodeId) => {
    const n = getNode(nodeId);

    // Star column: no plus button; rows are 2× height (for 2× tiles)
    if (isStarRootNode(n, nodeId)) {
      const rowsH = (n?.children?.length ?? 0) * STAR_ROW_H;
      return rowsH; // no plusHeight in star column
    }

    const rowsH = (n?.children?.length ?? 0) * ROW_H;
    return rowsH + plusHeight;
  };

  const collectVisibleColumnsFromRoot = (rootId) => {
    const cols = new Set([rootId]);

    const walk = (id) => {
      const n = getNode(id);
      if (!n) return;

      for (const cid of expandedSet(n)) {
        cols.add(cid);
        walk(cid);
      }
    };

    walk(rootId);
    return cols;
  };

  const collectVisibleEdgesFromRoot = (rootId) => {
    const edges = [];

    const walk = (id) => {
      const n = getNode(id);
      if (!n) return;

      for (const cid of expandedSet(n)) {
        edges.push([id, cid]);
        walk(cid);
      }
    };

    walk(rootId);
    return edges;
  };

  // --- layout one root ---------------------------------------

  function layoutOneRoot(rootId, topY0) {
    const visibleCols = collectVisibleColumnsFromRoot(rootId);

    const expandedKidsInView = (id) => {
      const n = getNode(id);
      if (!n) return [];
      return [...expandedSet(n)].filter((cid) => visibleCols.has(cid));
    };

    // subtree vertical “territory” required for this column and its expanded descendants
    const spanMemo = new Map();

    const subtreeSpan = (id) => {
      if (spanMemo.has(id)) return spanMemo.get(id);

      const kids = expandedKidsInView(id);
      const selfH = columnHeight(id);

      if (kids.length === 0) {
        spanMemo.set(id, selfH);
        return selfH;
      }

      let total = 0;
      for (let i = 0; i < kids.length; i++) {
        total += subtreeSpan(kids[i]);
        if (i < kids.length - 1) total += siblingGap;
      }

      const span = Math.max(selfH, total);
      spanMemo.set(id, span);
      return span;
    };

    // positions: column root nodeId -> { x, yTop, centerY, depth }
    const pos = {};

    const assign = (id, depth, topY) => {
      const span = subtreeSpan(id);
      const kids = expandedKidsInView(id);

      let centerY;

      if (kids.length === 0) {
        centerY = topY + span / 2;
      } else {
        // total children stack span
        let childTotal = 0;
        for (let i = 0; i < kids.length; i++) {
          childTotal += subtreeSpan(kids[i]);
          if (i < kids.length - 1) childTotal += siblingGap;
        }

        // center children within this span
        let childTop = topY + (span - childTotal) / 2;

        const childCenters = [];
        for (const cid of kids) {
          assign(cid, depth + 1, childTop);
          childCenters.push(pos[cid].centerY);
          childTop += subtreeSpan(cid) + siblingGap;
        }

        centerY = (Math.min(...childCenters) + Math.max(...childCenters)) / 2;
      }

      const selfH = columnHeight(id);
      pos[id] = {
        x: depth * COL_X_STEP,
        centerY,
        yTop: centerY - selfH / 2,
        depth
      };
    };

    assign(rootId, 0, topY0);

    // prune (safety)
    for (const k of Object.keys(pos)) {
      if (!visibleCols.has(k)) delete pos[k];
    }

    return {
      pos,
      span: subtreeSpan(rootId),
      edges: collectVisibleEdgesFromRoot(rootId)
    };
  }

  // --- layout forest -----------------------------------------

  const allPos = {};
  const allEdges = [];

  let topY = 0;

  // IMPORTANT: Star columns are NOT stacked roots in the forest.
  const roots = (state.roots || []).filter((rid) => {
    const n = state.nodes[rid];
    return n && !isStarRootNode(n, rid);
  });

  const starRootsByRoot = new Map();
  let legacyStarRootId = null;
  for (const [id, node] of Object.entries(state.nodes || {})) {
    if (!isStarRootNode(node, id)) continue;
    if (id === LEGACY_STAR_ROOT_ID) {
      legacyStarRootId = id;
      continue;
    }

    const rootId = node.starForRoot || (id.startsWith(STAR_ROOT_PREFIX)
      ? id.slice(STAR_ROOT_PREFIX.length)
      : "");
    if (rootId) starRootsByRoot.set(rootId, id);
  }

  for (const rootId of roots) {
    if (!state.nodes[rootId]) continue;

    const rootTopY = topY;
    const { pos, span, edges } = layoutOneRoot(rootId, rootTopY);

    Object.assign(allPos, pos);
    allEdges.push(...edges);

    const starRootId = starRootsByRoot.get(rootId);
    const starNode = starRootId ? state.nodes[starRootId] : null;
    const starHasChildren = (starNode?.children || []).length > 0;
    if (starRootId && starHasChildren) {
      let maxDepth = 0;
      for (const p of Object.values(pos)) {
        if (!p) continue;
        if (typeof p.depth === "number") maxDepth = Math.max(maxDepth, p.depth);
      }

      const starDepth = maxDepth + 1;
      const starX = starDepth * COL_X_STEP;
      const starH = columnHeight(starRootId);
      const starYTop = rootTopY + Math.max(0, (span - starH) / 2);
      const starCenterY = starYTop + starH / 2;

      allPos[starRootId] = {
        x: starX,
        yTop: starYTop,
        centerY: starCenterY,
        depth: starDepth
      };
    }

    topY += span + rootGap;
  }

  // Legacy STAR column (fallback)
  if (legacyStarRootId && state.nodes[legacyStarRootId]) {
    let maxDepth = 0;
    for (const p of Object.values(allPos)) {
      if (!p) continue;
      if (typeof p.depth === "number") maxDepth = Math.max(maxDepth, p.depth);
    }

    const starDepth = maxDepth + 1;
    const starX = starDepth * COL_X_STEP;
    const starH = columnHeight(legacyStarRootId);
    const starYTop = 0;
    const starCenterY = starYTop + starH / 2;

    allPos[legacyStarRootId] = {
      x: starX,
      yTop: starYTop,
      centerY: starCenterY,
      depth: starDepth
    };
  }

  return {
    pos: allPos,      // { [nodeId]: {x,yTop,centerY,depth} }
    edges: allEdges,  // [ [parentId, childId], ... ] for expanded branches
    metrics: {
      rowHeight: ROW_H,
      starRowHeight: STAR_ROW_H,
      colStepX: COL_X_STEP,
      nodeSize,
      gapY,
      gapX,
      plusHeight,
      siblingGap,
      rootGap
    }
  };
}
