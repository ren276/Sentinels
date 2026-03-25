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
        self.active_connections: dict[WebSocket, dict] = {}
        self.user_connections: dict[str, set[WebSocket]] = {}
        self.MAX_CONNECTIONS_PER_USER = 5

    async def connect(self, websocket: WebSocket, user_info: dict) -> bool:
        user_id = user_info.get("sub")
        if not user_id:
            return False
            
        # Enforce max connections per user
        current_conns = self.user_connections.get(user_id, set())
        if len(current_conns) >= self.MAX_CONNECTIONS_PER_USER:
            log.warning("ws.too_many_connections", user_id=user_id)
            return False
            
        await websocket.accept()
        self.active_connections[websocket] = user_info
        
        if user_id not in self.user_connections:
            self.user_connections[user_id] = set()
        self.user_connections[user_id].add(websocket)
        
        log.info("ws.connected", user_id=user_id, total=len(self.active_connections))
        return True

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            user_info = self.active_connections.pop(websocket)
            user_id = user_info.get("sub")
            if user_id and user_id in self.user_connections:
                self.user_connections[user_id].discard(websocket)
                if not self.user_connections[user_id]:
                    del self.user_connections[user_id]
        log.info("ws.disconnected", total=len(self.active_connections))

    async def broadcast(self, message: dict[str, Any]) -> None:
        if not self.active_connections:
            return
            
        disconnected = []
        # Use list() to avoid dictionary changed size during iteration
        for connection, user_info in list(self.active_connections.items()):
            # Security: Per-user message filtering
            role = user_info.get("role", "observer")
            event_type = message.get("type")
            
            # Observers cannot see raw logs/metrics streams if we decide so
            if role == "observer" and event_type == "raw_log":
                continue
                
            # Incident room events restricted if not authorized
            if message.get("incident_id") and role == "observer" and event_type in ("rca_update", "postmortem_update"):
                continue

            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        
        for conn in disconnected:
            self.disconnect(conn)

    async def send_personal(self, websocket: WebSocket, message: dict[str, Any]) -> None:
        try:
            await websocket.send_json(message)
        except Exception:
            self.disconnect(websocket)

    def connection_count(self) -> int:
        return len(self.active_connections)


ws_manager = ConnectionManager()
