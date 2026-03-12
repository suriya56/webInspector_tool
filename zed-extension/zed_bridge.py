#!/usr/bin/env python3
"""
Zed IDE Bridge for AI UI Editor Bridge
Connects to FastAPI bridge and opens files/context in Zed IDE
"""

import asyncio
import json
import os
import subprocess
import sys

import websockets

ZED_WS_URL = os.getenv("ZED_WS_URL", "ws://localhost:8000/ws/zed")
RECONNECT_DELAY = 5


class ZedBridge:
    def __init__(self):
        self.websocket = None
        self.connected = False

    def build_context_message(self, payload: dict) -> str:
        """Build a formatted context message for Zed AI"""
        prompt = payload.get("prompt", "")
        outer_html = payload.get("outerHTML", "")
        computed_css = payload.get("computedCSS", {})
        file_path = payload.get("filePath", "")
        tag_name = payload.get("tagName", "")
        class_name = payload.get("className", "")
        element_id = payload.get("id", "")

        selector = tag_name
        if element_id:
            selector += f"#{element_id}"
        if class_name:
            selector += f".{class_name.split(' ')[0]}"

        message = f"""# 🎨 UI Edit Request

**User Prompt:** {prompt}

**Source File:** `{file_path}`

**Selected Element:** `{selector}`

## Element HTML
```html
{outer_html[:2000]}{"..." if len(outer_html) > 2000 else ""}
```

## Computed Styles
```json
{json.dumps(computed_css, indent=2)[:1000]}{"..." if len(json.dumps(computed_css)) > 1000 else ""}
```

---
*Please help me implement this change. Open the file above and suggest the necessary code modifications.*
"""
        return message

    def open_file_in_zed(self, file_path: str) -> bool:
        """Open a file in Zed using the zed CLI"""
        try:
            # Try different zed command variations
            zed_commands = ["zed", "zeditor", "Zed"]

            for cmd in zed_commands:
                try:
                    # Open file in existing Zed window or new window
                    subprocess.Popen(
                        [cmd, file_path],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                    print(f"[Zed] Opened file with {cmd}: {file_path}")
                    return True
                except FileNotFoundError:
                    continue

            print(f"[Zed] Could not find zed CLI command")
            return False

        except Exception as e:
            print(f"[Zed] Error opening file: {e}")
            return False

    def open_zed_assistant(self):
        """Open Zed AI Assistant panel using keyboard shortcut simulation"""
        try:
            if sys.platform == "win32":
                # Windows - use PowerShell to send Alt+L (Zed's assistant shortcut)
                ps_script = """
                Add-Type -AssemblyName System.Windows.Forms
                [System.Windows.Forms.SendKeys]::SendWait('%l')
                """
                subprocess.run(["powershell", "-Command", ps_script], check=True)
                print("[Zed] Sent Alt+L to open Assistant")
            elif sys.platform == "darwin":
                # macOS - use osascript to send Cmd+L
                subprocess.run(
                    [
                        "osascript",
                        "-e",
                        'tell application "Zed" to keystroke "l" using command down',
                    ],
                    check=True,
                )
                print("[Zed] Sent Cmd+L to open Assistant")
            else:
                # Linux - try xdotool
                subprocess.run(["xdotool", "key", "Alt+L"], check=True)
                print("[Zed] Sent Alt+L to open Assistant")
        except Exception as e:
            print(f"[Zed] Failed to open assistant panel: {e}")

    def copy_to_clipboard(self, text: str):
        """Copy text to clipboard"""
        try:
            if sys.platform == "win32":
                subprocess.run(["clip"], input=text.encode(), check=True)
            elif sys.platform == "darwin":
                subprocess.run(["pbcopy"], input=text.encode(), check=True)
            else:
                # Linux - try xclip or xsel
                try:
                    subprocess.run(
                        ["xclip", "-selection", "clipboard"],
                        input=text.encode(),
                        check=True,
                    )
                except FileNotFoundError:
                    subprocess.run(
                        ["xsel", "--clipboard", "--input"],
                        input=text.encode(),
                        check=True,
                    )
            print("[Zed] Context copied to clipboard")
        except Exception as e:
            print(f"[Zed] Failed to copy to clipboard: {e}")

    def show_notification(self, title: str, message: str):
        """Show desktop notification"""
        try:
            if sys.platform == "win32":
                # Windows notification (using PowerShell)
                ps_script = f"""
                [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
                [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
                $template = @"
<toast>
    <visual>
        <binding template="ToastText02">
            <text id="1">{title}</text>
            <text id="2">{message}</text>
        </binding>
    </visual>
</toast>
"@
                $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
                $xml.LoadXml($template)
                $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
                [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("AI UI Editor Bridge").Show($toast)
                """
                subprocess.run(["powershell", "-Command", ps_script], check=True)
            elif sys.platform == "darwin":
                subprocess.run(
                    [
                        "osascript",
                        "-e",
                        f'display notification "{message}" with title "{title}"',
                    ]
                )
            else:
                # Linux - try notify-send
                subprocess.run(["notify-send", title, message])
        except Exception as e:
            print(f"[Zed] Notification failed: {e}")

    async def handle_context(self, payload: dict):
        """Handle context received from bridge"""
        file_path = payload.get("filePath", "")
        prompt = payload.get("prompt", "")

        print(f"[Zed] Handling context for: {file_path}")
        print(f"[Zed] Prompt: {prompt[:100]}...")

        # Build context message
        context_message = self.build_context_message(payload)

        # Open file in Zed first
        if file_path:
            self.open_file_in_zed(file_path)
            # Small delay to ensure file is opened
            await asyncio.sleep(0.3)

        # Open Zed Assistant panel
        self.open_zed_assistant()
        await asyncio.sleep(0.2)

        # Copy context to clipboard
        self.copy_to_clipboard(context_message)

        # Show notification with instructions
        self.show_notification(
            "AI UI Editor Bridge",
            f"Context ready!\nFile: {file_path}\nAssistant opened - Press Ctrl+V to paste context",
        )

        print("[Zed] Context copied to clipboard, assistant panel opened")
        print("[Zed] User should paste (Ctrl+V) into the assistant chat")

        # Send acknowledgment
        if self.websocket:
            await self.websocket.send(
                json.dumps(
                    {
                        "type": "context_received",
                        "message": f"Context opened in Zed for {file_path}",
                        "instructions": "Context copied to clipboard. Paste into Assistant chat.",
                    }
                )
            )

    async def connect(self):
        """Connect to FastAPI bridge"""
        while True:
            try:
                print(f"[Zed] Connecting to {ZED_WS_URL}...")
                # Simple connection without extra headers
                async with websockets.connect(ZED_WS_URL) as websocket:
                    self.websocket = websocket
                    self.connected = True
                    print("[Zed] Connected to FastAPI Bridge")

                    # Send initial handshake
                    await websocket.send(
                        json.dumps({"type": "handshake", "ide": "zed"})
                    )

                    while self.connected:
                        try:
                            message = await websocket.recv()
                            payload = json.loads(message)
                            await self.handle_context(payload)
                        except websockets.exceptions.ConnectionClosed:
                            print("[Zed] Connection closed")
                            self.connected = False
                            break
                        except json.JSONDecodeError as e:
                            print(f"[Zed] Invalid JSON: {e}")

            except Exception as e:
                print(f"[Zed] Connection error: {e}")
                self.connected = False

            if not self.connected:
                print(f"[Zed] Reconnecting in {RECONNECT_DELAY}s...")
                await asyncio.sleep(RECONNECT_DELAY)

    async def run(self):
        """Run the Zed bridge"""
        print("=" * 50)
        print("🦀 AI UI Editor Bridge - Zed Edition")
        print("=" * 50)
        await self.connect()


async def main():
    bridge = ZedBridge()
    await bridge.run()


if __name__ == "__main__":
    asyncio.run(main())
