"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ws_1 = require("ws");
let webSocket = null;
let statusBarItem = null;
function activate(context) {
    console.log("AI UI Editor Bridge for Windsurf is now active");
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = "ai-ui-editor-bridge-windsurf.connect";
    context.subscriptions.push(statusBarItem);
    updateStatusBar(false);
    // Register connect command
    context.subscriptions.push(vscode.commands.registerCommand("ai-ui-editor-bridge-windsurf.connect", () => {
        connectToBridge(context);
    }));
    // Register disconnect command
    context.subscriptions.push(vscode.commands.registerCommand("ai-ui-editor-bridge-windsurf.disconnect", () => {
        disconnectFromBridge();
    }));
    // Register command to manually open Cascade
    context.subscriptions.push(vscode.commands.registerCommand("ai-ui-editor-bridge-windsurf.openCascade", () => {
        openCascadeChat();
    }));
    // Auto-connect on activation
    connectToBridge(context);
}
function updateStatusBar(connected) {
    if (!statusBarItem)
        return;
    if (connected) {
        statusBarItem.text = "$(symbol-color) Windsurf Bridge Connected";
        statusBarItem.tooltip = "Connected to FastAPI Bridge. Click to disconnect.";
        statusBarItem.command = "ai-ui-editor-bridge-windsurf.disconnect";
        statusBarItem.color = new vscode.ThemeColor("statusBarItem.prominentForeground");
    }
    else {
        statusBarItem.text = "$(symbol-color) Windsurf Bridge Disconnected";
        statusBarItem.tooltip =
            "Not connected to FastAPI Bridge. Click to connect.";
        statusBarItem.command = "ai-ui-editor-bridge-windsurf.connect";
        statusBarItem.color = undefined;
    }
    statusBarItem.show();
}
function connectToBridge(context) {
    const config = vscode.workspace.getConfiguration("aiUiEditorBridgeWindsurf");
    const serverUrl = config.get("serverUrl") || "ws://localhost:8000/ws/windsurf";
    if (webSocket && webSocket.readyState === ws_1.WebSocket.OPEN) {
        vscode.window.showInformationMessage("AI UI Bridge (Windsurf): Already connected");
        return;
    }
    try {
        webSocket = new ws_1.WebSocket(serverUrl);
        webSocket.onopen = () => {
            console.log("Connected to FastAPI Bridge at", serverUrl);
            vscode.window.showInformationMessage("AI UI Bridge (Windsurf): Connected to Cascade");
            updateStatusBar(true);
        };
        webSocket.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data.toString());
                handleBrowserContext(payload);
            }
            catch (error) {
                console.error("Failed to parse message:", error);
                vscode.window.showErrorMessage("AI UI Bridge (Windsurf): Invalid message format");
            }
        };
        webSocket.onerror = (error) => {
            console.error("WebSocket error:", error);
            vscode.window.showErrorMessage("AI UI Bridge (Windsurf): Connection error");
            updateStatusBar(false);
        };
        webSocket.onclose = (event) => {
            console.log("Disconnected from FastAPI Bridge:", event.code, event.reason);
            vscode.window.showWarningMessage("AI UI Bridge (Windsurf): Disconnected");
            updateStatusBar(false);
            webSocket = null;
        };
    }
    catch (error) {
        console.error("Failed to connect:", error);
        vscode.window.showErrorMessage(`AI UI Bridge (Windsurf): Failed to connect - ${error}`);
        updateStatusBar(false);
    }
}
function disconnectFromBridge() {
    if (webSocket) {
        webSocket.close();
        webSocket = null;
        vscode.window.showInformationMessage("AI UI Bridge (Windsurf): Disconnected");
        updateStatusBar(false);
    }
}
async function handleBrowserContext(payload) {
    const { prompt, outerHTML, computedCSS, filePath, tagName, className, id } = payload;
    console.log("Received browser context:", { filePath, prompt });
    try {
        // Build the context message for Cascade
        const contextMessage = buildContextMessage(payload);
        // Open the file and show Cascade chat with context
        await openFileAndShowCascade(filePath, contextMessage);
        vscode.window
            .showInformationMessage(`AI UI Bridge (Windsurf): Context ready for ${filePath}`, "Copy Context")
            .then((selection) => {
            if (selection === "Copy Context") {
                vscode.env.clipboard.writeText(contextMessage);
                vscode.window.showInformationMessage("Context copied! Paste into Cascade chat (Ctrl+V)");
            }
        });
    }
    catch (error) {
        console.error("Error handling browser context:", error);
        vscode.window.showErrorMessage(`AI UI Bridge (Windsurf): Error - ${error}`);
    }
}
function buildContextMessage(payload) {
    const { prompt, outerHTML, computedCSS, filePath, tagName, className, id } = payload;
    let message = `## 🎨 UI Edit Request (Windsurf Cascade)\n\n`;
    message += `**User Prompt:** ${prompt}\n\n`;
    message += `**Source File:** \`${filePath}\`\n\n`;
    const selector = buildSelector(tagName, id, className);
    message += `**Selected Element:** \`${selector}\`\n\n`;
    message += `### Element HTML\n`;
    message += "```html\n";
    message +=
        outerHTML.substring(0, 2000) + (outerHTML.length > 2000 ? "..." : "");
    message += "\n```\n\n";
    message += `### Computed Styles\n`;
    message += "```json\n";
    message +=
        JSON.stringify(computedCSS, null, 2).substring(0, 1000) +
            (JSON.stringify(computedCSS).length > 1000 ? "..." : "");
    message += "\n```\n\n";
    message += `---\n`;
    message += `*Please help me implement this change. Use your codebase understanding to suggest the necessary modifications.*`;
    return message;
}
function buildSelector(tagName, id, className) {
    let selector = tagName;
    if (id)
        selector += `#${id}`;
    if (className)
        selector += `.${className.split(" ")[0]}`;
    return selector;
}
async function openFileAndShowCascade(filePath, contextMessage) {
    // Try to find and open the file
    const files = await vscode.workspace.findFiles(`**/${filePath}`);
    let targetFile;
    if (files.length > 0) {
        targetFile = files[0];
    }
    else {
        // Try relative to workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            for (const folder of workspaceFolders) {
                const relativePath = filePath.startsWith("/")
                    ? filePath.slice(1)
                    : filePath;
                const fullPath = vscode.Uri.joinPath(folder.uri, relativePath);
                try {
                    await vscode.workspace.fs.stat(fullPath);
                    targetFile = fullPath;
                    break;
                }
                catch {
                    continue;
                }
            }
        }
    }
    if (targetFile) {
        await vscode.window.showTextDocument(targetFile, { preview: false });
    }
    // Open Cascade chat panel
    await openCascadeChat();
    // Copy context to clipboard for easy pasting
    await vscode.env.clipboard.writeText(contextMessage);
}
async function openCascadeChat() {
    // Try to open Windsurf Cascade chat panel
    try {
        // Windsurf Cascade command
        await vscode.commands.executeCommand("codeium.cascadeChatView.focus");
    }
    catch {
        try {
            // Alternative Cascade command
            await vscode.commands.executeCommand("codeium.cascade.focus");
        }
        catch {
            try {
                // Fallback to generic chat
                await vscode.commands.executeCommand("workbench.panel.chat.view.copilot.focus");
            }
            catch {
                // Last resort: show output channel
                console.log("Cascade context:\n\n" +
                    buildContextMessage({
                        prompt: "",
                        outerHTML: "",
                        computedCSS: {},
                        filePath: "",
                        tagName: "",
                        className: "",
                        id: "",
                    }));
                vscode.window.showWarningMessage("Could not open Cascade automatically. Check the Output panel for context.");
            }
        }
    }
}
function deactivate() {
    if (webSocket) {
        webSocket.close();
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}
//# sourceMappingURL=extension.js.map