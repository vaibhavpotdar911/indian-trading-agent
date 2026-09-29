"""WebSocket connection manager for streaming analysis progress."""

import json
import asyncio
from fastapi import WebSocket
from typing import Dict


class ConnectionManager:
    """Manages WebSocket connections for analysis streaming with event replay."""

    def __init__(self):
        self.active_connections: Dict[str, list[WebSocket]] = {}
        self.history: Dict[str, list[dict]] = {}

    async def connect(self, websocket: WebSocket, task_id: str):
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
        """Send an event to all WebSocket connections for a task, and buffer in history."""
        if task_id not in self.history:
            self.history[task_id] = []
        self.history[task_id].append(event)

        if task_id not in self.active_connections:
            return

        dead = []
        for ws in self.active_connections[task_id]:
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

