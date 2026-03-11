// src/config.js

export const CAMERA_CONFIG = {
  // Treat these as "pan offsets" (translate values) in your current system:
  // transform = translate(pan.x, pan.y) scale(zoom)
  pointA: { x: 500, y: 800 },
  pointB: { x: 250, y: -5900},

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
