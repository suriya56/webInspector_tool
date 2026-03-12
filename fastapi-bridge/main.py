import asyncio
import json
from typing import Dict, Optional

import websockets
from dotenv import load_dotenv
from websockets.server import serve

load_dotenv()

# Connection state
connections: Dict[str, websockets.WebSocketServerProtocol] = {}
browser_ws = None

# Supported IDEs
IDE_TYPES = ["vscode", "zed", "windsurf"]


def get_connected_ides():
    """Get list of connected IDEs"""
    return [ide for ide in IDE_TYPES if ide in connections]


async def forward_context_to_ide(payload: dict, target_ide: str = "auto"):
    """Forward browser context to IDE"""
    global connections, browser_ws

    prompt = payload.get("prompt", "")
    file_path = payload.get("filePath", "")
    tag_name = payload.get("tagName", "")

    print(f"Forwarding context to IDE (target: {target_ide}) for file: {file_path}")
    print(f"Prompt: {prompt[:100]}...")

    connected_ides = get_connected_ides()

    if not connected_ides:
        print("[Bridge] No IDE connections found")
        if browser_ws:
            await browser_ws.send(
                json.dumps(
                    {
                        "type": "error",
                        "message": "No IDE connected. Please open VS Code, Zed, or Windsurf.",
                    }
                )
            )
        return

    if target_ide == "auto":
        target_ide = connected_ides[0]
        print(f"[Bridge] Auto-selected IDE: {target_ide}")
    elif target_ide not in connected_ides:
        print(
            f"[Bridge] Target IDE {target_ide} not connected, using {connected_ides[0]}"
        )
        target_ide = connected_ides[0]

    if target_ide in connections:
        ide_ws = connections[target_ide]
        await ide_ws.send(json.dumps(payload))
        print(f"[Bridge] Context forwarded to {target_ide.upper()}")

        if browser_ws:
            await browser_ws.send(
                json.dumps(
                    {
                        "type": "context_sent",
                        "ide": target_ide,
                        "message": f"Context sent to {target_ide.upper()} for {file_path}",
                        "prompt": prompt,
                        "element": f"{tag_name}",
                    }
                )
            )
    else:
        if browser_ws:
            await browser_ws.send(
                json.dumps(
                    {
                        "type": "error",
                        "message": f"{target_ide.upper()} connection not available",
                    }
                )
            )


async def browser_handler(websocket):
    """Handle browser WebSocket connections"""
    global browser_ws, connections

    browser_ws = websocket
    connections["browser"] = websocket
    print("[+] browser connected")

    try:
        async for message in websocket:
            print(f"[Browser] Received: {message[:200]}...")

            try:
                payload = json.loads(message)
                target_ide = payload.get("targetIde", "auto")
                await forward_context_to_ide(payload, target_ide)
            except json.JSONDecodeError as e:
                print(f"Invalid JSON from browser: {e}")
                await websocket.send(
                    json.dumps({"error": "Invalid JSON format", "details": str(e)})
                )
    except websockets.exceptions.ConnectionClosed:
        print("Browser disconnected")
    finally:
        if "browser" in connections:
            del connections["browser"]
        browser_ws = None


async def ide_handler(websocket, ide_type: str):
    """Handle IDE WebSocket connections"""
    global connections

    connections[ide_type] = websocket
    print(f"[+] {ide_type} connected")

    try:
        async for message in websocket:
            print(f"[{ide_type.upper()}] Received: {message}")

            # Forward status to browser
            if browser_ws:
                try:
                    await browser_ws.send(
                        json.dumps(
                            {"type": "ide_status", "ide": ide_type, "message": message}
                        )
                    )
                except:
                    pass
    except websockets.exceptions.ConnectionClosed:
        print(f"{ide_type.upper()} disconnected")
    finally:
        if ide_type in connections:
            del connections[ide_type]


async def handler(websocket):
    """Route WebSocket connections to appropriate handlers"""
    # Get path - handle different websockets library versions
    if hasattr(websocket, "request"):
        path = str(websocket.request.path)
    elif hasattr(websocket, "path"):
        path = str(websocket.path)
    else:
        path = str(websocket)

    # Debug: print raw path
    print(f"[WS] Raw path: '{path}' (type: {type(path).__name__})")

    # Strip query parameters and normalize
    path = path.split("?")[0].strip()

    print(f"[WS] Normalized path: '{path}'")

    if path == "/ws/browser":
        await browser_handler(websocket)
    elif "/vscode" in path or path == "/ws/ide":
        await ide_handler(websocket, "vscode")
    elif "/zed" in path:
        await ide_handler(websocket, "zed")
    elif "/windsurf" in path:
        await ide_handler(websocket, "windsurf")
    else:
        print(f"[WS] Unknown endpoint: '{path}'")
        print(
            f"[WS] Available: /ws/browser, /ws/ide/vscode, /ws/ide/zed, /ws/ide/windsurf"
        )
        await websocket.close(4004, "Unknown endpoint")


async def process_request(path, request_headers):
    """Handle HTTP requests"""
    if path == "/":
        return (
            200,
            [("Content-Type", "application/json")],
            json.dumps(
                {
                    "message": "AI UI Editor Bridge Server - Multi-IDE Support",
                    "endpoints": {
                        "browser": "/ws/browser",
                        "vscode": "/ws/ide/vscode",
                        "zed": "/ws/ide/zed",
                        "windsurf": "/ws/ide/windsurf",
                    },
                    "connected_ides": get_connected_ides(),
                }
            ).encode(),
        )
    return None


async def main():
    print("=" * 50)
    print("🌉 AI UI Editor Bridge Server")
    print("=" * 50)
    print("Starting WebSocket server on ws://0.0.0.0:8000")
    print()
    print("Endpoints:")
    print("  - /ws/browser    (Browser toolbar)")
    print("  - /ws/ide/vscode (VS Code extension)")
    print("  - /ws/ide/zed    (Zed bridge)")
    print("  - /ws/ide/windsurf (Windsurf extension)")
    print()
    print("Waiting for connections...")
    print()

    async with serve(
        handler, "0.0.0.0", 8000, process_request=process_request
    ) as server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
