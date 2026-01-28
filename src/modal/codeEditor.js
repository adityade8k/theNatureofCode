/**
 * CodeMirror 6 editor with auto-indent, line numbers, and linting
 * Uses a simpler, more reliable approach with fallback
 */

// Global cache to prevent multiple instances - use window to ensure it's truly global
if (typeof window !== 'undefined' && !window.__codemirrorCache) {
  window.__codemirrorCache = null;
  window.__codemirrorLoading = null;
}

async function loadCodeMirrorOnce() {
  // If already cached, return it
  if (window.__codemirrorCache) {
    return window.__codemirrorCache;
  }
  
  // If already loading, wait for it
  if (window.__codemirrorLoading) {
    return await window.__codemirrorLoading;
  }
  
  // Start loading
  window.__codemirrorLoading = (async () => {
    const base = "https://esm.sh";
    
    try {
      const modules = await Promise.all([
        import(`${base}/@codemirror/view@6.21.3`),
        import(`${base}/@codemirror/state@6.2.1`),
        import(`${base}/@codemirror/commands@6.2.4`),
        import(`${base}/@codemirror/language@6.9.0`),
        import(`${base}/@codemirror/lang-javascript@6.1.7`).catch(() => null),
        import(`${base}/@codemirror/lang-html@6.4.6`).catch(() => null),
        import(`${base}/@codemirror/lang-css@6.2.1`).catch(() => null),
        import(`${base}/@codemirror/lang-json@6.0.1`).catch(() => null),
        import(`${base}/@codemirror/theme-one-dark@6.1.2`).catch(() => null),
        import(`${base}/@codemirror/lint@6.4.0`).catch(() => null)
      ]);
      
      window.__codemirrorCache = {
        view: modules[0],
        state: modules[1],
        commands: modules[2],
        language: modules[3],
        js: modules[4],
        html: modules[5],
        css: modules[6],
        json: modules[7],
        theme: modules[8],
        lint: modules[9]
      };
      
      window.__codemirrorLoading = null;
      return window.__codemirrorCache;
    } catch (error) {
      window.__codemirrorLoading = null;
      console.warn("CodeMirror failed to load:", error);
      return null;
    }
  })();
  
  return await window.__codemirrorLoading;
}

export async function createCodeEditor({ mountEl, path, value, onChange }) {
  // For now, always use textarea fallback to avoid CodeMirror multiple instance issues
  // CodeMirror has issues with dynamic imports from CDN causing multiple instances
  return createTextareaEditor({ mountEl, value, onChange, path });
  
  /* CodeMirror disabled due to multiple instance issues
  // Try to use CodeMirror, but fall back to textarea if it fails
  // Check if cache exists and is valid before loading
  if (window.__codemirrorCache && window.__codemirrorCache.view && window.__codemirrorCache.state) {
    // Use existing cache
    const cache = window.__codemirrorCache;
    try {
      return createEditorWithCache({ mountEl, path, value, onChange, cache });
    } catch (error) {
      console.warn("CodeMirror initialization failed with cached modules, using textarea fallback:", error);
      return createTextareaEditor({ mountEl, value, onChange, path });
    }
  }
  
  const cache = await loadCodeMirrorOnce();
  
  // If CodeMirror didn't load, use textarea fallback
  if (!cache || !cache.view || !cache.state) {
    return createTextareaEditor({ mountEl, value, onChange, path });
  }

  try {
    return createEditorWithCache({ mountEl, path, value, onChange, cache });
  } catch (error) {
    console.warn("CodeMirror initialization failed, using textarea fallback:", error);
    return createTextareaEditor({ mountEl, value, onChange, path });
  }
  */
}

function createEditorWithCache({ mountEl, path, value, onChange, cache }) {
  try {
    const { EditorView, lineNumbers, keymap } = cache.view;
    const { EditorState, Compartment } = cache.state;
    const { history, defaultKeymap, historyKeymap, indentWithTab } = cache.commands;
    const { foldGutter, indentOnInput, bracketMatching, syntaxHighlighting, defaultHighlightStyle } = cache.language;

    // Get language support
    function getLanguage(ext) {
      switch (ext) {
        case "js":
        case "mjs":
        case "cjs":
          return cache.js?.javascript({ jsx: false }) || [];
        case "html":
          return cache.html?.html() || [];
        case "css":
          return cache.css?.css() || [];
        case "json":
          return cache.json?.json() || [];
        default:
          return [];
      }
    }

    // Enhanced JS linter
    const jsLinter = cache.lint?.linter ? cache.lint.linter(async (view) => {
      const code = view.state.doc.toString();
      const diagnostics = [];
      if (!code.trim()) return diagnostics;
      
      try {
        new Function(code);
      } catch (e) {
        if (e instanceof SyntaxError) {
          const match = e.message.match(/\((\d+):(\d+)\)/);
          if (match) {
            const lineNum = parseInt(match[1]) - 1;
            const colNum = parseInt(match[2]) - 1;
            try {
              const line = view.state.doc.line(lineNum + 1);
              const from = line.from + Math.max(0, Math.min(colNum, line.length));
              const to = Math.min(from + 1, line.to);
              diagnostics.push({
                from,
                to,
                severity: "error",
                message: e.message.split("(")[0].trim() || "Syntax error"
              });
            } catch {
              diagnostics.push({
                from: 0,
                to: Math.min(10, code.length),
                severity: "error",
                message: e.message.split("(")[0].trim() || "Syntax error"
              });
            }
          } else {
            diagnostics.push({
              from: 0,
              to: Math.min(10, code.length),
              severity: "error",
              message: e.message || "Syntax error"
            });
          }
        }
      }
      return diagnostics;
    }) : null;

    const ext = path.split(".").pop()?.toLowerCase() || "";
    const language = getLanguage(ext);
    const languageCompartment = new Compartment();

    // Auto-indent on Enter
    const autoIndent = EditorState.transactionFilter.of((tr) => {
      if (!tr.isUserEvent("input.type")) return tr;
      const changes = tr.changes;
      let insertText = null;
      let insertPos = null;
      
      changes.iterChangedRanges((fromA, toA, fromB, toB) => {
        if (fromB === toB) {
          const line = tr.newDoc.lineAt(fromB);
          if (line.length === 0 && line.number > 1) {
            const prevLine = tr.newDoc.lineAt(line.from - 1);
            const indent = /^(\s*)/.exec(prevLine.text)?.[1] || "";
            if (indent) {
              insertText = indent;
              insertPos = fromB;
            }
          }
        }
      });
      
      if (insertText && insertPos !== null) {
        return [tr, { changes: { from: insertPos, insert: insertText }, sequential: true }];
      }
      return tr;
    });

    const extensions = [
      lineNumbers(),
      history(),
      foldGutter(),
      indentOnInput(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle),
      languageCompartment.of(language),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange?.(update.state.doc.toString());
        }
      }),
      autoIndent,
      EditorView.theme({
        "&": { height: "100%", fontSize: "13px" },
        ".cm-content": { padding: "12px", minHeight: "100%" },
        ".cm-editor": { height: "100%", backgroundColor: "#0d0d11", color: "#eaeaf0" },
        ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
        ".cm-gutters": { backgroundColor: "#0b0b10", borderRight: "1px solid #2a2a32", color: "rgba(234, 234, 240, 0.55)" },
        ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 8px" },
        ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.04)" },
        ".cm-activeLineGutter": { backgroundColor: "rgba(255, 255, 255, 0.04)" },
        ".cm-lintRange": { textDecoration: "underline wavy rgba(255, 70, 70, 0.95)", textDecorationThickness: "1.5px", textUnderlineOffset: "2px" },
        ".cm-diagnostic": { borderLeft: "3px solid rgba(255, 70, 70, 0.9)", backgroundColor: "rgba(255, 70, 70, 0.12)" }
      }),
      cache.theme?.oneDark || [],
      jsLinter && ext === "js" && cache.lint ? [cache.lint.lintGutter(), jsLinter] : [],
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab])
    ].flat().filter(Boolean);

    const state = EditorState.create({
      doc: value || "",
      extensions
    });

    const view = new EditorView({
      state,
      parent: mountEl
    });

    return {
      getValue: () => view.state.doc.toString(),
      setValue: (text) => {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text }
        });
      },
      setPath: (newPath) => {
        const newExt = newPath.split(".").pop()?.toLowerCase() || "";
        const newLanguage = getLanguage(newExt);
        view.dispatch({
          effects: languageCompartment.reconfigure(newLanguage)
        });
      },
      focus: () => view.focus(),
      destroy: () => view.destroy()
    };
  } catch (error) {
    console.warn("CodeMirror initialization failed, using textarea fallback:", error);
    throw error; // Re-throw so caller can handle
  }
}

// Fallback textarea editor with line numbers simulation
function createTextareaEditor({ mountEl, value, onChange, path }) {
  const wrapper = document.createElement("div");
  wrapper.className = "code-editor-fallback-wrapper";

  // Line numbers container (fixed width, scrolls with content)
  const lineNumbersContainer = document.createElement("div");
  lineNumbersContainer.className = "code-editor-line-numbers-container";

  // Line numbers content
  const lineNumbers = document.createElement("div");
  lineNumbers.className = "code-editor-line-numbers";

  const textarea = document.createElement("textarea");
  textarea.value = value || "";
  textarea.className = "code-area code-area-fallback";
  textarea.spellcheck = false;
  
  function updateLineNumbers() {
    const lines = textarea.value.split("\n");
    const lineCount = Math.max(lines.length, 1);
    const numbers = Array.from({ length: lineCount }, (_, i) => {
      const num = (i + 1).toString();
      return num.padStart(3, " ");
    }).join("\n");
    lineNumbers.textContent = numbers;
    
    // Match line numbers height to textarea content height
    const textareaScrollHeight = textarea.scrollHeight;
    lineNumbers.style.height = Math.max(textareaScrollHeight, textarea.offsetHeight) + "px";
  }

  textarea.addEventListener("input", () => {
    onChange?.(textarea.value);
    updateLineNumbers();
  });

  // Sync scrolling - use transform to keep line numbers aligned
  textarea.addEventListener("scroll", () => {
    lineNumbers.style.transform = `translateY(-${textarea.scrollTop}px)`;
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const start = textarea.selectionStart;
      const textBefore = textarea.value.substring(0, start);
      const lines = textBefore.split("\n");
      const currentLine = lines[lines.length - 1];
      const indent = currentLine.match(/^(\s*)/)?.[1] || "";
      if (indent) {
        e.preventDefault();
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + "\n" + indent + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 1 + indent.length;
        onChange?.(textarea.value);
        updateLineNumbers();
      }
    }
  });

  lineNumbersContainer.appendChild(lineNumbers);
  wrapper.appendChild(lineNumbersContainer);
  wrapper.appendChild(textarea);
  mountEl.appendChild(wrapper);
  
  // Initial update
  updateLineNumbers();
  
  // Update on resize
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      updateLineNumbers();
    });
    resizeObserver.observe(textarea);
  }

  return {
    getValue: () => textarea.value,
    setValue: (text) => {
      textarea.value = text;
      onChange?.(text);
      updateLineNumbers();
    },
    setPath: () => {},
    focus: () => textarea.focus(),
    destroy: () => wrapper.remove()
  };
}
