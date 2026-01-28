/**
 * p5 Runner in an iframe using srcdoc.
 *
 * Goals:
 * 1) If user provides index.html, preview should show the FULL HTML page (like p5 web editor).
 * 2) Thumbnail capture + hover preview MUST still work reliably.
 * 3) Fullscreen canvas styling should ONLY apply to our fallback shell, not user HTML layouts.
 *
 * New:
 * - fitToFrame (opt-in): used ONLY for starred hover tiles so the canvas fits the tile.
 */

export function createP5Runner({ iframeEl, fitToFrame = false }) {
  let thumbHandlers = new Set();
  let errorHandlers = new Set();
  let consoleHandlers = new Set();
  let canvasDimHandlers = new Set();

  function run({ nodeId, files }) {
    iframeEl.srcdoc = buildSrcdoc({ nodeId, files: files || {}, fitToFrame });
  }

  function stop() {
    iframeEl.srcdoc =
      `<!doctype html><html><body style="margin:0;background:#000;"></body></html>`;
  }

  function requestThumbnail(nonce = null) {
    try {
      iframeEl.contentWindow?.postMessage({ type: "REQ_THUMB", nonce }, "*");
    } catch (_) {}
  }

  function pause() {
    try {
      iframeEl.contentWindow?.postMessage({ type: "P5_PAUSE" }, "*");
    } catch (_) {}
  }

  function resume() {
    try {
      iframeEl.contentWindow?.postMessage({ type: "P5_RESUME" }, "*");
    } catch (_) {}
  }

  function onThumb(fn) {
    thumbHandlers.add(fn);
    return () => thumbHandlers.delete(fn);
  }

  function onError(fn) {
    errorHandlers.add(fn);
    return () => errorHandlers.delete(fn);
  }

  function onConsole(fn) {
    consoleHandlers.add(fn);
    return () => consoleHandlers.delete(fn);
  }

  function onCanvasDim(fn) {
    canvasDimHandlers.add(fn);
    return () => canvasDimHandlers.delete(fn);
  }

  function handleMessage(ev) {
    const msg = ev.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "P5_THUMB") {
      for (const fn of thumbHandlers) fn(msg.nodeId, msg.dataUrl, msg.nonce ?? null);
    }

    if (msg.type === "P5_THUMB_ERR") {
      for (const fn of errorHandlers) fn(msg.nodeId, msg.error, msg.nonce ?? null);
    }

    if (msg.type === "CONSOLE_LOG" || msg.type === "CONSOLE_WARN" || msg.type === "CONSOLE_ERROR") {
      const level = msg.type.replace("CONSOLE_", "").toLowerCase();
      for (const fn of consoleHandlers) fn({ level, args: msg.args || [] });
    }

    if (msg.type === "P5_CANVAS_DIM") {
      for (const fn of canvasDimHandlers) fn(msg.nodeId, msg.width, msg.height);
    }
  }

  window.addEventListener("message", handleMessage);

  function destroy() {
    window.removeEventListener("message", handleMessage);
    thumbHandlers.clear();
    errorHandlers.clear();
    consoleHandlers.clear();
    canvasDimHandlers.clear();
  }

  return {
    run,
    stop,
    requestThumbnail,
    pause,
    resume,
    onThumb,
    onError,
    onConsole,
    onCanvasDim,
    destroy
  };
}

/* -------------------------------------------------- */
/* iframe srcdoc builder */
/* -------------------------------------------------- */

function buildSrcdoc({ nodeId, files, fitToFrame = false }) {
  const cssText = buildCss(files, fitToFrame);
  const jsText = buildJs(files);
  const userHtml = files["index.html"];

  if (typeof userHtml === "string" && userHtml.trim()) {
    return buildFromUserIndexHtml({ nodeId, indexHtml: userHtml, cssText, jsText, files, fitToFrame });
  }

  return buildFallbackShell({ nodeId, cssText, jsText });
}

function buildCss(files, fitToFrame) {
  // IMPORTANT:
  // - Only fullscreen-canvas rules apply to fallback shell (.__p5runner)
  // - User-provided index.html pages should render their own layout normally.
  // - Fit-to-frame mode is opt-in and only applies when we add __p5fit to html/body.
  const parts = [
    `
html.__p5runner, body.__p5runner {
  width:100%;
  height:100%;
  margin:0;
  background:#000;
  overflow:hidden;
}

/* Only stretch canvas in fallback mode */
body.__p5runner canvas {
  width:100% !important;
  height:100% !important;
  display:block;
}

/* Fit-to-frame mode (used by starred hover tiles).
   Applied only when we add the __p5fit class to html/body in the srcdoc. */
html.__p5fit, body.__p5fit {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  background: #000;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}

/* Force the primary canvas to fill the iframe perfectly */
body.__p5fit {
  display: flex;
  align-items: center;
  justify-content: center;
}

body.__p5fit canvas {
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  max-height: 100% !important;
  display: block !important;
  object-fit: contain;
  margin: 0 !important;
  padding: 0 !important;
  position: absolute;
  top: 0;
  left: 0;
}

/* For starred tiles, let canvas be natural size (no fit-to-frame) */
html:not(.__p5fit) body:not(.__p5fit) {
  margin: 0;
  padding: 0;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

html:not(.__p5fit) body:not(.__p5fit) canvas {
  display: block;
  margin: 0 auto;
}
`
  ];

  for (const [p, c] of Object.entries(files)) {
    if (p.endsWith(".css")) parts.push(`/* ${p} */\n${c}`);
  }

  return parts.join("\n");
}

function buildJs(files) {
  const paths = Object.keys(files).filter(p => p.endsWith(".js"));
  const ordered = paths.includes("sketch.js")
    ? [...paths.filter(p => p !== "sketch.js"), "sketch.js"]
    : paths;

  return ordered.map(p => `// ${p}\n${files[p] || ""}`).join("\n");
}

function buildConsoleInterceptionScript() {
  // Console interception must run FIRST, before any user scripts
  // This ensures all console.log calls are captured
  return `
<script>
(function(){
  // Intercept console methods IMMEDIATELY (before any user scripts run)
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  function sendConsole(level, args) {
    try {
      parent.postMessage({
        type: "CONSOLE_" + level.toUpperCase(),
        args: Array.from(args).map(arg => {
          if (typeof arg === "object" && arg !== null) {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
      }, "*");
    } catch (e) {
      // Ignore errors
    }
  }

  console.log = function(...args) {
    originalLog.apply(console, args);
    sendConsole("log", args);
  };

  console.warn = function(...args) {
    originalWarn.apply(console, args);
    sendConsole("warn", args);
  };

  console.error = function(...args) {
    originalError.apply(console, args);
    sendConsole("error", args);
  };

  // Catch uncaught errors
  window.addEventListener("error", (e) => {
    // Handle image loading errors specifically
    if (e.target && e.target.tagName === 'IMG') {
      const imgSrc = e.target.src || e.target.getAttribute('src') || 'unknown';
      sendConsole("error", ["Failed to load image: " + imgSrc, e.filename + ":" + e.lineno]);
    } else {
      sendConsole("error", [e.message || String(e), e.filename + ":" + e.lineno]);
    }
  });

  // Catch unhandled promise rejections
  window.addEventListener("unhandledrejection", (e) => {
    sendConsole("error", ["Unhandled promise rejection:", e.reason]);
  });
})();
</script>`;
}

function buildThumbBridgeScript({ nodeId }) {
  // Reliable thumbnail sending:
  // - On REQ_THUMB, retry until canvas exists (p5 may not have created it yet)
  // - Always reply either P5_THUMB or P5_THUMB_ERR (so parent never hangs)
  return `
<script>
(function(){
  function findCanvas() {
    // p5 default canvas is just <canvas> appended to body; also allow multiple canvases
    const c = document.querySelector("canvas");
    return c || null;
  }

  function sendThumb(nonce) {
    const c = findCanvas();
    if (!c) {
      parent.postMessage({
        type: "P5_THUMB_ERR",
        nodeId: "${nodeId}",
        error: "No canvas found",
        nonce
      }, "*");
      return;
    }
    try {
      parent.postMessage({
        type: "P5_THUMB",
        nodeId: "${nodeId}",
        dataUrl: c.toDataURL("image/png"),
        nonce
      }, "*");
    } catch (e) {
      parent.postMessage({
        type: "P5_THUMB_ERR",
        nodeId: "${nodeId}",
        error: String(e),
        nonce
      }, "*");
    }
  }

  function sendCanvasDimensions() {
    const c = findCanvas();
    if (c) {
      parent.postMessage({
        type: "P5_CANVAS_DIM",
        nodeId: "${nodeId}",
        width: c.width,
        height: c.height
      }, "*");
    }
  }

  function sendThumbWhenReady(nonce) {
    // retry for up to ~1s (20 * 50ms)
    let tries = 0;
    const maxTries = 20;

    function tick() {
      const c = findCanvas();
      if (c) {
        // wait a frame so it has a chance to draw at least once
        requestAnimationFrame(() => {
          sendThumb(nonce);
          sendCanvasDimensions();
        });
        return;
      }
      tries++;
      if (tries >= maxTries) {
        parent.postMessage({
          type: "P5_THUMB_ERR",
          nodeId: "${nodeId}",
          error: "Canvas not created in time",
          nonce
        }, "*");
        return;
      }
      setTimeout(tick, 50);
    }

    tick();
  }

  // Send canvas dimensions when canvas is ready (for starred tiles)
  let dimsSent = false;
  function trySendCanvasDims() {
    const c = findCanvas();
    if (c && !dimsSent) {
      dimsSent = true;
      // Wait a frame to ensure canvas is fully initialized
      requestAnimationFrame(() => {
        sendCanvasDimensions();
      });
    }
  }
  
  // Try to send dimensions periodically until canvas is ready
  const dimsInterval = setInterval(() => {
    trySendCanvasDims();
    if (dimsSent) clearInterval(dimsInterval);
  }, 50);
  
  // Also try on window load
  if (document.readyState === "complete") {
    trySendCanvasDims();
  } else {
    window.addEventListener("load", trySendCanvasDims);
  }

  window.addEventListener("message", function(ev){
    const d = ev.data;
    if (!d || typeof d !== "object") return;

    if (d.type === "REQ_THUMB") {
      sendThumbWhenReady(d.nonce ?? null);
    }

    if (d.type === "P5_PAUSE" && window.noLoop) window.noLoop();
    if (d.type === "P5_RESUME" && window.loop) window.loop();
  });
})();
</script>
`;
}

function buildFromUserIndexHtml({ nodeId, indexHtml, cssText, jsText, files, fitToFrame = false }) {
  let html = indexHtml;

  // Ensure head/body exist
  if (!/<head/i.test(html)) html = html.replace(/<html[^>]*>/i, "$&<head></head>");
  if (!/<body/i.test(html)) html = html.replace(/<\/head>/i, "</head><body></body>");

  // CRITICAL: Inject console interception FIRST in <head> before any user scripts
  // This ensures console.log calls from scripts in <head> are captured
  html = html.replace(/<head[^>]*>/i, "$&" + buildConsoleInterceptionScript());

  // If requested, force-fit the sketch to the iframe (used by starred hover tiles).
  // This is opt-in so normal editor/viewer previews (p5 web-editor-like) are unaffected.
  if (fitToFrame) {
    html = addClassToTag(html, "html", "__p5fit");
    html = addClassToTag(html, "body", "__p5fit");
  }

  // Replace CSS links with inline styles
  html = html.replace(/<link[^>]*href=["']([^"']*\.css)["'][^>]*>/gi, (match, href) => {
    // Try exact path first, then filename only
    const cssContent = files[href] || files[href.split("/").pop()] || "";
    return cssContent ? `<style>${cssContent}</style>` : match;
  });

  // Replace JS script src with inline scripts (but preserve p5 CDN and handle uploaded files)
  // Use a more flexible regex that handles multi-line script tags
  html = html.replace(/<script([^>]*?)src=["']([^"']*\.js)["']([^>]*?)><\/script>/gis, (match, before, src, after) => {
    // Keep p5 CDN links and external URLs
    if (src.includes("cdn.jsdelivr.net") || src.includes("p5") || src.startsWith("http") || src.startsWith("//")) {
      return match;
    }
    
    // Normalize the path (remove leading slashes and trailing whitespace)
    const normalizedSrc = src.trim().replace(/^\/+/, "");
    const fileName = normalizedSrc.split("/").pop();
    
    // Try multiple path variations to find the file
    let jsContent = null;
    const possibleKeys = [
      normalizedSrc,
      src,
      fileName,
      src.trim(),
      `/${normalizedSrc}`,
      normalizedSrc.replace(/^\.\//, ""), // Remove ./ prefix if present
    ];
    
    for (const key of possibleKeys) {
      if (files[key] !== undefined) {
        jsContent = files[key];
        break;
      }
    }
    
    // Check if it's an uploaded file (starts with #UPLOADED_FILE#)
    if (typeof jsContent === 'string' && jsContent.startsWith('#UPLOADED_FILE#')) {
      // For uploaded files, change src to point to /file/ endpoint
      return `<script${before}src="/file/${normalizedSrc}"${after}></script>`;
    }
    
    // Regular file - inline it
    if (jsContent && typeof jsContent === 'string' && !jsContent.startsWith('#UPLOADED_FILE#')) {
      // Escape </script> tags to prevent breaking HTML
      const escaped = jsContent.replace(/<\/script>/gi, '<\\/script>');
      return `<script>${escaped}</script>`;
    }
    
    // File not found - keep original (might be a runtime error, but don't break HTML)
    return match;
  });
  
  // Build list of uploaded files (files that start with #UPLOADED_FILE#)
  const uploadedFiles = [];
  for (const [logicalPath, content] of Object.entries(files)) {
    if (typeof content === 'string' && content.startsWith('#UPLOADED_FILE#')) {
      uploadedFiles.push(logicalPath);
      // Also add filename only
      const fileName = logicalPath.split('/').pop();
      if (fileName && fileName !== logicalPath) {
        uploadedFiles.push(fileName);
      }
    }
  }
  
  // Inject asset server that uses /file/ endpoint for all uploaded files
  // The /file/ endpoint will look up the mapping on the server
  // IMPORTANT: This must run BEFORE p5.js loads
  if (uploadedFiles.length > 0) {
    const uploadedFilesJson = JSON.stringify(uploadedFiles).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
    
    // Build asset mapping from files (logical name -> actual filename)
    const assetMapping = {};
    for (const [logicalPath, content] of Object.entries(files)) {
      if (typeof content === 'string' && content.startsWith('#UPLOADED_FILE#')) {
        const parts = content.split('#');
        if (parts.length >= 3) {
          const serverPath = parts[2].trim();
          const fileName = serverPath.startsWith('assets/') 
            ? serverPath.substring(7) 
            : serverPath.split('/').pop();
          assetMapping[logicalPath] = fileName;
          assetMapping[logicalPath.split('/').pop()] = fileName; // Also map by filename
        }
      }
    }
    const assetMappingJson = JSON.stringify(assetMapping).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
    
    const assetServerScript = `<script>
(function() {
  const uploadedFiles = ${uploadedFilesJson};
  const uploadedFilesSet = new Set(uploadedFiles);
  const assetMapping = ${assetMappingJson};
  
  // Check if a path is one of our uploaded files
  function isUploadedFile(path) {
    if (!path || typeof path !== 'string') return false;
    // Normalize path - remove leading slashes and /editor/ prefix
    // Use string methods instead of regex to avoid template literal issues
    let normalized = path;
    while (normalized.startsWith('/')) {
      normalized = normalized.substring(1);
    }
    if (normalized.startsWith('editor/')) {
      normalized = normalized.substring(7);
    }
    const fileName = normalized.split('/').pop();
    return uploadedFilesSet.has(normalized) || uploadedFilesSet.has(fileName) || uploadedFilesSet.has(path) || uploadedFilesSet.has(path.split('/').pop());
  }
  
  // Normalize a path to use with /file/ endpoint
  // In development: use /api/file/ (proxied to Express)
  // In production: use /assets/ with actual filename from mapping
  function normalizeToFilePath(path) {
    if (!path || typeof path !== 'string') return path;
    // Use string methods instead of regex to avoid template literal issues
    let normalized = path;
    while (normalized.startsWith('/')) {
      normalized = normalized.substring(1);
    }
    if (normalized.startsWith('editor/')) {
      normalized = normalized.substring(7);
    }
    
    // In development, proxy through /api/file/ to Express
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isDev) {
      return '/api/file/' + normalized;
    } else {
      // In production, use asset mapping to get actual filename
      // The mapping is injected directly into the iframe srcdoc
      const actualFileName = assetMapping[normalized] || assetMapping[normalized.split('/').pop()] || normalized;
      return '/assets/' + actualFileName;
    }
  }
  
  // Override XMLHttpRequest to intercept all HTTP requests (p5 uses this for assets)
  const OriginalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new OriginalXHR();
    const originalOpen = xhr.open;
    xhr.open = function(method, url, ...args) {
      if (typeof url === 'string' && !url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('/file/')) {
        if (isUploadedFile(url)) {
          url = normalizeToFilePath(url);
        }
      }
      return originalOpen.call(this, method, url, ...args);
    };
    return xhr;
  };
  
  // Override fetch for other asset loading
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string' && !input.startsWith('http') && !input.startsWith('data:') && !input.startsWith('/file/')) {
      if (isUploadedFile(input)) {
        const filePath = normalizeToFilePath(input);
        return originalFetch.call(this, filePath, init);
      }
    }
    return originalFetch.apply(this, arguments);
  };
  
  // Override p5's loadImage - this is the main way p5 loads images
  // Set up the override immediately and also when p5 loads
  function setupLoadImageOverride() {
    if (typeof window.loadImage === 'function') {
      const originalLoadImage = window.loadImage;
      window.loadImage = function(path, successCallback, failureCallback) {
        if (isUploadedFile(path)) {
          const filePath = normalizeToFilePath(path);
          return originalLoadImage.call(this, filePath, successCallback, failureCallback);
        }
        return originalLoadImage.apply(this, arguments);
      };
      return true;
    }
    return false;
  }
  
  // Set up loadImage override immediately and also when p5 loads
  // This must happen BEFORE p5.js script runs
  window.__p5AssetOverride = setupLoadImageOverride;
  
  // Try to set up immediately (in case p5 is already loaded)
  setupLoadImageOverride();
  
  // Also intercept p5's internal image loading by overriding Image constructor
  // This catches images created before loadImage override is set up
  const OriginalImage = window.Image;
  window.Image = function(...args) {
    const img = new OriginalImage(...args);
    // Override src setter to intercept image paths
    let currentSrc = '';
    Object.defineProperty(img, 'src', {
      set: function(value) {
        currentSrc = value;
        if (typeof value === 'string' && isUploadedFile(value)) {
          value = normalizeToFilePath(value);
        }
        img.setAttribute('src', value);
      },
      get: function() {
        return currentSrc || img.getAttribute('src') || '';
      },
      configurable: true,
      enumerable: true
    });
    return img;
  };
  
  // Copy Image static properties
  Object.setPrototypeOf(window.Image, OriginalImage);
  Object.setPrototypeOf(window.Image.prototype, OriginalImage.prototype);
  
  // Fix existing img elements immediately
  function fixExistingImages() {
    document.querySelectorAll('img').forEach(function(img) {
      const src = img.getAttribute('src') || img.src;
      if (src && isUploadedFile(src)) {
        const filePath = normalizeToFilePath(src);
        if (img.src !== filePath && !img.src.includes('/file/')) {
          img.src = filePath;
        }
      }
    });
  }
  
  // Run immediately and also after DOM is ready
  fixExistingImages();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixExistingImages);
  }
  
  // Also watch for new images
  if (window.MutationObserver) {
    const imgObserver = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) {
            if (node.tagName === 'IMG') {
              const src = node.getAttribute('src') || node.src;
              if (src && isUploadedFile(src)) {
                node.src = normalizeToFilePath(src);
              }
            }
            const imgs = node.querySelectorAll && node.querySelectorAll('img');
            if (imgs) {
              imgs.forEach(function(img) {
                const src = img.getAttribute('src') || img.src;
                if (src && isUploadedFile(src)) {
                  img.src = normalizeToFilePath(src);
                }
              });
            }
          }
        });
      });
    });
    
    imgObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }
  
  // Run override immediately and also after p5 loads
  const runOverride = () => {
    if (window.__p5AssetOverride) {
      window.__p5AssetOverride();
    }
    // Also try to set up loadImage override immediately
    setupLoadImageOverride();
  };
  
  // Run immediately
  runOverride();
  
  // Also run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runOverride);
  } else {
    setTimeout(runOverride, 0);
  }
  
  // Also try to run when p5 is loaded (check more frequently at first)
  const checkP5 = setInterval(() => {
    if (window.loadImage && typeof window.loadImage === 'function') {
      if (setupLoadImageOverride()) {
        clearInterval(checkP5);
      }
    }
  }, 10);
  
  setTimeout(() => clearInterval(checkP5), 5000);
})();
</script>`;
    html = html.replace(/<\/head>/i, assetServerScript + "</head>");
  }

  // IMPORTANT: Only use files that are explicitly linked in HTML (like p5 web editor)
  // Do NOT inject CSS or JS files that aren't linked - this simulates a real directory structure

  // Inject: thumb bridge + p5 before </body>
  // Only add p5 if not already present (needed for thumb capture)
  if (!html.includes("p5.min.js") && !html.includes("p5.js")) {
  html = html.replace(
    /<\/body>/i,
    `
${buildThumbBridgeScript({ nodeId })}
<script src="https://cdn.jsdelivr.net/npm/p5@1.9.0/lib/p5.min.js"></script>
</body>`
  );
  } else {
    html = html.replace(/<\/body>/i, `${buildThumbBridgeScript({ nodeId })}\n</body>`);
  }

  // Do NOT inject jsText or cssText automatically
  // Only files explicitly linked in HTML (via <link> or <script src>) are used
  // This matches the behavior of p5 web editor

  return html;
}

function addClassToTag(html, tagName, className) {
  // Adds className to the first <tagName ...> occurrence, preserving existing classes.
  const reTag = new RegExp(`<${tagName}([^>]*)>`, "i");
  const m = html.match(reTag);
  if (!m) return html;

  const attrs = m[1] || "";
  const hasClass = /\sclass\s*=\s*["'][^"']*["']/i.test(attrs);

  if (hasClass) {
    return html.replace(reTag, (full, a) => {
      return `<${tagName}${a.replace(/\sclass\s*=\s*["']([^"']*)["']/i, (m0, cls) => {
        const parts = String(cls).split(/\s+/).filter(Boolean);
        if (!parts.includes(className)) parts.push(className);
        return ` class="${parts.join(" ")}"`;
      })}>`;
    });
  }

  return html.replace(reTag, `<${tagName}${attrs} class="${className}">`);
}

function buildFallbackShell({ nodeId, cssText, jsText }) {
  // Escape </script> tags to prevent breaking HTML
  const escapedJsText = jsText ? jsText.replace(/<\/script>/gi, '<\\/script>') : '';
  return `
<!doctype html>
<html class="__p5runner">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>${cssText || ''}</style>
</head>
<body class="__p5runner">
${buildThumbBridgeScript({ nodeId })}
<script src="https://cdn.jsdelivr.net/npm/p5@1.9.0/lib/p5.min.js"></script>
<script>${escapedJsText}</script>
</body>
</html>`;
}
