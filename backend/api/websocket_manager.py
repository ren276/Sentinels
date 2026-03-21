"""
WebSocket connection manager for real-time metric broadcasting.
"""
import asyncio
import json
from typing import Any
from fastapi import WebSocket
import structlog

log = structlog.get_logger()


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        log.info("ws.connected", total=len(self.active_connections))

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        log.info("ws.disconnected", total=len(self.active_connections))

    async def broadcast(self, message: dict[str, Any]) -> None:
        if not self.active_connections:
            return
        data = json.dumps(message, default=str)
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(data)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)

    async def send_personal(self, websocket: WebSocket, message: dict[str, Any]) -> None:
        try:
            await websocket.send_text(json.dumps(message, default=str))
        except Exception:
            self.disconnect(websocket)

    def connection_count(self) -> int:
        return len(self.active_connections)


ws_manager = ConnectionManager()
