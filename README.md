# AI UI Editor Bridge - Multi-IDE Support

A system that allows developers to select a DOM element in the browser, provide a natural language prompt, and automatically send the context to your IDE's AI chat panel (VS Code Copilot, Windsurf Cascade, or Zed AI).

## Supported IDEs

| IDE | AI Assistant | Connection |
|-----|--------------|------------|
| **VS Code** | GitHub Copilot Chat | Extension |
| **Windsurf** | Codeium Cascade | Extension |
| **Zed** | Zed AI / Assistant | Python Bridge |

## Architecture

```
┌─────────────────┐      WebSocket      ┌─────────────────┐
│                 │   ws://localhost    │                 │
│  Browser Toolbar│◄───────────────────►│  FastAPI Bridge │
│  (inject.js)    │    :8000/ws/browser │    (main.py)    │
│                 │                     │                 │
└─────────────────┘                     └─────────────────┘
                                               │
                     ┌─────────────────────────┼─────────────────────────┐
                     │                         │                         │
              ws://localhost:8000       ws://localhost:8000       ws://localhost:8000
              /ws/ide/vscode            /ws/ide/zed               /ws/ide/windsurf
                     │                         │                         │
                     ▼                         ▼                         ▼
            ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
            │   VS Code Ext   │      │  Zed Bridge     │      │ Windsurf Ext    │
            │   (Copilot)     │      │  (Python)       │      │  (Cascade)      │
            └─────────────────┘      └─────────────────┘      └─────────────────┘
```

## Project Structure

```
ai-ui-editor-bridge/
├── vscode-extension/          # VS Code Extension (Copilot)
│   ├── src/extension.ts
│   ├── package.json
│   └── tsconfig.json
│
├── windsurf-extension/        # Windsurf Extension (Cascade)
│   ├── src/extension.ts
│   ├── package.json
│   └── tsconfig.json
│
├── zed-extension/             # Zed Bridge (Python)
│   ├── zed_bridge.py
│   └── requirements.txt
│
├── fastapi-bridge/            # FastAPI Bridge (Multi-IDE)
│   ├── main.py
│   └── requirements.txt
│
└── browser-toolbar/           # Browser Toolbar
    ├── inject.js
    ├── test-page.html
    └── package.json
```

## Quick Start

### For Zed Users (Recommended)

### 1. Start the FastAPI Bridge

```bash
cd fastapi-bridge
pip install -r requirements.txt
python main.py
```

### 2. Start Zed Bridge

```bash
cd zed-extension
pip install -r requirements.txt
python zed_bridge.py
```

### 3. Inject Browser Toolbar

Open any webpage and paste `inject.js` into the DevTools Console.

---

## Detailed Setup

### VS Code Setup

1. **Install Dependencies:**
   ```bash
   cd vscode-extension
   npm install
   ```

2. **Compile:**
   ```bash
   npm run compile
   ```

3. **Run Extension:**
   - Open the `vscode-extension` folder in VS Code
   - Press `F5` to launch Extension Development Host
   - Look for "AI UI Bridge Connected" in status bar

4. **Required Extensions:**
   - GitHub Copilot (for AI chat)
   - GitHub Copilot Chat

### Windsurf Setup

1. **Install Dependencies:**
   ```bash
   cd windsurf-extension
   npm install
   ```

2. **Compile:**
   ```bash
   npm run compile
   ```

3. **Run Extension:**
   - Open the `windsurf-extension` folder in Windsurf
   - Press `F5` to launch Extension Development Host
   - Look for "Windsurf Bridge Connected" in status bar

4. **Required:**
   - Codeium account (built into Windsurf)
   - Cascade AI enabled

### Zed Setup

1. **Install Dependencies:**
   ```bash
   cd zed-extension
   pip install -r requirements.txt
   ```

2. **Run Bridge:**
   ```bash
   python zed_bridge.py
   ```

3. **Ensure Zed CLI is available:**
   - Add Zed to your PATH
   - Commands tried: `zed`, `zeditor`, `Zed`

4. **Required:**
   - Zed editor with AI features enabled

### Browser Toolbar Setup

**Option A: Manual Injection**
1. Open any webpage in Chrome/Edge
2. Open DevTools Console (F12)
3. Paste contents of `browser-toolbar/inject.js`
4. Floating UI appears in top-right

**Option B: Puppeteer Automation**
```bash
cd browser-toolbar
npm install
node load-toolbar.js
```

---

## Usage Flow (Zed)

1. **Start FastAPI Bridge:**
   ```bash
   cd fastapi-bridge
   python main.py
   ```

2. **Start Zed Bridge:**
   ```bash
   cd zed-extension
   python zed_bridge.py
   ```

3. **Inject Browser Toolbar:**
   - Open any webpage
   - Paste `inject.js` into DevTools Console

4. **Send Context:**
   - Click **"Connect"** in floating UI
   - Select **"⚡ Zed (AI)"** from IDE dropdown
   - Click **"Start Inspecting"**
   - Hover over element (highlights blue)
   - Click to select
   - Type prompt: "Change background to red with shadow"
   - Click **"Apply Changes"**

5. **Use Zed AI Assistant:**
   - Zed opens the target file automatically
   - Zed AI Assistant panel opens (Alt+L)
   - Context is copied to clipboard
   - **Press Ctrl+V** to paste into the assistant chat
   - Get AI-assisted suggestions!

### File Path Detection

The tool tries to auto-detect the source file path using:
1. **Framework attributes**: `data-source-file`, `__source`, `data-reactroot`, `data-v-inspector`
2. **React DevTools**: Inspects `__reactFiber$*` properties for component names
3. **Heuristics**: Guesses from class names and element structure

**If the detected file path is incorrect:**
- After selecting an element, a text input appears showing the detected path
- **Edit the path manually** to the correct file (e.g., `src/components/MyComponent.tsx`)
- The corrected path will be sent with the context

### Floating UI Controls

- **Drag**: Click and drag the header (🤖 AI UI Editor text) to move the UI anywhere on screen
- **Collapse**: Click the **−** button in the header to collapse the UI to a compact bar
- **Expand**: Click the **+** button to expand the UI back to full size
- **Close**: Click the **×** button to remove the UI completely

**Tip**: Collapse or drag the UI out of the way when inspecting elements behind it!

---

## Context Format

The following context is sent to your IDE:

```markdown
## 🎨 UI Edit Request

**User Prompt:** Change the background to red

**Source File:** `src/components/Card.tsx`

**Selected Element:** `div.card`

### Element HTML
```html
<div class="card" style="background: blue;">
  Content here
</div>
```

### Computed Styles
```json
{
  "background-color": "rgb(0, 0, 255)",
  "border-radius": "8px",
  "padding": "16px"
}
```

---
*Please help me implement this change.*
```

---

## API Payload Format

### Browser → Bridge
```json
{
  "prompt": "Change the background to red",
  "outerHTML": "<div class=\"card\">...</div>",
  "computedCSS": { "background-color": "blue" },
  "filePath": "src/components/Card.tsx",
  "tagName": "div",
  "className": "card",
  "id": "",
  "targetIde": "auto"
}
```

### Target IDE Options
- `"auto"` - Use first connected IDE (default)
- `"vscode"` - Send to VS Code
- `"windsurf"` - Send to Windsurf
- `"zed"` - Send to Zed

---

## Configuration

### VS Code Extension
- `aiUiEditorBridge.serverUrl`: WebSocket URL (default: `ws://localhost:8000/ws/ide/vscode`)

### Windsurf Extension
- `aiUiEditorBridgeWindsurf.serverUrl`: WebSocket URL (default: `ws://localhost:8000/ws/ide/windsurf`)

### Zed Bridge
- `ZED_WS_URL`: WebSocket URL (default: `ws://localhost:8000/ws/ide/zed`)

### FastAPI Bridge
| Variable | Description | Default |
|----------|-------------|---------|
| `HOST` | Server host | `0.0.0.0` |
| `PORT` | Server port | `8000` |

---

## WebSocket Endpoints

| Endpoint | Purpose | Client |
|----------|---------|--------|
| `/ws/browser` | Browser toolbar connection | `inject.js` |
| `/ws/ide/vscode` | VS Code extension | `vscode-extension` |
| `/ws/ide/zed` | Zed bridge | `zed_bridge.py` |
| `/ws/ide/windsurf` | Windsurf extension | `windsurf-extension` |

---

## Troubleshooting

### "No IDE connected"
- Make sure your IDE extension/bridge is running
- Check the status bar shows "Connected"
- Verify WebSocket URL matches

### "Could not open chat panel"
- **VS Code:** Install GitHub Copilot Chat extension
- **Windsurf:** Ensure Cascade is enabled in settings
- **Zed:** Make sure AI features are enabled

### "File not found"
- Add `data-source-file="path/to/file.tsx"` to DOM elements
- Ensure your workspace folder is open in the IDE
- Check file path in browser payload

### "Zed CLI not found"
- Add Zed to your PATH
- macOS: `ln -s /Applications/Zed.app/Contents/MacOS/cli /usr/local/bin/zed`
- Linux: Use the `zed` package from your distribution

### Context not pasting
- Click the notification to copy context
- Manually paste with Ctrl+V into chat
- Check clipboard permissions

---

## Development

### Running Multiple IDEs

You can run multiple IDE bridges simultaneously:

```bash
# Terminal 1: FastAPI Bridge
python fastapi-bridge/main.py

# Terminal 2: VS Code (F5 from vscode-extension)

# Terminal 3: Zed Bridge
python zed-extension/zed_bridge.py
```

The browser will auto-connect to the first available IDE, or you can specify:

```javascript
// In browser console, before submitting:
window.__AI_UI_EDITOR_BRIDGE__.targetIde = "vscode";
```

### Building Extensions

**VS Code / Windsurf:**
```bash
npm install -g vsce
vsce package
```

---

## License

MIT
