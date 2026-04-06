export const DEFAULT_CHILD_SET_ID = "default";
const COLUMN_DELIMITER = "::";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSetId(rawId, index) {
  const id = String(rawId || "").trim();
  if (id) return id;
  return index === 0 ? DEFAULT_CHILD_SET_ID : `${DEFAULT_CHILD_SET_ID}-${index + 1}`;
}

function normalizeSetLabel(rawLabel, index) {
  const label = String(rawLabel || "").trim();
  if (label) return label;
  return index === 0 ? "Children" : `Children ${index + 1}`;
}

function flattenChildSets(childSets) {
  const out = [];
  for (const set of childSets) {
    for (const childId of toArray(set?.children)) out.push(childId);
  }
  return out;
}

export function normalizeNodeChildSets(node) {
  const hadExplicitSets = Array.isArray(node?.childSets);
  const legacyChildren = toArray(node?.children);
  const rawSets = hadExplicitSets
    ? node.childSets
    : [
      {
        id: DEFAULT_CHILD_SET_ID,
        label: "Children",
        children: legacyChildren
      }
    ];

  const seenInNode = new Set();
  const normalizedSets = [];

  for (let i = 0; i < rawSets.length; i++) {
    const raw = rawSets[i] || {};
    const setId = normalizeSetId(raw.id, i);
    const label = normalizeSetLabel(raw.label, i);

    const dedupedChildren = [];
    for (const childId of toArray(raw.children)) {
      if (typeof childId !== "string" || !childId) continue;
      if (seenInNode.has(childId)) continue;
      seenInNode.add(childId);
      dedupedChildren.push(childId);
    }

    normalizedSets.push({
      id: setId,
      label,
      children: dedupedChildren
    });
  }

  if (!hadExplicitSets && normalizedSets.length === 0) {
    normalizedSets.push({
      id: DEFAULT_CHILD_SET_ID,
      label: "Children",
      children: []
    });
  }

  node.childSets = normalizedSets;
  node.children = flattenChildSets(normalizedSets); // legacy compatibility mirror
}

export function getNodeChildSets(node) {
  if (!node) return [];
  if (Array.isArray(node.childSets)) {
    return node.childSets.map((set, i) => ({
      id: normalizeSetId(set?.id, i),
      label: normalizeSetLabel(set?.label, i),
      children: toArray(set?.children)
    }));
  }
  return [
    {
      id: DEFAULT_CHILD_SET_ID,
      label: "Children",
      children: toArray(node.children)
    }
  ];
}

export function getNodeChildren(node) {
  if (!node) return [];
  return flattenChildSets(getNodeChildSets(node));
}

export function getChildrenForSet(node, setId) {
  const sets = getNodeChildSets(node);
  const target = sets.find((s) => s.id === setId) || sets[0];
  return toArray(target?.children);
}

export function getDefaultSetId(node) {
  const sets = getNodeChildSets(node);
  return sets[0]?.id || DEFAULT_CHILD_SET_ID;
}

export function makeColumnId(nodeId, setId = DEFAULT_CHILD_SET_ID) {
  return `${nodeId}${COLUMN_DELIMITER}${setId}`;
}

export function parseColumnId(columnId) {
  if (typeof columnId !== "string") {
    return { nodeId: String(columnId || ""), setId: DEFAULT_CHILD_SET_ID };
  }
  const i = columnId.indexOf(COLUMN_DELIMITER);
  if (i < 0) return { nodeId: columnId, setId: DEFAULT_CHILD_SET_ID };
  return {
    nodeId: columnId.slice(0, i),
    setId: columnId.slice(i + COLUMN_DELIMITER.length) || DEFAULT_CHILD_SET_ID
  };
}

export function findChildSetIdForChild(node, childId) {
  if (!node || !Array.isArray(node.childSets)) return null;
  for (const set of node.childSets) {
    if (toArray(set?.children).includes(childId)) return set.id || DEFAULT_CHILD_SET_ID;
  }
  return null;
}

export function removeChildFromNode(node, childId) {
  if (!node || !childId) return false;
  let removed = false;

  if (Array.isArray(node.childSets)) {
    for (const set of node.childSets) {
      const before = toArray(set.children);
      const next = before.filter((id) => id !== childId);
      if (next.length !== before.length) {
        set.children = next;
        removed = true;
      }
    }
  }

  if (Array.isArray(node.children)) {
    const next = node.children.filter((id) => id !== childId);
    if (next.length !== node.children.length) {
      node.children = next;
      removed = true;
    }
  }

  return removed;
}

export function enforceSingleParentInvariant(state) {
  const ownerByChild = new Map(); // childId -> { parentId, setId }
  const dropped = [];

  for (const [parentId, node] of Object.entries(state?.nodes || {})) {
    normalizeNodeChildSets(node);

    for (const set of node.childSets) {
      const nextChildren = [];
      for (const childId of toArray(set.children)) {
        const existing = ownerByChild.get(childId);
        if (!existing) {
          ownerByChild.set(childId, { parentId, setId: set.id || DEFAULT_CHILD_SET_ID });
          nextChildren.push(childId);
          continue;
        }

        // Keep first owner, drop all duplicates (same parent or different parent).
        dropped.push({
          childId,
          droppedFromParentId: parentId,
          keptAtParentId: existing.parentId
        });
      }
      set.children = nextChildren;
    }

    node.children = getNodeChildren(node);
  }

  return dropped;
}

