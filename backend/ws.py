"""WebSocket connection manager for streaming analysis progress."""

import json
import asyncio
from fastapi import WebSocket
from typing import Dict, Optional


class ConnectionManager:
    """Manages WebSocket connections for analysis streaming with event replay."""

    def __init__(self):
        self.active_connections: Dict[str, list[WebSocket]] = {}
        self.history: Dict[str, list[dict]] = {}
        self.main_loop: Optional[asyncio.AbstractEventLoop] = None

    async def connect(self, websocket: WebSocket, task_id: str):
        # Capture main FastAPI event loop
        try:
            self.main_loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

        await websocket.accept()
        if task_id not in self.active_connections:
            self.active_connections[task_id] = []
        self.active_connections[task_id].append(websocket)

        # Replay past events to the newly connected websocket
        if task_id in self.history:
            for event in list(self.history[task_id]):
                try:
                    await websocket.send_json(event)
                except Exception:
                    break

    def disconnect(self, websocket: WebSocket, task_id: str):
        if task_id in self.active_connections:
            self.active_connections[task_id] = [
                ws for ws in self.active_connections[task_id] if ws != websocket
            ]
            if not self.active_connections[task_id]:
                del self.active_connections[task_id]

    async def send_event(self, task_id: str, event: dict):
        """Send an event to all WebSocket connections for a task, and buffer in history.

        Handles execution both on main event loop and from background threads.
        """
        if task_id not in self.history:
            self.history[task_id] = []
        self.history[task_id].append(event)

        if task_id not in self.active_connections:
            return

        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if self.main_loop and self.main_loop.is_running() and current_loop != self.main_loop:
            # Called from worker thread's loop — schedule on main FastAPI event loop
            asyncio.run_coroutine_threadsafe(self._broadcast(task_id, event), self.main_loop)
        else:
            await self._broadcast(task_id, event)

    async def _broadcast(self, task_id: str, event: dict):
        if task_id not in self.active_connections:
            return
        dead = []
        for ws in list(self.active_connections.get(task_id, [])):
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, task_id)

    def clear_task(self, task_id: str):
        """Clear task history and connections when done."""
        if task_id in self.history:
            del self.history[task_id]
        if task_id in self.active_connections:
            del self.active_connections[task_id]


manager = ConnectionManager()


