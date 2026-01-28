import { createP5Runner } from "./runner.js";
import { createCodeEditor } from "./codeEditor.js";
import { createConsoleDrawer } from "./consoleDrawer.js";
import {
  uploadAsset,
  cleanupViewerAssets,
  createViewerUploadSessionId,
} from "./fileUpload.js";

const CORE_FILES = new Set(["index.html", "style.css", "sketch.js"]);

export function createViewerPanel({ nodeId, getNode, onRequestClose }) {
  const node = getNode(nodeId);

  // Viewer should not mutate persistent data: treat as read-only draft.
  // (Uploads are temp and not stored in node.files.)
  let draft = {
    title: node.title || "",
    description: node.description || "",
    files: { ...(node.files || {}) },
  };

  // Ensure core files exist for safety
  if (!draft.files["index.html"]) {
    draft.files["index.html"] = defaultIndexHtml();
  } else {
    // If HTML exists but is missing the required links, ensure they're present
    let html = draft.files["index.html"];
    let modified = false;
    
    // Check and add style.css link if missing
    if (!html.match(/href=["']style\.css["']/i)) {
      html = html.replace(/<\/head>/i, '    <link rel="stylesheet" href="style.css" />\n  </head>');
      modified = true;
    }
    
    // Check and add p5.js if missing
    const hasP5 = html.includes('p5.min.js') || html.includes('p5.js');
    if (!hasP5) {
      html = html.replace(/<\/body>/i, '    <script src="https://cdn.jsdelivr.net/npm/p5@1.9.0/lib/p5.min.js"></script>\n  </body>');
      modified = true;
    }
    
    // Check and add sketch.js if missing
    if (!html.match(/src=["']sketch\.js["']/i)) {
      html = html.replace(/<\/body>/i, '    <script src="sketch.js"></script>\n  </body>');
      modified = true;
    }
    
    if (modified) {
      draft.files["index.html"] = html;
    }
  }
  if (!draft.files["style.css"]) draft.files["style.css"] = defaultCss();
  if (!draft.files["sketch.js"]) draft.files["sketch.js"] = defaultSketch();

  let activePath = chooseInitialActivePath(draft.files);

  // For temp uploads in viewer mode
  const viewerSessionId = createViewerUploadSessionId();

  // Track thumb just in case (viewer doesn’t save, but runner supports it)
  let lastThumbDataUrl = null;

  // Preview state
  let hasRunOnce = false;
  let isPaused = false;

  // --- DOM ----------------------------------------------------
  const el = document.createElement("div");
  el.className = "panel-root";

  const left = document.createElement("div");
  left.className = "editor-left";

  const right = document.createElement("div");
  right.className = "editor-right";

  // Meta bar (viewer = read-only)
  const metaBar = document.createElement("div");
  metaBar.className = "meta-bar";

  const titleEl = document.createElement("div");
  titleEl.className = "meta-title";
  titleEl.textContent = draft.title || "Untitled";

  const descEl = document.createElement("div");
  descEl.className = "meta-description";
  descEl.textContent = draft.description || "";

  metaBar.appendChild(titleEl);
  metaBar.appendChild(descEl);

  const workspace = document.createElement("div");
  workspace.className = "workspace";

  // File tree pane
  const treePane = document.createElement("div");
  treePane.className = "tree-pane";

  const treeHeader = document.createElement("div");
  treeHeader.className = "editor-files tree-header";

  const treeTitle = document.createElement("div");
  treeTitle.className = "tree-title";
  treeTitle.textContent = "Files";

  const treeBtns = document.createElement("div");
  treeBtns.className = "tree-btns";

  const uploadBtn = miniBtn("Upload", "Upload media to /assets (TEMP in viewer)");
  treeBtns.appendChild(uploadBtn);

  treeHeader.appendChild(treeTitle);
  treeHeader.appendChild(treeBtns);

  const treeList = document.createElement("div");
  treeList.className = "tree-list";

  treePane.appendChild(treeHeader);
  treePane.appendChild(treeList);

  // Hidden upload input
  const uploadInput = document.createElement("input");
  uploadInput.type = "file";
  uploadInput.multiple = true;
  uploadInput.className = "upload-input-hidden";
  uploadInput.accept =
    "image/*,audio/*,video/*,.glb,.gltf,.obj,.mtl,.hdr,.json,.txt,.csv,.mp3,.wav,.ogg,.mp4,.webm,.png,.jpg,.jpeg,.gif,.svg";
  treePane.appendChild(uploadInput);

  // Editor pane
  const editorPane = document.createElement("div");
  editorPane.className = "editor-pane";

  // File bar + controls
  const fileBar = document.createElement("div");
  fileBar.className = "editor-files file-bar";

  const pathLabel = document.createElement("div");
  pathLabel.className = "path-label";
  pathLabel.textContent = activePath;

  const controls = document.createElement("div");
  controls.className = "file-controls";

  const tidyBtn = squareBtn("Tidy", "Tidy code (Prettier)");
  const runBtn = squareBtn("Run", "Run with current code");
  const stopBtn = squareBtn("Stop", "Pause (noLoop) and keep last frame");

  controls.appendChild(tidyBtn);
  controls.appendChild(runBtn);
  controls.appendChild(stopBtn);

  fileBar.appendChild(pathLabel);
  fileBar.appendChild(controls);

  // CodeMirror mount
  const codeMount = document.createElement("div");
  codeMount.className = "code-area code-mount";

  editorPane.appendChild(fileBar);
  editorPane.appendChild(codeMount);

  workspace.appendChild(treePane);
  workspace.appendChild(editorPane);

  left.appendChild(metaBar);
  left.appendChild(workspace);

  // Right: preview + console drawer
  const previewWrap = document.createElement("div");
  previewWrap.className = "preview-wrap";

  const iframe = document.createElement("iframe");
  iframe.className = "preview-iframe";
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
  iframe.setAttribute("referrerpolicy", "no-referrer");

  previewWrap.appendChild(iframe);

  const consoleDrawer = createConsoleDrawer();
  previewWrap.appendChild(consoleDrawer.el);

  right.appendChild(previewWrap);

  const bodyRoot = document.createElement("div");
  bodyRoot.className = "body-root";
  bodyRoot.appendChild(left);
  bodyRoot.appendChild(right);

  el.appendChild(bodyRoot);

  // Footer
  const footerEl = document.createElement("div");
  footerEl.className = "panel-footer";

  const closeBtn = pillBtn("Close");
  closeBtn.title = "Close viewer";

  footerEl.appendChild(closeBtn);

  // --- runner -------------------------------------------------
  const runner = createP5Runner({ iframeEl: iframe });

  runner.onThumb((dataUrl) => {
    lastThumbDataUrl = dataUrl;
  });

  runner.onConsole(({ level, args }) => {
    consoleDrawer.append(level, args);
  });

  if (typeof runner.onError === "function") {
    runner.onError((err) => {
      consoleDrawer.append("error", [err?.message || "Runtime error", err]);
    });
  }

  // --- Code editor init --------------------------------------
  let codeEditor = null;

  const initEditor = async () => {
    codeEditor = await createCodeEditor({
      mountEl: codeMount,
      path: activePath,
      value: draft.files[activePath] ?? "",
      onChange: (val) => {
        // Viewer allows edits locally (not saved)
        draft.files[activePath] = val;
        pausePreviewKeepFrame();
      },
    });
  };

  // --- preview controls --------------------------------------
  function runPreview() {
    if (codeEditor) draft.files[activePath] = codeEditor.getValue();
    runner.run({ nodeId, files: draft.files });
    hasRunOnce = true;
    isPaused = false;
  }

  function pausePreviewKeepFrame() {
    if (!hasRunOnce) return;

    try {
      const w = iframe.contentWindow;
      if (w && typeof w.noLoop === "function") {
        w.noLoop();
        isPaused = true;
        return;
      }
    } catch (_) {}

    isPaused = true;
  }

  runBtn.addEventListener("click", () => runPreview());
  stopBtn.addEventListener("click", () => pausePreviewKeepFrame());

  tidyBtn.addEventListener("click", async () => {
    try {
      const cur = codeEditor ? codeEditor.getValue() : (draft.files[activePath] ?? "");
      const formatted = await tidyWithPrettier(activePath, cur);
      if (formatted != null) {
        if (codeEditor) codeEditor.setValue(formatted);
        draft.files[activePath] = formatted;
        pausePreviewKeepFrame();
      }
    } catch (e) {
      console.error(e);
      const errorMsg = e.message || "Tidy failed. Check console.";
      alert(errorMsg);
      // Also log to console drawer if available
      if (consoleDrawer) {
        consoleDrawer.append("error", [errorMsg]);
      }
    }
  });

  function switchActiveFile(p) {
    if (!p || !draft.files[p]) return;

    // Save current before switching
    if (codeEditor) {
      draft.files[activePath] = codeEditor.getValue();
    }

    activePath = p;
    pathLabel.textContent = activePath;

    if (codeEditor) {
      codeEditor.setPath(activePath);
      codeEditor.setValue(draft.files[activePath] ?? "");
      codeEditor.focus();
    }

    pausePreviewKeepFrame();
    rebuildTreeUI();
  }

  // Upload (TEMP) - add to draft.files temporarily
  uploadBtn.addEventListener("click", () => uploadInput.click());

  uploadInput.addEventListener("change", async () => {
    const files = Array.from(uploadInput.files || []);
    uploadInput.value = "";
    if (!files.length) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading…";

    try {
      for (const f of files) {
        const { path } = await uploadAsset({
          file: f,
          mode: "viewer",
          sessionId: viewerSessionId,
        });

        // Add to draft.files with #UPLOADED_FILE# marker so it can be used in the sketch
        // Use the original filename as the logical path
        const logicalPath = f.name;
        draft.files[logicalPath] = `#UPLOADED_FILE#${path}#`;
        
        consoleDrawer.append("log", [`Uploaded (temp): ${f.name} → ${path}`]);
        
        // Rebuild tree and rerun preview to include the new file
        rebuildTreeUI();
        runPreview();
      }
    } catch (e) {
      console.error(e);
      consoleDrawer.append("error", [`Upload failed: ${e.message}`]);
      alert("Upload failed. Check console.");
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Upload";
    }
  });

  // Close: cleanup temp assets
  async function closeAndCleanup() {
    try {
      await cleanupViewerAssets(viewerSessionId);
    } catch (_) {}
    onRequestClose();
  }

  closeBtn.addEventListener("click", closeAndCleanup);

  // --- File list UI -------------------------------------------
  function rebuildTreeUI() {
    treeList.innerHTML = "";
    const paths = Object.keys(draft.files).sort((a, b) => a.localeCompare(b));

    for (const p of paths) {
      const row = document.createElement("div");
      row.className = "file-row";

      const leftSide = document.createElement("div");
      leftSide.className = "file-row-left";

      const name = document.createElement("div");
      name.className = `file-name ${p === activePath ? "file-name-active" : ""}`;
      name.textContent = p;

      leftSide.appendChild(name);

      leftSide.addEventListener("click", () => {
        switchActiveFile(p);
      });

      // Delete button (disabled for core files)
      const delFileBtn = document.createElement("button");
      delFileBtn.type = "button";
      delFileBtn.className = `btn file-del-btn ${CORE_FILES.has(p) ? "file-del-btn-disabled" : ""}`;
      delFileBtn.textContent = "×";
      delFileBtn.title = CORE_FILES.has(p)
        ? "Core file cannot be deleted"
        : "Delete file (local only)";
      delFileBtn.disabled = CORE_FILES.has(p);

      delFileBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (CORE_FILES.has(p)) return;

        const ok = confirm(`Delete file "${p}"? (Viewer-only, not saved)`);
        if (!ok) return;

        const wasActive = p === activePath;
        delete draft.files[p];

        if (wasActive) {
          const fallback = chooseInitialActivePath(draft.files);
          activePath = fallback;
          pathLabel.textContent = activePath;

          if (codeEditor) {
            codeEditor.setPath(activePath);
            codeEditor.setValue(draft.files[activePath] ?? "");
          }
        }

        pausePreviewKeepFrame();
        rebuildTreeUI();
        // Rerun preview to reflect file deletion
        if (hasRunOnce) {
          runPreview();
        }
      });

      row.appendChild(leftSide);
      row.appendChild(delFileBtn);

      treeList.appendChild(row);
    }
  }

  // --- init ----------------------------------------------------
  (async () => {
    await initEditor();
    rebuildTreeUI();
    runPreview();
  })();

  return {
    el,
    footerEl,
    // allow modal.js to call cleanup if it has hooks:
    cleanup: closeAndCleanup,
  };
}

// --------- prettier tidy ----------
async function tidyWithPrettier(path, code) {
  try {
    const ext = extensionOf(path);
    
    // Check for syntax errors first (for JS files)
    if (ext === "js" || ext === "mjs" || ext === "cjs") {
      try {
        new Function(code);
      } catch (e) {
        if (e instanceof SyntaxError) {
          throw new Error(`Syntax error in code: ${e.message}. Please fix syntax errors before tidying.`);
        }
      }
    }
    
    const prettierMod = await import("https://unpkg.com/prettier@3.3.3/standalone.mjs");
    // Prettier 3.x standalone exports format as default
    const format = prettierMod.default?.format || prettierMod.format || prettierMod.default || prettierMod;

    if (!format || typeof format !== "function") {
      console.error("Prettier module:", prettierMod);
      throw new Error("Prettier format function not found");
    }

    let parser = null;
    let plugins = [];

    if (ext === "js" || ext === "mjs" || ext === "cjs") {
      const babelMod = await import("https://unpkg.com/prettier@3.3.3/plugins/babel.mjs");
      const estreeMod = await import("https://unpkg.com/prettier@3.3.3/plugins/estree.mjs");
      parser = "babel";
      plugins = [
        babelMod.default ?? babelMod,
        estreeMod.default ?? estreeMod
      ];
    } else if (ext === "css") {
      const postcssMod = await import("https://unpkg.com/prettier@3.3.3/plugins/postcss.mjs");
      parser = "css";
      plugins = [postcssMod.default ?? postcssMod];
    } else if (ext === "html") {
      const htmlMod = await import("https://unpkg.com/prettier@3.3.3/plugins/html.mjs");
      parser = "html";
      plugins = [htmlMod.default ?? htmlMod];
    } else if (ext === "json") {
      const babelMod = await import("https://unpkg.com/prettier@3.3.3/plugins/babel.mjs");
      const estreeMod = await import("https://unpkg.com/prettier@3.3.3/plugins/estree.mjs");
      parser = "json";
      plugins = [
        babelMod.default ?? babelMod,
        estreeMod.default ?? estreeMod
      ];
    } else {
      alert(`Tidy not supported for .${ext || "(none)"} yet`);
      return null;
    }

    return await format(code, {
      parser,
      plugins,
      semi: true,
      singleQuote: false,
    });
  } catch (error) {
    console.error("Tidy error:", error);
    // Return null if there's a syntax error or formatting error
    if (error.message && (error.message.includes("Syntax") || error.message.includes("Unexpected"))) {
      throw new Error(`Cannot tidy code with syntax errors: ${error.message.split("(")[0] || error.message}`);
    }
    throw error;
  }
}

// --------- defaults ----------
function defaultIndexHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>p5 sketch</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <script src="https://cdn.jsdelivr.net/npm/p5@1.9.0/lib/p5.min.js"></script>
    <script src="sketch.js"></script>
  </body>
</html>`;
}

function defaultCss() {
  return `
html, body {
  margin: 0;
  padding: 0;
  background: #000;
}
canvas {
  display: block;
}
  `.trim();
}

function defaultSketch() {
  return `
function setup() {
  createCanvas(400, 400);
}
function draw() {
  background(20);
  fill(240);
  circle(width/2, height/2, 140);
}
  `.trim();
}

// --------- utils ----------
function chooseInitialActivePath(files) {
  if (files["sketch.js"]) return "sketch.js";
  if (files["index.html"]) return "index.html";
  const keys = Object.keys(files);
  return keys[0] || "sketch.js";
}

function extensionOf(p) {
  const m = /\.([^.]+)$/.exec(p || "");
  return m ? m[1].toLowerCase() : "";
}

function squareBtn(text, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn-square";
  b.textContent = text;
  b.title = title;
  return b;
}

function miniBtn(text, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn-mini";
  b.textContent = text;
  b.title = title;
  return b;
}

function pillBtn(text) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn-pill";
  b.textContent = text;
  return b;
}
