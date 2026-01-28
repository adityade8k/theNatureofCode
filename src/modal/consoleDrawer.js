/**
 * Console drawer for displaying logs, warnings, and errors
 */

export function createConsoleDrawer() {
  const root = document.createElement("div");
  root.className = "console-root";

  const bar = document.createElement("button");
  bar.className = "console-bar";
  bar.type = "button";

  const title = document.createElement("div");
  title.className = "console-title";
  title.textContent = "Console";

  const right = document.createElement("div");
  right.className = "console-right";

  const arrow = document.createElement("div");
  arrow.className = "console-arrow";
  arrow.textContent = "▼";

  const clearBtn = document.createElement("button");
  clearBtn.className = "console-clear";
  clearBtn.type = "button";
  clearBtn.textContent = "Clear";

  right.appendChild(clearBtn);
  right.appendChild(arrow);

  bar.appendChild(title);
  bar.appendChild(right);

  const panel = document.createElement("div");
  panel.className = "console-panel";

  const logEl = document.createElement("div");
  logEl.className = "console-log";

  panel.appendChild(logEl);
  root.appendChild(bar);
  root.appendChild(panel);

  let isOpen = false;

  function toggle() {
    isOpen = !isOpen;
    if (isOpen) {
      root.classList.add("is-open");
      arrow.textContent = "▲";
    } else {
      root.classList.remove("is-open");
      arrow.textContent = "▼";
    }
  }

  bar.addEventListener("click", toggle);
  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    logEl.innerHTML = "";
    root.classList.remove("has-new");
  });

  function append(level, args) {
    const line = document.createElement("div");
    line.className = `console-line console-${level}`;

    const time = document.createElement("span");
    time.className = "console-time";
    time.textContent = new Date().toLocaleTimeString();

    const msgContainer = document.createElement("div");
    msgContainer.className = "console-msg-container";

    const msg = document.createElement("span");
    msg.className = "console-msg";

    // Format message arguments
    const parts = Array.from(args).map((arg) => {
      if (typeof arg === "object" && arg !== null) {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    });

    const fullText = parts.join(" ");
    msg.textContent = fullText;

    // Check if message is long enough to need expansion
    const MAX_HEIGHT = 60; // Fixed height in pixels (approximately 3 lines)
    const isLong = fullText.length > 150 || fullText.split('\n').length > 3;
    
    if (isLong) {
      line.classList.add("console-line-long");
      msgContainer.classList.add("console-msg-collapsed");
      
      const expandBtn = document.createElement("button");
      expandBtn.className = "console-expand-btn";
      expandBtn.type = "button";
      expandBtn.textContent = "▼";
      expandBtn.title = "Expand message";
      
      expandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isExpanded = msgContainer.classList.contains("console-msg-expanded");
        if (isExpanded) {
          msgContainer.classList.remove("console-msg-expanded");
          msgContainer.classList.add("console-msg-collapsed");
          expandBtn.textContent = "▼";
          expandBtn.title = "Expand message";
        } else {
          msgContainer.classList.remove("console-msg-collapsed");
          msgContainer.classList.add("console-msg-expanded");
          expandBtn.textContent = "▲";
          expandBtn.title = "Collapse message";
        }
      });
      
      msgContainer.appendChild(msg);
      msgContainer.appendChild(expandBtn);
    } else {
      msgContainer.appendChild(msg);
    }

    line.appendChild(time);
    line.appendChild(msgContainer);
    logEl.appendChild(line);

    // Scroll to bottom
    logEl.scrollTop = logEl.scrollHeight;

    // Show indicator if closed
    if (!isOpen) {
      root.classList.add("has-new");
    }
  }

  return {
    el: root,
    append,
    toggle,
    clear: () => {
      logEl.innerHTML = "";
      root.classList.remove("has-new");
    }
  };
}

