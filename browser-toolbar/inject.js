(function () {
  // Prevent multiple injections
  if (window.__AI_UI_EDITOR_BRIDGE__) {
    console.log("[AI UI Editor Bridge] Already injected");
    return;
  }
  window.__AI_UI_EDITOR_BRIDGE__ = true;

  const WS_URL = "ws://localhost:8000/ws/browser";
  let ws = null;
  let isInspecting = false;
  let selectedElement = null;
  let highlightedElement = null;

  // Create floating UI
  function createFloatingUI() {
    const container = document.createElement("div");
    container.id = "ai-ui-editor-bridge-container";
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1e1e1e;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      padding: 12px;
      min-width: 280px;
      max-width: 350px;
      color: #fff;
      transition: all 0.2s ease;
    `;

    let isCollapsed = false;
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    // Header (also serves as drag handle)
    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #333;
      cursor: grab;
      user-select: none;
    `;
    header.innerHTML = `
      <span style="font-weight: 600; font-size: 14px;">🤖 AI UI Editor</span>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span id="ai-ui-bridge-status" style="font-size: 11px; color: #f44336;">● Disconnected</span>
        <button id="ai-ui-bridge-collapse" style="background: none; border: none; color: #fff; font-size: 16px; cursor: pointer; padding: 0 4px; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px;" title="Collapse/Expand">−</button>
      </div>
    `;

    // Connection button
    const connectBtn = document.createElement("button");
    connectBtn.id = "ai-ui-bridge-connect";
    connectBtn.textContent = "Connect";
    connectBtn.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      margin-bottom: 8px;
      border: none;
      border-radius: 4px;
      background: #4CAF50;
      color: white;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
    `;
    connectBtn.onmouseover = () => (connectBtn.style.background = "#45a049");
    connectBtn.onmouseout = () => (connectBtn.style.background = "#4CAF50");

    // IDE Selector
    const ideSelect = document.createElement("select");
    ideSelect.id = "ai-ui-bridge-ide-select";
    ideSelect.disabled = true;
    ideSelect.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      margin-bottom: 8px;
      border: 1px solid #333;
      border-radius: 4px;
      background: #2d2d2d;
      color: #fff;
      font-size: 13px;
      cursor: pointer;
    `;
    ideSelect.innerHTML = `
      <option value="auto">🔄 Auto-detect IDE</option>
      <option value="vscode">📝 VS Code (Copilot)</option>
      <option value="windsurf">🌊 Windsurf (Cascade)</option>
      <option value="zed">⚡ Zed (AI)</option>
    `;

    // Inspect button
    const inspectBtn = document.createElement("button");
    inspectBtn.id = "ai-ui-bridge-inspect";
    inspectBtn.textContent = "Start Inspecting";
    inspectBtn.disabled = true;
    inspectBtn.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      margin-bottom: 8px;
      border: none;
      border-radius: 4px;
      background: #2196F3;
      color: white;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
      opacity: 0.5;
    `;

    // Prompt input
    const promptInput = document.createElement("textarea");
    promptInput.id = "ai-ui-bridge-prompt";
    promptInput.placeholder =
      "Select an element first, then describe what you want to change...";
    promptInput.disabled = true;
    promptInput.style.cssText = `
      width: 100%;
      min-height: 80px;
      padding: 8px;
      margin-bottom: 8px;
      border: 1px solid #333;
      border-radius: 4px;
      background: #2d2d2d;
      color: #fff;
      font-size: 13px;
      resize: vertical;
      font-family: inherit;
    `;

    // Submit button
    const submitBtn = document.createElement("button");
    submitBtn.id = "ai-ui-bridge-submit";
    submitBtn.textContent = "Apply Changes";
    submitBtn.disabled = true;
    submitBtn.style.cssText = `
      width: 100%;
      padding: 10px 12px;
      border: none;
      border-radius: 4px;
      background: #9C27B0;
      color: white;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      opacity: 0.5;
    `;

    // Clear selection button
    const clearBtn = document.createElement("button");
    clearBtn.id = "ai-ui-bridge-clear";
    clearBtn.textContent = "Clear Selection";
    clearBtn.disabled = true;
    clearBtn.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      margin-top: 8px;
      border: 1px solid #555;
      border-radius: 4px;
      background: transparent;
      color: #aaa;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
      opacity: 0.5;
    `;
    clearBtn.onmouseover = () => {
      if (!clearBtn.disabled) {
        clearBtn.style.background = "#f44336";
        clearBtn.style.borderColor = "#f44336";
        clearBtn.style.color = "#fff";
      }
    };
    clearBtn.onmouseout = () => {
      if (!clearBtn.disabled) {
        clearBtn.style.background = "transparent";
        clearBtn.style.borderColor = "#555";
        clearBtn.style.color = "#aaa";
      }
    };

    // Selection info
    const selectionInfo = document.createElement("div");
    selectionInfo.id = "ai-ui-bridge-selection";
    selectionInfo.style.cssText = `
      margin-top: 8px;
      padding: 8px;
      background: #2d2d2d;
      border-radius: 4px;
      font-size: 11px;
      color: #aaa;
      display: none;
    `;

    // File path input (for manual override)
    const filePathInput = document.createElement("input");
    filePathInput.id = "ai-ui-bridge-file-input";
    filePathInput.type = "text";
    filePathInput.placeholder =
      "File path (e.g., src/components/MyComponent.tsx)";
    filePathInput.disabled = true;
    filePathInput.style.cssText = `
      width: 100%;
      padding: 6px 8px;
      margin-top: 8px;
      border: 1px solid #444;
      border-radius: 4px;
      background: #1e1e1e;
      color: #fff;
      font-size: 11px;
      font-family: 'Consolas', 'Monaco', monospace;
      box-sizing: border-box;
    `;

    // Assemble UI
    container.appendChild(header);
    container.appendChild(connectBtn);
    container.appendChild(ideSelect);
    container.appendChild(inspectBtn);
    container.appendChild(promptInput);
    container.appendChild(submitBtn);
    container.appendChild(clearBtn);
    container.appendChild(selectionInfo);
    container.appendChild(filePathInput);

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "×";
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #fff;
      font-size: 20px;
      cursor: pointer;
      padding: 0 4px;
    `;
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      container.remove();
    };

    // Get collapse button from header (already created above)
    const collapseBtn = header.querySelector("#ai-ui-bridge-collapse");
    collapseBtn.onclick = (e) => {
      e.stopPropagation();
      isCollapsed = !isCollapsed;
      if (isCollapsed) {
        container.style.padding = "8px";
        container.style.minWidth = "200px";
        container.style.maxWidth = "200px";
        // Hide all children except header
        connectBtn.style.display = "none";
        ideSelect.style.display = "none";
        inspectBtn.style.display = "none";
        promptInput.style.display = "none";
        submitBtn.style.display = "none";
        clearBtn.style.display = "none";
        selectionInfo.style.display = "none";
        filePathInput.style.display = "none";
        collapseBtn.textContent = "+";
        collapseBtn.title = "Expand";
      } else {
        container.style.padding = "12px";
        container.style.minWidth = "280px";
        container.style.maxWidth = "350px";
        // Show all children
        connectBtn.style.display = "block";
        ideSelect.style.display = "block";
        inspectBtn.style.display = "block";
        promptInput.style.display = "block";
        submitBtn.style.display = "block";
        clearBtn.style.display = "block";
        selectionInfo.style.display = "block";
        filePathInput.style.display = "block";
        collapseBtn.textContent = "−";
        collapseBtn.title = "Collapse";
      }
    };

    // Add close button to header
    const headerButtons = header.querySelector("div");
    headerButtons.appendChild(closeBtn);

    document.body.appendChild(container);

    // Drag functionality
    header.addEventListener("mousedown", (e) => {
      // Only start drag if clicking on header (not buttons)
      if (
        e.target === header ||
        e.target === header.querySelector("span:first-child")
      ) {
        isDragging = true;
        dragOffsetX = e.clientX - container.offsetLeft;
        dragOffsetY = e.clientY - container.offsetTop;
        header.style.cursor = "grabbing";
        e.preventDefault();
      }
    });

    document.addEventListener("mousemove", (e) => {
      if (isDragging) {
        const newX = e.clientX - dragOffsetX;
        const newY = e.clientY - dragOffsetY;

        // Keep within viewport bounds
        const maxX = window.innerWidth - container.offsetWidth;
        const maxY = window.innerHeight - container.offsetHeight;

        container.style.left = Math.max(0, Math.min(newX, maxX)) + "px";
        container.style.top = Math.max(0, Math.min(newY, maxY)) + "px";
        container.style.right = "auto";
      }
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = "grab";
      }
    });

    // Event listeners
    connectBtn.onclick = () =>
      toggleConnection(
        connectBtn,
        ideSelect,
        inspectBtn,
        promptInput,
        submitBtn,
        clearBtn,
        filePathInput,
      );
    inspectBtn.onclick = () =>
      toggleInspectMode(inspectBtn, promptInput, submitBtn, filePathInput);
    submitBtn.onclick = () => submitEdit(promptInput, ideSelect, filePathInput);
    clearBtn.onclick = () =>
      clearSelection(
        promptInput,
        submitBtn,
        clearBtn,
        selectionInfo,
        filePathInput,
      );

    return {
      connectBtn,
      ideSelect,
      inspectBtn,
      promptInput,
      submitBtn,
      clearBtn,
      selectionInfo,
      filePathInput,
    };
  }

  function toggleConnection(
    connectBtn,
    ideSelect,
    inspectBtn,
    promptInput,
    submitBtn,
    clearBtn,
    filePathInput,
  ) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    } else {
      connectBtn.textContent = "Connecting...";
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        connectBtn.textContent = "Disconnect";
        connectBtn.style.background = "#f44336";
        document.getElementById("ai-ui-bridge-status").textContent =
          "● Connected";
        document.getElementById("ai-ui-bridge-status").style.color = "#4CAF50";
        ideSelect.disabled = false;
        inspectBtn.disabled = false;
        inspectBtn.style.opacity = "1";
        filePathInput.disabled = false;
      };

      ws.onclose = () => {
        connectBtn.textContent = "Connect";
        connectBtn.style.background = "#4CAF50";
        document.getElementById("ai-ui-bridge-status").textContent =
          "● Disconnected";
        document.getElementById("ai-ui-bridge-status").style.color = "#f44336";
        ideSelect.disabled = true;
        inspectBtn.disabled = true;
        inspectBtn.style.opacity = "0.5";
        promptInput.disabled = true;
        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.5";
        clearBtn.disabled = true;
        clearBtn.style.opacity = "0.5";
        filePathInput.disabled = true;
        filePathInput.value = "";
        isInspecting = false;
        inspectBtn.textContent = "Start Inspecting";
        removeHighlight();
      };

      ws.onerror = (error) => {
        console.error("[AI UI Bridge] WebSocket error:", error);
        connectBtn.textContent = "Connect";
        connectBtn.style.background = "#4CAF50";
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[AI UI Bridge] Message:", data);

          if (data.type === "context_sent") {
            // Show success with element info
            const notification = document.createElement("div");
            notification.style.cssText = `
              position: fixed;
              bottom: 20px;
              right: 20px;
              background: #4CAF50;
              color: white;
              padding: 12px 20px;
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.2);
              z-index: 999999;
              font-size: 13px;
              animation: slideIn 0.3s ease;
            `;
            notification.innerHTML = `
              <strong>✓ Context Sent to ${data.ide?.toUpperCase() || "IDE"}!</strong><br>
              Element: ${data.element || "Unknown"}<br>
              "${data.prompt || ""}"
            `;
            document.body.appendChild(notification);

            setTimeout(() => {
              notification.style.opacity = "0";
              notification.style.transition = "opacity 0.3s";
              setTimeout(() => notification.remove(), 300);
            }, 3000);

            promptInput.value = "";
          } else if (data.type === "error") {
            alert("✗ " + data.message);
          } else if (data.type === "ide_status") {
            console.log("[AI UI Bridge] IDE Status:", data.message);
          }
        } catch (e) {
          console.error("[AI UI Bridge] Parse error:", e);
        }
      };
    }
  }

  function toggleInspectMode(
    inspectBtn,
    promptInput,
    submitBtn,
    filePathInput,
  ) {
    isInspecting = !isInspecting;

    if (isInspecting) {
      inspectBtn.textContent = "Stop Inspecting";
      inspectBtn.style.background = "#ff9800";
      document.addEventListener("mouseover", handleMouseOver);
      document.addEventListener("mouseout", handleMouseOut);
      document.addEventListener("click", handleClick, true);
      // Disable prompt input while inspecting
      promptInput.disabled = true;
      submitBtn.disabled = true;
      submitBtn.style.opacity = "0.5";
      filePathInput.disabled = true;
    } else {
      inspectBtn.textContent = "Start Inspecting";
      inspectBtn.style.background = "#2196F3";
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseout", handleMouseOut);
      document.removeEventListener("click", handleClick, true);
      removeHighlight();
      // Don't reset selectedElement here - keep it for multiple edits
      // Only reset if we're explicitly clearing
      if (!selectedElement) {
        promptInput.disabled = true;
        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.5";
        filePathInput.disabled = true;
        document.getElementById("ai-ui-bridge-selection").style.display =
          "none";
      }
    }
  }

  function handleMouseOver(e) {
    if (!isInspecting) return;

    const target = e.target;
    if (target.id === "ai-ui-editor-bridge-container") return;

    highlightedElement = target;

    // Add highlight border
    const originalBorder = target.style.border;
    const originalOutline = target.style.outline;

    target.style.outline = "2px solid #2196F3";
    target.style.outlineOffset = "2px";
    target.style.cursor = "pointer";

    target.addEventListener(
      "mouseout",
      () => {
        target.style.outline = originalOutline;
        target.style.cursor = "";
      },
      { once: true },
    );
  }

  function handleMouseOut(e) {
    if (highlightedElement) {
      highlightedElement.style.outline = "";
      highlightedElement.style.cursor = "";
      highlightedElement = null;
    }
  }

  function handleClick(e) {
    if (!isInspecting) return;

    e.preventDefault();
    e.stopPropagation();

    selectedElement = e.target;

    // Remove outline
    selectedElement.style.outline = "";
    selectedElement.style.cursor = "";

    // Show selection info
    const selectionInfo = document.getElementById("ai-ui-bridge-selection");
    const tagName = selectedElement.tagName.toLowerCase();
    const className = selectedElement.className
      ? "." +
        (typeof selectedElement.className === "string"
          ? selectedElement.className.split(" ").join(".")
          : "element")
      : "";
    const id = selectedElement.id ? "#" + selectedElement.id : "";

    // Get and display the file path
    const detectedPath = getFilePath(selectedElement);

    selectionInfo.innerHTML = `
      <strong>Selected:</strong> ${tagName}${id}${className}<br>
      <strong>File:</strong> ${detectedPath || "Unknown"}
    `;
    selectionInfo.style.display = "block";

    // Enable prompt input and buttons
    const promptInput = document.getElementById("ai-ui-bridge-prompt");
    const submitBtn = document.getElementById("ai-ui-bridge-submit");
    const clearBtn = document.getElementById("ai-ui-bridge-clear");
    const filePathInput = document.getElementById("ai-ui-bridge-file-input");

    promptInput.disabled = false;
    promptInput.placeholder = "Describe what you want to change...";
    submitBtn.disabled = false;
    submitBtn.style.opacity = "1";
    clearBtn.disabled = false;
    clearBtn.style.opacity = "1";
    filePathInput.disabled = false;
    filePathInput.value = detectedPath || "";

    // Focus the prompt input so user can start typing immediately
    promptInput.focus();

    // Stop inspecting
    toggleInspectMode(
      document.getElementById("ai-ui-bridge-inspect"),
      promptInput,
      submitBtn,
      filePathInput,
    );
  }

  function removeHighlight() {
    if (highlightedElement) {
      highlightedElement.style.outline = "";
      highlightedElement.style.cursor = "";
      highlightedElement = null;
    }
  }

  function getFilePath(element) {
    // Priority 1: Check for explicit source file attributes
    const sourcePath =
      element.getAttribute("data-source-file") ||
      element.getAttribute("data-file") ||
      element.getAttribute("__source") ||
      element.getAttribute("data-reactroot") ||
      element.getAttribute("data-v-inspector");

    if (sourcePath) {
      return sourcePath;
    }

    // Priority 2: Try React DevTools __reactFiber$* pattern
    // React attaches internal fiber references to DOM elements
    for (const key of Object.keys(element)) {
      if (
        key.startsWith("__reactFiber$") ||
        key.startsWith("__reactInternalInstance$")
      ) {
        try {
          const fiber = element[key];
          if (fiber && fiber.type && fiber.type.displayName) {
            const componentName = fiber.type.displayName;
            // Try to construct common file paths from component name
            return `src/components/${componentName}.tsx`;
          }
        } catch (e) {
          // Fiber inspection failed, continue
        }
      }
    }

    // Priority 3: Guess from element structure with better heuristics
    const tagName = element.tagName.toLowerCase();
    const classList = element.classList ? Array.from(element.classList) : [];
    const className =
      classList.length > 0 ? classList[0] : element.className || "";
    const id = element.id || "";

    // Common patterns - prioritize based on class names
    const possibleFiles = [];

    // If class looks like a component name (PascalCase or kebab-case)
    if (className) {
      // Convert kebab-case to PascalCase
      const pascalCase = className
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("");
      possibleFiles.push(
        `src/components/${pascalCase}.tsx`,
        `src/components/${className}.tsx`,
        `src/components/${pascalCase}.vue`,
        `src/components/${className}.vue`,
      );
    }

    // Try with id
    if (id) {
      possibleFiles.push(
        `src/pages/${id}.tsx`,
        `src/pages/${id}.vue`,
        `src/components/${id}.tsx`,
      );
    }

    // Fallback patterns
    possibleFiles.push(
      `src/components/${tagName.charAt(0).toUpperCase() + tagName.slice(1)}.tsx`,
      `src/components/${tagName}.tsx`,
      `src/${tagName}.tsx`,
    );

    return possibleFiles[0] || `src/App.tsx`;
  }

  function getComputedCSS(element) {
    const computed = window.getComputedStyle(element);
    const relevant = {};
    const properties = [
      "color",
      "background-color",
      "font-size",
      "font-family",
      "font-weight",
      "margin",
      "padding",
      "border",
      "border-radius",
      "width",
      "height",
      "display",
      "flex-direction",
      "justify-content",
      "align-items",
      "position",
      "top",
      "right",
      "bottom",
      "left",
      "z-index",
    ];

    properties.forEach((prop) => {
      relevant[prop] = computed.getPropertyValue(prop);
    });

    return relevant;
  }

  function clearSelection(
    promptInput,
    submitBtn,
    clearBtn,
    selectionInfo,
    filePathInput,
  ) {
    selectedElement = null;
    promptInput.value = "";
    promptInput.disabled = true;
    promptInput.placeholder =
      "Select an element first, then describe what you want to change...";
    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.5";
    clearBtn.disabled = true;
    clearBtn.style.opacity = "0.5";
    selectionInfo.style.display = "none";
    if (filePathInput) {
      filePathInput.value = "";
      filePathInput.disabled = true;
    }
  }

  function submitEdit(promptInput, ideSelect, filePathInput) {
    if (!selectedElement || !ws || ws.readyState !== WebSocket.OPEN) {
      alert("Please select an element first");
      return;
    }

    const prompt = promptInput.value.trim();
    if (!prompt) {
      alert("Please enter a description of what you want to change");
      return;
    }

    const targetIde = ideSelect ? ideSelect.value : "auto";

    // Use manual file path if provided, otherwise auto-detect
    const manualFilePath = filePathInput ? filePathInput.value.trim() : "";
    const filePath = manualFilePath || getFilePath(selectedElement);

    const payload = {
      prompt: prompt,
      outerHTML: selectedElement.outerHTML,
      computedCSS: getComputedCSS(selectedElement),
      filePath: filePath,
      tagName: selectedElement.tagName.toLowerCase(),
      className: selectedElement.className || "",
      id: selectedElement.id || "",
      targetIde: targetIde,
    };

    console.log("[AI UI Bridge] Sending:", payload);
    ws.send(JSON.stringify(payload));
  }

  // Initialize on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createFloatingUI);
  } else {
    createFloatingUI();
  }
})();
