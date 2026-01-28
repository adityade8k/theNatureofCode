// src/tree/interactions.js

export function attachPanZoom({
  canvasEl,
  viewportEl,
  wiresEl,
  state,
  minZoom,
  maxZoom
}) {
  let enabled = true;

  // Allow constructor-provided limits (viewer uses config)
  let zoomMin = typeof minZoom === "number" ? minZoom : 0.25;
  let zoomMax = typeof maxZoom === "number" ? maxZoom : 2.5;

  let isPanning = false;
  let last = { x: 0, y: 0 };

  let animRaf = null;

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function applyTransform() {
    const t = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
    viewportEl.style.transform = t;
    wiresEl.style.transform = t;
  }

  function cancelAnimation() {
    if (animRaf) {
      cancelAnimationFrame(animRaf);
      animRaf = null;
    }
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) isPanning = false;
  }

  // Supports:
  //  - setZoomLimits({min, max})
  //  - setZoomLimits(min, max)
  function setZoomLimits(a, b) {
    let min, max;

    if (typeof a === "object" && a) {
      min = a.min;
      max = a.max;
    } else {
      min = a;
      max = b;
    }

    if (typeof min === "number") zoomMin = min;
    if (typeof max === "number") zoomMax = max;

    if (zoomMin > zoomMax) {
      const tmp = zoomMin;
      zoomMin = zoomMax;
      zoomMax = tmp;
    }

    state.zoom = clamp(state.zoom, zoomMin, zoomMax);
    applyTransform();
  }

  function setView({ pan, zoom }) {
    if (pan && typeof pan.x === "number" && typeof pan.y === "number") {
      state.pan.x = pan.x;
      state.pan.y = pan.y;
    }
    if (typeof zoom === "number") {
      state.zoom = clamp(zoom, zoomMin, zoomMax);
    }
    applyTransform();
  }

  // main.js expects this name
  function setCamera({ x, y, zoom }) {
    setView({
      pan: {
        x: typeof x === "number" ? x : state.pan.x,
        y: typeof y === "number" ? y : state.pan.y
      },
      zoom: typeof zoom === "number" ? zoom : state.zoom
    });
  }

  function zoomAboutPoint(newZoom, screenX, screenY) {
    const oldZoom = state.zoom;
    const z = clamp(newZoom, zoomMin, zoomMax);
    if (z === oldZoom) return;

    const worldX = (screenX - state.pan.x) / oldZoom;
    const worldY = (screenY - state.pan.y) / oldZoom;

    state.zoom = z;

    state.pan.x = screenX - worldX * z;
    state.pan.y = screenY - worldY * z;
  }

  function getCanvasLocalXY(clientX, clientY) {
    const r = canvasEl.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function animateTo({
    pan,
    zoom,
    duration = 900,
    easing = easeInOutCubic,
    lock = true,
    onDone
  }) {
    cancelAnimation();

    const startPan = { x: state.pan.x, y: state.pan.y };
    const startZoom = state.zoom;

    const endPan = {
      x: typeof pan?.x === "number" ? pan.x : startPan.x,
      y: typeof pan?.y === "number" ? pan.y : startPan.y
    };
    const endZoom =
      typeof zoom === "number" ? clamp(zoom, zoomMin, zoomMax) : startZoom;

    const t0 = performance.now();
    if (lock) setEnabled(false);

    function tick(now) {
      const raw = (now - t0) / Math.max(1, duration);
      const t = raw >= 1 ? 1 : raw;
      const k = easing(t);

      state.pan.x = startPan.x + (endPan.x - startPan.x) * k;
      state.pan.y = startPan.y + (endPan.y - startPan.y) * k;
      state.zoom = startZoom + (endZoom - startZoom) * k;

      applyTransform();

      if (t < 1) {
        animRaf = requestAnimationFrame(tick);
      } else {
        animRaf = null;
        if (lock) setEnabled(true);
        onDone?.();
      }
    }

    animRaf = requestAnimationFrame(tick);
  }

  // -----------------------------
  // Mouse
  // -----------------------------
  canvasEl.addEventListener("mousedown", (e) => {
    if (!enabled) return;
    if (e.button !== 0) return;
    if (e.target.closest("button")) return;
    if (e.target.closest(".modal, .modal-overlay")) return;

    isPanning = true;
    last = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener("mousemove", (e) => {
    if (!enabled) return;
    if (!isPanning) return;

    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };

    state.pan.x += dx;
    state.pan.y += dy;

    applyTransform();
  });

  window.addEventListener("mouseup", () => {
    isPanning = false;
  });

  canvasEl.addEventListener(
    "wheel",
    (e) => {
      if (!enabled) return;
      e.preventDefault();

      const { x, y } = getCanvasLocalXY(e.clientX, e.clientY);
      const zoomFactor = Math.exp(-e.deltaY * 0.001);

      zoomAboutPoint(state.zoom * zoomFactor, x, y);
      applyTransform();
    },
    { passive: false }
  );

  // Ensure state respects limits on init
  state.zoom = clamp(state.zoom, zoomMin, zoomMax);
  applyTransform();

  return {
    applyTransform,
    setEnabled,
    setZoomLimits,
    setView,
    setCamera,
    animateTo
  };
}
