"""
WebSocket router — real-time notification push.
Clients connect to /ws?token=<access_token> and receive
JSON events whenever a notification is created for their user_id.

Event shape:
  {
    "event": "notification",
    "id": 42,
    "title": "Report Status Updated",
    "message": "Your report #7 is now VERIFIED.",
    "type": "info",
    "report_id": 7
  }
"""
import json
import logging
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.auth_service import decode_access_token
from app.services.user_service import get_by_public_id

logger = logging.getLogger(__name__)
router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    """Manages active WebSocket connections keyed by integer user_id."""

    def __init__(self):
        # user_id (int) -> set of active WebSocket connections
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, user_id: int) -> None:
        await websocket.accept()
        self._connections[user_id].add(websocket)
        logger.info(f"WS connected — user_id={user_id} total={len(self._connections[user_id])}")

    def disconnect(self, websocket: WebSocket, user_id: int) -> None:
        self._connections[user_id].discard(websocket)
        if not self._connections[user_id]:
            del self._connections[user_id]
        logger.info(f"WS disconnected — user_id={user_id}")

    async def send_to_user(self, user_id: int, data: dict[str, Any]) -> None:
        """Send a JSON message to all connections for a given user_id (int)."""
        sockets = self._connections.get(user_id, set()).copy()
        for ws in sockets:
            try:
                await ws.send_text(json.dumps(data))
            except Exception as e:
                logger.warning(f"WS send failed for user_id={user_id}: {e}")
                self._connections[user_id].discard(ws)


# Singleton — imported by notification_service
manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticate via token query param, then hold the connection open.
    The server pushes notifications; the client does not need to send anything.

    FIX: Previously used hash(sub_string) as the connection key, while
    notification_service called send_to_user(user_id=<int>). Keys never
    matched — push was silently broken for every connected client.

    Now we look up the User from the JWT sub (public_id) and store the
    connection under the integer user_id, which is what notify() uses.
    """
    from uuid import UUID

    try:
        payload = decode_access_token(token)
        public_id_str: str = payload.get("sub", "")
        token_type: str = payload.get("type", "")

        if not public_id_str or token_type != "access":
            await websocket.close(code=4001, reason="Invalid token.")
            return
    except JWTError:
        await websocket.close(code=4001, reason="Invalid or expired token.")
        return

    # Resolve public_id → integer user_id so the key matches notify()
    try:
        user = await get_by_public_id(db, UUID(public_id_str))
    except Exception:
        await websocket.close(code=4001, reason="Invalid token subject.")
        return

    if not user or not user.is_active:
        await websocket.close(code=4003, reason="User not found or inactive.")
        return

    user_id: int = user.id
    await manager.connect(websocket, user_id)

    try:
        while True:
            await websocket.receive_text()  # discard any client messages
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)