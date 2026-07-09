"""
Pydantic schemas for the Snap2Fix AI Chatbot API.
"""

from typing import List

from pydantic import BaseModel, Field

from app.schemas.base import AppBaseModel


class ChatMessage(BaseModel):
    """A single message in the conversation history."""
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=2000)


class ChatRequest(AppBaseModel):
    """POST /api/v1/chatbot request body."""
    message: str = Field(..., min_length=1, max_length=1000, description="User's message")
    history: List[ChatMessage] = Field(default_factory=list, description="Previous turns")


class ChatResponse(AppBaseModel):
    """POST /api/v1/chatbot response."""
    reply: str = Field(..., description="AI-generated reply")
    model: str = Field(..., description="Groq model used")
    finish_reason: str | None = Field(None, description="Completion finish reason")
