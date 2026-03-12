import * as vscode from "vscode";
import { WebSocket } from "ws";

let webSocket: WebSocket | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;
let pendingContext: string | null = null;

interface BrowserPayload {
  prompt: string;
  outerHTML: string;
  computedCSS: Record<string, string>;
  filePath: string;
  tagName: string;
  className: string;
  id: string;
}

export function activate(context: vscode.ExtensionContext) {
  console.log("AI UI Editor Bridge is now active");

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = "ai-ui-editor-bridge.connect";
  context.subscriptions.push(statusBarItem);
  updateStatusBar(false);

  // Register connect command
  context.subscriptions.push(
    vscode.commands.registerCommand("ai-ui-editor-bridge.connect", () => {
      connectToBridge(context);
    }),
  );

  // Register disconnect command
  context.subscriptions.push(
    vscode.commands.registerCommand("ai-ui-editor-bridge.disconnect", () => {
      disconnectFromBridge();
    }),
  );

  // Register command to manually open chat
  context.subscriptions.push(
    vscode.commands.registerCommand("ai-ui-editor-bridge.openChat", () => {
      openChatPanel();
    }),
  );

  // Register command to insert pending context into chat
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ai-ui-editor-bridge.insertContext",
      async () => {
        if (pendingContext) {
          await vscode.env.clipboard.writeText(pendingContext);
          await openChatPanel();
          vscode.window.showInformationMessage(
            "Context copied to clipboard! Press Ctrl+V in the chat input.",
          );
          pendingContext = null;
        } else {
          vscode.window.showWarningMessage("No pending context to insert.");
        }
      },
    ),
  );

  // Auto-connect on activation
  connectToBridge(context);
}

function updateStatusBar(connected: boolean) {
  if (!statusBarItem) return;

  if (connected) {
    statusBarItem.text = "$(plug) AI UI Bridge Connected";
    statusBarItem.tooltip = "Connected to FastAPI Bridge. Click to disconnect.";
    statusBarItem.command = "ai-ui-editor-bridge.disconnect";
    statusBarItem.color = new vscode.ThemeColor(
      "statusBarItem.prominentForeground",
    );
  } else {
    statusBarItem.text = "$(plug) AI UI Bridge Disconnected";
    statusBarItem.tooltip =
      "Not connected to FastAPI Bridge. Click to connect.";
    statusBarItem.command = "ai-ui-editor-bridge.connect";
    statusBarItem.color = undefined;
  }
  statusBarItem.show();
}

function connectToBridge(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("aiUiEditorBridge");
  const serverUrl =
    config.get<string>("serverUrl") || "ws://localhost:8000/ws/ide";

  if (webSocket && webSocket.readyState === WebSocket.OPEN) {
    vscode.window.showInformationMessage(
      "AI UI Editor Bridge: Already connected",
    );
    return;
  }

  try {
    webSocket = new WebSocket(serverUrl);

    webSocket.onopen = () => {
      console.log("Connected to FastAPI Bridge at", serverUrl);
      vscode.window.showInformationMessage(
        "AI UI Editor Bridge: Connected successfully",
      );
      updateStatusBar(true);
    };

    webSocket.onmessage = (event) => {
      try {
        const payload: BrowserPayload = JSON.parse(event.data.toString());
        handleBrowserContext(payload);
      } catch (error) {
        console.error("Failed to parse message:", error);
        vscode.window.showErrorMessage(
          "AI UI Editor Bridge: Invalid message format",
        );
      }
    };

    webSocket.onerror = (error) => {
      console.error("WebSocket error:", error);
      vscode.window.showErrorMessage("AI UI Editor Bridge: Connection error");
      updateStatusBar(false);
    };

    webSocket.onclose = (code, reason) => {
      console.log("Disconnected from FastAPI Bridge:", code, reason.toString());
      vscode.window.showWarningMessage("AI UI Editor Bridge: Disconnected");
      updateStatusBar(false);
      webSocket = null;
    };
  } catch (error) {
    console.error("Failed to connect:", error);
    vscode.window.showErrorMessage(
      `AI UI Editor Bridge: Failed to connect - ${error}`,
    );
    updateStatusBar(false);
  }
}

function disconnectFromBridge() {
  if (webSocket) {
    webSocket.close();
    webSocket = null;
    vscode.window.showInformationMessage("AI UI Editor Bridge: Disconnected");
    updateStatusBar(false);
  }
}

async function handleBrowserContext(payload: BrowserPayload) {
  const { prompt, outerHTML, computedCSS, filePath, tagName, className, id } =
    payload;

  console.log("Received browser context:", { filePath, prompt });

  try {
    // Build the context message for the chat
    const contextMessage = buildContextMessage(payload);

    // Store context for later insertion
    pendingContext = contextMessage;

    // Option 1: Open the file and show chat with context
    await openFileAndShowChat(filePath, contextMessage);

    vscode.window
      .showInformationMessage(
        `AI UI Editor Bridge: Context ready! Click notification to insert into chat.`,
        "Insert into Chat",
      )
      .then((selection) => {
        if (selection === "Insert into Chat") {
          vscode.commands.executeCommand("ai-ui-editor-bridge.insertContext");
        }
      });
  } catch (error) {
    console.error("Error handling browser context:", error);
    vscode.window.showErrorMessage(`AI UI Editor Bridge: Error - ${error}`);
  }
}

function buildContextMessage(payload: BrowserPayload): string {
  const { prompt, outerHTML, computedCSS, filePath, tagName, className, id } =
    payload;

  let message = `## 🎨 UI Edit Request\n\n`;
  message += `**User Prompt:** ${prompt}\n\n`;
  message += `**Source File:** \`${filePath}\`\n\n`;
  message += `**Selected Element:** \`${tagName}${id ? "#" + id : ""}${className ? "." + className.split(" ")[0] : ""}\`\n\n`;

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
  message += `*Please help me implement this change. Open the file above and suggest the necessary code modifications.*`;

  return message;
}

async function openFileAndShowChat(filePath: string, contextMessage: string) {
  // Try to find and open the file
  const files = await vscode.workspace.findFiles(`**/${filePath}`);

  let targetFile: vscode.Uri | undefined;

  if (files.length > 0) {
    targetFile = files[0];
  } else {
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
        } catch {
          continue;
        }
      }
    }
  }

  if (targetFile) {
    await vscode.window.showTextDocument(targetFile, { preview: false });
  }

  // Open chat panel
  await openChatPanel();

  // Copy to clipboard for manual paste
  await vscode.env.clipboard.writeText(contextMessage);
}

async function openChatPanel() {
  // Try to open the chat panel
  // This works for VS Code Copilot and similar chat extensions
  try {
    // GitHub Copilot Chat
    await vscode.commands.executeCommand("github.copilot.chat.focus");
  } catch {
    try {
      // Generic chat panel
      await vscode.commands.executeCommand(
        "workbench.panel.chat.view.copilot.focus",
      );
    } catch {
      // Fallback: show output channel
      console.log(
        "Chat panel context:\n\n" +
          buildContextMessage({
            prompt: "",
            outerHTML: "",
            computedCSS: {},
            filePath: "",
            tagName: "",
            className: "",
            id: "",
          }),
      );
      vscode.window.showWarningMessage(
        "Could not open chat panel automatically. Check the Output panel for context.",
      );
    }
  }
}

export function deactivate() {
  if (webSocket) {
    webSocket.close();
  }
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}
