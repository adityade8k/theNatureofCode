// src/config.js

export const CAMERA_CONFIG = {
  // Treat these as "pan offsets" (translate values) in your current system:
  // transform = translate(pan.x, pan.y) scale(zoom)
  pointA: { x: 500, y: 800 },
  pointB: { x: 500, y: 800 },

  // Zoom settings
  viewer: {
    startZoom: 0.7,
    endZoom: 0.9,
    introMs: 5000
  },

  editor: {
    zoom: 1.0
  },

  // Zoom clamp
  zoomLimits: {
    min: 0.35,
    max: 2.5
  }
};

export const TREE_LAYOUT_CONFIG = {
  // Tile geometry.
  nodeSize: 90,

  // Vertical gap between tiles inside one visible column.
  gapY: 100,

  // Horizontal gap between parent and child columns.
  // Actual column step is nodeSize + gapX.
  gapX: 180,

  // Height of the editor-only "+" button below a column.
  plusHeight: 44,

  // Vertical gap between expanded child subtrees owned by different child tiles.
  siblingGap: 180,

  // Vertical gap between multiple child-set columns spawned from the same child tile.
  sameParentSetGap: 40,

  // Vertical gap between separate root explorations.
  rootGap: 300
};

export const CANVAS_INTRO_CONFIG = {
  header: {
    text: "the Nature of Code",
    x: -220,
    y: -380
  },
  subheader: {
    text: "Aditya De\nITP | NYU\nSpring 2026",
    x: 1100,
    y: -290
  },
  body: {
    text: `This website began as a simple attempt to document my assignments for The Nature of Code class at NYU ITP. As I continued building it, the project gradually evolved into a code-blogging tool: a space where writing, experimentation, iteration, and outcomes could exist together rather than as separate parts of the learning process.\n\nThe idea draws from my own experience teaching a p5.js curriculum and reflecting on how rapidly AI has transformed education. The leap in AI capability between 2023–24 and 2024–25 made me question what we are really teaching when we teach code today, and what we are actually evaluating when we assess assignments. For me, the answer lies in process. I want to see the path a student took to arrive at an outcome: the experiments they tried, the mistakes they made, the iterations they refined, and the logic they developed along the way.\n\nThe structure of this site was also inspired by my collaboration with Adam Kallish, mentor and friend. He is a Professor of Design at the Institute of Design at Illinois Institute of Technology in Chicago and at BITS Design School in Mumbai. His curriculum is focused on design thinking, and I found his pedagogical methods made documentation and outcome feel like a single streamlined process.\n\nScroll to navigate and drag to zoom. Click on any tile to open the editor and interact with the code. I welcome anyone interested to try this editor themselves by cloning the repository, which contains a blank version of the tool. It runs locally on the user’s device and works offline.`,
    x: -225,
    y: -20,
    width: 1500
  },
  treeStartY: 620
};

export const TILE_INDEX_CONFIG = {
  show: true,
  offsetX: 7,
  color: "rgba(255, 255, 255, 0.58)",
  fontSize: 11,
  fontWeight: 800
};

export const WIRE_CONFIG = {
  svgSize: 50000,
  stroke: "rgba(255,255,255,0.25)",
  strokeWidth: 2,
  sameColumnStroke: "rgba(255,255,255,0.18)",
  sameColumnStrokeWidth: 1.6,
  starStroke: "rgba(255,255,255,0.35)",
  starStrokeWidth: 2.25,
  starDash: "6 6",
  arrowFill: "rgb(255,255,255)",
  arrowMarkerWidth: 6,
  arrowMarkerHeight: 6
};

export const TEXT_BOX_CONFIG = {
  defaultText: "Text box",
  width: 220,
  height: 96,
  minWidth: 80,
  minHeight: 44,
  fontSize: 12,
  minFontSize: 8,
  maxFontSize: 160,
  saveDebounceMs: 180
};

export const CANVAS_IMAGE_CONFIG = {
  width: 240,
  height: 180,
  minWidth: 40,
  minHeight: 40,
  saveDebounceMs: 180
};

export const PAN_ZOOM_CONFIG = {
  minZoom: 0.25,
  maxZoom: 2.5,
  animationMs: 900
};
