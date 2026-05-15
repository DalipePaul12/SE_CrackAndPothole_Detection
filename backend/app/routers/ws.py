"""
backend/app/routers/ws.py
─────────────────────────
WebSocket router — real-time notification push.

Authentication flow (secure — token NOT in URL query string):
  1. Client connects to /ws  (no token in URL)
  2. Client immediately sends: {"type": "auth", "token": "<access_token>"}
  3. Server validates token, resolves user, registers connection
  4. Server pushes JSON notification events to connected clients

Event shape pushed to clients:
  {
    "event":     "notification",
    "id":        42,
    "title":     "Report Status Updated",
    "message":   "Your report #7 is now verified.",
    "type":      "info",
    "report_id": 7
  }

FIXES:
  - Removed duplicate @router.websocket("/ws") that caused silent routing bug
  - Token moved from URL query param to first WebSocket message (security fix)
  - ConnectionManager keys on integer user_id to match notify_background()
  - Added asyncio.wait_for timeout on auth handshake to prevent hanging connections
  - Added missing asyncio + decode_token imports
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.auth_service import decode_access_token
from app.services.user_service import get_by_public_id

logger = logging.getLogger(__name__)
router = APIRouter(tags=["WebSocket"])

# Auth handshake timeout — close the socket if the client doesn't send auth
# within this many seconds of connecting.
_AUTH_TIMEOUT_SECONDS = 10


# ── Connection manager ────────────────────────────────────────────────────────

class ConnectionManager:
    """
    Manages active WebSocket connections keyed by integer user_id.

    Uses integer user_id (not public_id UUID string) because
    notify_background() calls send_to_user(user_id=<int>).
    Using the wrong key type causes silent push failures.
    """

    def __init__(self) -> None:
        # int user_id → set of active WebSocket connections
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, user_id: int) -> None:
        await websocket.accept()
        self._connections[user_id].add(websocket)
        logger.info(
            "WS connected — user_id=%d  active_sockets=%d",
            user_id, len(self._connections[user_id]),
        )

    def disconnect(self, websocket: WebSocket, user_id: int) -> None:
        self._connections[user_id].discard(websocket)
        if not self._connections[user_id]:
            del self._connections[user_id]
        logger.info("WS disconnected — user_id=%d", user_id)

    async def send_to_user(self, user_id: int, data: dict[str, Any]) -> None:
        """Push a JSON message to every active socket for this user."""
        sockets = self._connections.get(user_id, set()).copy()
        dead: set[WebSocket] = set()

        for ws in sockets:
            try:
                await ws.send_text(json.dumps(data))
            except Exception as exc:
                logger.warning(
                    "WS send failed for user_id=%d — removing socket: %s",
                    user_id, exc,
                )
                dead.add(ws)

        # Clean up dead sockets
        for ws in dead:
            self._connections[user_id].discard(ws)

    @property
    def active_user_count(self) -> int:
        return len(self._connections)


# Singleton — imported by notification_service to push events
manager = ConnectionManager()


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Single WebSocket endpoint. Token is sent as the FIRST message after
    connection (not in the URL) to keep it out of server logs and browser
    history.

    Close codes used:
      4001 — authentication failure (bad/expired token, wrong message type)
      4002 — auth message not received within timeout
      4003 — user not found or deactivated
    """
    await websocket.accept()

    # ── Step 1: Wait for auth handshake ──────────────────────────────────
    try:
        raw = await asyncio.wait_for(
            websocket.receive_text(),
            timeout=_AUTH_TIMEOUT_SECONDS,
        )
        auth_msg: dict = json.loads(raw)
    except asyncio.TimeoutError:
        logger.warning("WS auth timeout — closing connection")
        await websocket.close(code=4002, reason="Auth timeout.")
        return
    except Exception:
        await websocket.close(code=4001, reason="Invalid auth message.")
        return

    if auth_msg.get("type") != "auth":
        await websocket.close(code=4001, reason="First message must be {type: 'auth', token: '...'}.")
        return

    # ── Step 2: Validate JWT ──────────────────────────────────────────────
    token: str = auth_msg.get("token", "")
    try:
        payload = decode_access_token(token)
    except JWTError:
        await websocket.close(code=4001, reason="Invalid or expired token.")
        return

    public_id_str: str = payload.get("sub", "")
    token_type: str    = payload.get("type", "")

    if not public_id_str or token_type != "access":
        await websocket.close(code=4001, reason="Invalid token claims.")
        return

    # ── Step 3: Resolve integer user_id ──────────────────────────────────
    try:
        user = await get_by_public_id(db, UUID(public_id_str))
    except Exception:
        await websocket.close(code=4001, reason="Invalid token subject.")
        return

    if not user or not user.is_active:
        await websocket.close(code=4003, reason="User not found or inactive.")
        return

    user_id: int = user.id

    # ── Step 4: Register connection and confirm to client ─────────────────
    # Connection is already accepted; register under integer user_id
    self_websocket_registered = False
    try:
        manager._connections[user_id].add(websocket)
        self_websocket_registered = True
        logger.info(
            "WS authenticated — user_id=%d  active_users=%d",
            user_id, manager.active_user_count,
        )

        # Tell the client the handshake succeeded
        await websocket.send_text(json.dumps({"event": "connected", "user_id": user_id}))

        # ── Step 5: Hold connection open — server pushes, client listens ──
        while True:
            # Receive and discard any client messages (keepalive pings, etc.)
            await websocket.receive_text()

    except WebSocketDisconnect:
        pass
    finally:
        if self_websocket_registered:
            manager.disconnect(websocket, user_id)