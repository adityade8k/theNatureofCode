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
 *       childSets: [{ id, label, children: [childId, ...] }],
 *       expandedChildren: Set OR Array   // children whose branch (child column) is visible
 *       kind?: "star" | ...
 *     }
 *   }
 * }
 */

import { isStarRootNode, STAR_ROOT_PREFIX, LEGACY_STAR_ROOT_ID } from "./starRoots.js";
import {
  DEFAULT_CHILD_SET_ID,
  getChildrenForSet,
  getDefaultSetId,
  getNodeChildSets,
  makeColumnId,
  parseColumnId
} from "./childrenModel.js";

export function layoutForest(state, opts = {}) {
  const {
    nodeSize = 90,
    gapY = 14,
    gapX = 140,
    plusHeight = 44,
    siblingGap = 10,
    sameParentSetGap = 10,
    rootGap = 10
  } = opts;

  const ROW_H = nodeSize + gapY;
  const COL_X_STEP = nodeSize + gapX;

  // Star tiles are 2× in size, so their rows are taller.
  const STAR_ROW_H = nodeSize * 2 + gapY;

  // --- helpers ------------------------------------------------

  const getNode = (id) => state.nodes[id];
  const getColumnNode = (columnId) => getNode(parseColumnId(columnId).nodeId);

  const expandedSet = (node) => {
    // allow Set in-memory, or Array from JSON
    const v = node?.expandedChildren;
    if (!v) return new Set();
    if (v instanceof Set) return v;
    return new Set(Array.isArray(v) ? v : []);
  };

  const getColumnChildren = (columnId) => {
    const { nodeId, setId } = parseColumnId(columnId);
    const n = getNode(nodeId);
    return getChildrenForSet(n, setId);
  };

  const getColumnIdsForNode = (nodeId) => {
    const n = getNode(nodeId);
    const sets = getNodeChildSets(n);
    if (sets.length === 0) {
      if (Array.isArray(n?.childSets) && n?.kind !== "root") return [];
      return [makeColumnId(nodeId, getDefaultSetId(n) || DEFAULT_CHILD_SET_ID)];
    }
    return sets.map((set) => makeColumnId(nodeId, set.id));
  };

  const gapBetweenRefs = (a, b) => {
    if (!a || !b) return siblingGap;
    if (a.ownerKey && b.ownerKey && a.ownerKey === b.ownerKey) return sameParentSetGap;
    return siblingGap;
  };

  const columnHeight = (columnId) => {
    const { nodeId } = parseColumnId(columnId);
    const n = getNode(nodeId);

    // Star column: no plus button; rows are 2× height (for 2× tiles)
    if (isStarRootNode(n, nodeId)) {
      const rowsH = getColumnChildren(columnId).length * STAR_ROW_H;
      return rowsH; // no plusHeight in star column
    }

    const rowsH = getColumnChildren(columnId).length * ROW_H;
    return rowsH + plusHeight;
  };

  const collectVisibleColumnsFromRoot = (rootId) => {
    const cols = new Set();
    for (const rootColId of getColumnIdsForNode(rootId)) cols.add(rootColId);

    const walk = (colId) => {
      const n = getColumnNode(colId);
      if (!n) return;

      const expanded = expandedSet(n);
      for (const childId of getColumnChildren(colId)) {
        if (!expanded.has(childId)) continue;
        for (const childColId of getColumnIdsForNode(childId)) {
          cols.add(childColId);
          walk(childColId);
        }
      }
    };

    for (const rootColId of getColumnIdsForNode(rootId)) {
      walk(rootColId);
    }
    return cols;
  };

  const collectVisibleEdgesFromRoot = (rootId) => {
    const edges = [];

    const walk = (parentColId) => {
      const n = getColumnNode(parentColId);
      if (!n) return;

      const expanded = expandedSet(n);
      for (const childId of getColumnChildren(parentColId)) {
        if (!expanded.has(childId)) continue;
        for (const childColId of getColumnIdsForNode(childId)) {
          edges.push({ parentColId, childColId, childId });
          walk(childColId);
        }
      }
    };

    for (const rootColId of getColumnIdsForNode(rootId)) {
      walk(rootColId);
    }
    return edges;
  };

  // --- layout one root ---------------------------------------

  function layoutOneRoot(rootId, topY0) {
    const visibleCols = collectVisibleColumnsFromRoot(rootId);

    const expandedKidsInView = (colId) => {
      const n = getColumnNode(colId);
      if (!n) return [];

      const expanded = expandedSet(n);
      const out = [];
      for (const childId of getColumnChildren(colId)) {
        if (!expanded.has(childId)) continue;
        for (const childColId of getColumnIdsForNode(childId)) {
          if (visibleCols.has(childColId)) {
            out.push({ colId: childColId, ownerKey: childId });
          }
        }
      }
      return out;
    };

    // subtree vertical “territory” required for this column and its expanded descendants
    const spanMemo = new Map();

    const subtreeSpan = (colId) => {
      if (spanMemo.has(colId)) return spanMemo.get(colId);

      const kids = expandedKidsInView(colId);
      const selfH = columnHeight(colId);

      if (kids.length === 0) {
        spanMemo.set(colId, selfH);
        return selfH;
      }

      let total = 0;
      for (let i = 0; i < kids.length; i++) {
        total += subtreeSpan(kids[i].colId);
        if (i < kids.length - 1) total += gapBetweenRefs(kids[i], kids[i + 1]);
      }

      const span = Math.max(selfH, total);
      spanMemo.set(colId, span);
      return span;
    };

    // positions: columnId -> { x, yTop, centerY, depth, nodeId, setId }
    const pos = {};

    const assign = (colId, depth, topY) => {
      const span = subtreeSpan(colId);
      const kids = expandedKidsInView(colId);

      let centerY;

      if (kids.length === 0) {
        centerY = topY + span / 2;
      } else {
        // total children stack span
        let childTotal = 0;
        for (let i = 0; i < kids.length; i++) {
          childTotal += subtreeSpan(kids[i].colId);
          if (i < kids.length - 1) childTotal += gapBetweenRefs(kids[i], kids[i + 1]);
        }

        // center children within this span
        let childTop = topY + (span - childTotal) / 2;

        const childCenters = [];
        for (let i = 0; i < kids.length; i++) {
          const childRef = kids[i];
          assign(childRef.colId, depth + 1, childTop);
          childCenters.push(pos[childRef.colId].centerY);
          childTop += subtreeSpan(childRef.colId);
          if (i < kids.length - 1) childTop += gapBetweenRefs(childRef, kids[i + 1]);
        }

        centerY = (Math.min(...childCenters) + Math.max(...childCenters)) / 2;
      }

      const selfH = columnHeight(colId);
      const { nodeId, setId } = parseColumnId(colId);
      pos[colId] = {
        x: depth * COL_X_STEP,
        centerY,
        yTop: centerY - selfH / 2,
        depth,
        nodeId,
        setId
      };
    };

    const rootColIds = getColumnIdsForNode(rootId).filter((cid) => visibleCols.has(cid));
    const rootRefs = rootColIds.map((colId) => ({ colId, ownerKey: rootId }));
    let rootTotal = 0;
    for (let i = 0; i < rootRefs.length; i++) {
      rootTotal += subtreeSpan(rootRefs[i].colId);
      if (i < rootRefs.length - 1) rootTotal += gapBetweenRefs(rootRefs[i], rootRefs[i + 1]);
    }

    let rootTop = topY0;
    for (let i = 0; i < rootRefs.length; i++) {
      const rootRef = rootRefs[i];
      assign(rootRef.colId, 0, rootTop);
      rootTop += subtreeSpan(rootRef.colId);
      if (i < rootRefs.length - 1) rootTop += gapBetweenRefs(rootRef, rootRefs[i + 1]);
    }

    // prune (safety)
    for (const k of Object.keys(pos)) {
      if (!visibleCols.has(k)) delete pos[k];
    }

    return {
      pos,
      span: rootTotal || columnHeight(makeColumnId(rootId, getDefaultSetId(getNode(rootId)))),
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
    const starColId = starRootId ? makeColumnId(starRootId, getDefaultSetId(starNode)) : "";
    const starHasChildren = !!starColId && getColumnChildren(starColId).length > 0;
    if (starRootId && starHasChildren) {
      let maxDepth = 0;
      for (const p of Object.values(pos)) {
        if (!p) continue;
        if (typeof p.depth === "number") maxDepth = Math.max(maxDepth, p.depth);
      }

      const starDepth = maxDepth + 1;
      const starX = starDepth * COL_X_STEP;
      const starH = columnHeight(starColId);
      const starYTop = rootTopY + Math.max(0, (span - starH) / 2);
      const starCenterY = starYTop + starH / 2;

      allPos[starColId] = {
        x: starX,
        yTop: starYTop,
        centerY: starCenterY,
        depth: starDepth,
        nodeId: starRootId,
        setId: getDefaultSetId(starNode)
      };
    }

    topY += span + rootGap;
  }

  // Legacy STAR column (fallback)
  if (legacyStarRootId && state.nodes[legacyStarRootId]) {
    const legacyStarColId = makeColumnId(
      legacyStarRootId,
      getDefaultSetId(state.nodes[legacyStarRootId])
    );
    let maxDepth = 0;
    for (const p of Object.values(allPos)) {
      if (!p) continue;
      if (typeof p.depth === "number") maxDepth = Math.max(maxDepth, p.depth);
    }

    const starDepth = maxDepth + 1;
    const starX = starDepth * COL_X_STEP;
    const starH = columnHeight(legacyStarColId);
    const starYTop = 0;
    const starCenterY = starYTop + starH / 2;

    allPos[legacyStarColId] = {
      x: starX,
      yTop: starYTop,
      centerY: starCenterY,
      depth: starDepth,
      nodeId: legacyStarRootId,
      setId: getDefaultSetId(state.nodes[legacyStarRootId])
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
      sameParentSetGap,
      rootGap
    }
  };
}
