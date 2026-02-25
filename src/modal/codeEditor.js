/**
 * CodeMirror 6 editor with auto-indent, line numbers, and linting
 * Uses a simpler, more reliable approach with fallback
 *
 * Updated: safer diagnostics ranges so error highlighting always shows,
 * improved lint tooltip styling, and lint keybindings. Lints .js/.mjs/.cjs.
 */

import * as view from "@codemirror/view";
import * as state from "@codemirror/state";
import * as commands from "@codemirror/commands";
import * as language from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { barf } from "thememirror";
import * as lint from "@codemirror/lint";

const codemirrorCache = {
  view,
  state,
  commands,
  language,
  js: { javascript },
  html: { html },
  css: { css },
  json: { json },
  theme: { barf },
  lint,
};

export async function createCodeEditor({ mountEl, path, value, onChange }) {
  // Try to use CodeMirror, but fall back to textarea if it fails
  try {
    return createEditorWithCache({ mountEl, path, value, onChange, cache: codemirrorCache });
  } catch (error) {
    console.warn("CodeMirror initialization failed, using textarea fallback:", error);
    return createTextareaEditor({ mountEl, value, onChange, path });
  }
}

function createEditorWithCache({ mountEl, path, value, onChange, cache }) {
  try {
    const { EditorView, lineNumbers, keymap } = cache.view;
    const { EditorState, Compartment } = cache.state;
    const { history, defaultKeymap, historyKeymap, indentWithTab } = cache.commands;
    const {
      foldGutter,
      indentOnInput,
      bracketMatching,
    } = cache.language;

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

    // ---------- Safer diagnostic range helpers ----------
    function clamp(n, lo, hi) {
      return Math.max(lo, Math.min(hi, n));
    }

    function rangeFromLineCol(doc, lineNum, colNum) {
      // lineNum is 1-based; colNum is typically 1-based in many error formats
      const safeLineNum = clamp(lineNum || 1, 1, doc.lines);
      const line = doc.line(safeLineNum);

      const c = colNum == null ? 1 : colNum;
      const col0 = clamp(c - 1, 0, line.length); // 0..line.length

      let from = line.from + col0;

      // If error is at EOL, move one char left so underline is visible
      if (from >= line.to && line.length > 0) from = line.to - 1;

      // underline 1 char (or 1 char at doc start if empty line)
      let to = Math.min(from + 1, doc.length);

      // Ensure non-empty range
      if (to <= from) {
        if (from > 0) {
          from = from - 1;
          to = from + 1;
        } else {
          to = Math.min(1, doc.length);
        }
      }
      return { from, to };
    }

    // Enhanced JS linter (syntax-only via new Function)
    const jsLinter =
      cache.lint?.linter
        ? cache.lint.linter((cmView) => {
            const code = cmView.state.doc.toString();
            const diagnostics = [];
            if (!code.trim()) return diagnostics;

            function parsePosition(e) {
              // Some engines provide these directly (often 1-based)
              if (e.lineNumber != null && e.columnNumber != null) {
                return { line: e.lineNumber, col: e.columnNumber };
              }

              // Try common patterns in message / stack
              const msgMatch =
                e.message?.match(/\((\d+)[:,]\s*(\d+)\)/) ||
                e.message?.match(/:(\d+):(\d+)\)/);

              if (msgMatch) {
                return { line: parseInt(msgMatch[1], 10), col: parseInt(msgMatch[2], 10) };
              }

              const stackMatch = e.stack?.match(/:(\d+):(\d+)\)/);
              if (stackMatch) {
                return { line: parseInt(stackMatch[1], 10), col: parseInt(stackMatch[2], 10) };
              }

              return null;
            }

            try {
              // Syntax check only
              new Function(code);
            } catch (e) {
              if (e instanceof SyntaxError) {
                const pos = parsePosition(e);
                const msg =
                  (e.message || "Syntax error").split(/[(\[]/)[0].trim() || "Syntax error";

                if (pos?.line >= 1) {
                  const { from, to } = rangeFromLineCol(cmView.state.doc, pos.line, pos.col ?? 1);
                  diagnostics.push({
                    from,
                    to,
                    severity: "error",
                    message: msg,
                  });
                } else {
                  // fallback: underline first char
                  const doc = cmView.state.doc;
                  const from = 0;
                  const to = Math.max(1, Math.min(1, doc.length));
                  diagnostics.push({
                    from,
                    to,
                    severity: "error",
                    message: msg,
                  });
                }
              }
            }

            return diagnostics;
          })
        : null;

    const ext = path.split(".").pop()?.toLowerCase() || "";
    const languageSupport = getLanguage(ext);
    const languageCompartment = new Compartment();

    // Auto-indent on Enter
    const autoIndent = EditorState.transactionFilter.of((tr) => {
      if (!tr.isUserEvent("input.type")) return tr;

      const changes = tr.changes;
      let insertText = null;
      let insertPos = null;

      changes.iterChangedRanges((fromA, toA, fromB, toB) => {
        // Detect a pure insertion point (no selection)
        if (fromB === toB) {
          const line = tr.newDoc.lineAt(fromB);

          // If we just created a new blank line (common after Enter)
          if (line.length === 0 && line.number > 1) {
            const prevLine = tr.newDoc.line(line.number - 1);
            const indent = /^(\s*)/.exec(prevLine.text)?.[1] || "";
            if (indent) {
              insertText = indent;
              insertPos = fromB;
            }
          }
        }
      });

      if (insertText && insertPos != null) {
        return [
          tr,
          {
            changes: { from: insertPos, insert: insertText },
            sequential: true,
          },
        ];
      }
      return tr;
    });

    const lintExt =
      jsLinter && (ext === "js" || ext === "mjs" || ext === "cjs") && cache.lint
        ? [cache.lint.lintGutter(), jsLinter]
        : [];

    const extensions = [
      lineNumbers(),
      history(),
      foldGutter(),
      indentOnInput(),
      bracketMatching(),
      languageCompartment.of(languageSupport),

      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange?.(update.state.doc.toString());
        }
      }),

      autoIndent,

      EditorView.theme({
        "&": { height: "100%", fontSize: "13px" },
        ".cm-content": { padding: "12px", minHeight: "100%" },
        ".cm-editor": { height: "100%" },
        ".cm-scroller": {
          overflow: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        },
        ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 8px" },

        // Underline on the text range
        ".cm-lintRange": {
          textDecoration: "underline wavy rgba(255, 70, 70, 0.95)",
          textDecorationThickness: "1.5px",
          textUnderlineOffset: "2px",
        },

        // Tooltip styling (often the missing piece)
        ".cm-tooltip.cm-tooltip-lint": {
          backgroundColor: "#12121a",
          color: "#eaeaf0",
          border: "1px solid #2a2a32",
          borderRadius: "10px",
          padding: "6px 8px",
        },
        ".cm-tooltip.cm-tooltip-lint .cm-diagnostic": {
          padding: "6px 8px",
          margin: "0",
          borderRadius: "8px",
          borderLeft: "3px solid rgba(255, 70, 70, 0.9)",
          backgroundColor: "rgba(255, 70, 70, 0.12)",
        },
        ".cm-diagnosticText": { color: "#eaeaf0" },
        ".cm-lintPoint": { cursor: "pointer" },
      }),

      cache.theme?.barf || [],

      lintExt,

      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...(cache.lint?.lintKeymap ?? []),
        indentWithTab,
      ]),
    ]
      .flat()
      .filter(Boolean);

    const editorState = EditorState.create({
      doc: value || "",
      extensions,
    });

    const editorView = new EditorView({
      state: editorState,
      parent: mountEl,
    });

    return {
      getValue: () => editorView.state.doc.toString(),
      setValue: (text) => {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: text },
        });
      },
      setPath: (newPath) => {
        const newExt = newPath.split(".").pop()?.toLowerCase() || "";
        const newLanguage = getLanguage(newExt);
        editorView.dispatch({
          effects: languageCompartment.reconfigure(newLanguage),
        });
      },
      focus: () => editorView.focus(),
      destroy: () => editorView.destroy(),
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
        textarea.value =
          textarea.value.substring(0, start) + "\n" + indent + textarea.value.substring(end);
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
    destroy: () => wrapper.remove(),
  };
}