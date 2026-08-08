"""
backend/app/api/v1/chatbot.py
Snap2Fix AI Chatbot endpoint
"""

import logging

from fastapi import APIRouter, HTTPException, status

from app.schemas.chatbot import ChatRequest, ChatResponse
from app.services.chatbot_service import chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])


@router.post("", response_model=ChatResponse)
async def chatbot_message(payload: ChatRequest):
    """
    Send a message to SnapBot, the Snap2Fix AI assistant.

    - **message**: The user's question or message (max 1000 chars).
    - **history**: Optional conversation history for multi-turn context.
    """
    try:
        result = await chat(
            message=payload.message,
            history=[{"role": m.role, "content": m.content} for m in payload.history],
        )
        return ChatResponse(
            reply=result["reply"],
            model=result["model"],
            finish_reason=result.get("finish_reason"),
            page_links=result.get("page_links", []),
        )
    except Exception as e:
        logger.error(f"Chatbot endpoint error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Chatbot service error. Please try again later.",
        )
