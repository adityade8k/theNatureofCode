export const LEGACY_STAR_ROOT_ID = "__STARRED__";
export const STAR_ROOT_PREFIX = "__STARRED__:";

export function isStarRootId(id) {
  return id === LEGACY_STAR_ROOT_ID || id.startsWith(STAR_ROOT_PREFIX);
}

export function isStarRootNode(node, id = "") {
  if (!node) return false;
  if (node.kind === "root-star") return true;
  return id ? isStarRootId(id) : false;
}

export function getStarRootIdForRoot(rootId) {
  return `${STAR_ROOT_PREFIX}${rootId}`;
}

export function ensureStarRootForRoot(state, rootId) {
  if (!rootId) return null;
  const id = getStarRootIdForRoot(rootId);
  if (!state.nodes[id]) {
    state.nodes[id] = {
      id,
      label: id,
      title: "Starred",
      description: "",
      children: [],
      expandedChildren: new Set(),
      files: {},
      thumbnailPath: "",
      kind: "root-star",
      starForRoot: rootId
    };
  }

  const node = state.nodes[id];
  node.children = Array.isArray(node.children) ? node.children : [];
  node.expandedChildren = node.expandedChildren instanceof Set
    ? node.expandedChildren
    : new Set(Array.isArray(node.expandedChildren) ? node.expandedChildren : []);
  node.kind = node.kind || "root-star";
  node.starForRoot = node.starForRoot || rootId;

  return id;
}

export function getStarRootIds(state) {
  return Object.entries(state.nodes || {})
    .filter(([id, node]) => isStarRootNode(node, id))
    .map(([id]) => id);
}

export function findParentColumnId(state, childId) {
  for (const [id, node] of Object.entries(state.nodes || {})) {
    if (!node?.children) continue;
    if (node.children.includes(childId)) return id;
  }
  return null;
}

export function findRootForNode(state, nodeId) {
  if (!nodeId) return null;

  let current = nodeId;
  let guard = 0;

  while (current && guard++ < 10000) {
    const parentId = findParentColumnId(state, current);
    if (!parentId) {
      const n = state.nodes[current];
      return n?.kind === "root" ? current : null;
    }

    const parent = state.nodes[parentId];
    if (parent?.kind === "root") return parentId;
    current = parentId;
  }

  return null;
}

export function normalizeStarRoots(state) {
  state.roots = Array.isArray(state.roots) ? state.roots : [];
  state.nodes = state.nodes || {};

  const legacy = state.nodes[LEGACY_STAR_ROOT_ID];
  const legacyChildren = Array.isArray(legacy?.children) ? legacy.children : [];

  for (const starId of legacyChildren) {
    const starNode = state.nodes[starId];
    if (!starNode || starNode.kind !== "star") continue;

    const rootId = findRootForNode(state, starNode.sourceId);
    if (!rootId) continue;

    const starRootId = ensureStarRootForRoot(state, rootId);
    const starRoot = state.nodes[starRootId];
    if (!starRoot.children.includes(starId)) starRoot.children.push(starId);
  }

  if (legacy) delete state.nodes[LEGACY_STAR_ROOT_ID];

  state.roots = state.roots.filter((rid) => {
    const node = state.nodes[rid];
    return node && !isStarRootNode(node, rid);
  });

  for (const [id, node] of Object.entries(state.nodes)) {
    if (!isStarRootNode(node, id)) continue;
    node.children = Array.isArray(node.children) ? node.children : [];
    node.expandedChildren = node.expandedChildren instanceof Set
      ? node.expandedChildren
      : new Set(Array.isArray(node.expandedChildren) ? node.expandedChildren : []);
    if (!node.starForRoot && id.startsWith(STAR_ROOT_PREFIX)) {
      node.starForRoot = id.slice(STAR_ROOT_PREFIX.length);
    }
  }
}

