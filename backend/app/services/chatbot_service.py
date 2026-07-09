"""
Snap2Fix AI Chatbot Service
===========================
Uses the Groq API (via groq Python SDK) to generate scoped, app-specific
responses. Loads the knowledge base from chatbot_knowledge.py and injects
it into a strict system prompt to constrain the AI to Snap2Fix topics only.
"""

import logging
from typing import List, Dict, Any

from groq import AsyncGroq
from app.core.config import settings
from app.services.chatbot_knowledge import build_knowledge_block

logger = logging.getLogger(__name__)

client = AsyncGroq(api_key=settings.GROQ_API_KEY) if settings.GROQ_API_KEY else None

if not settings.GROQ_API_KEY:
    logger.warning("GROQ_API_KEY is not set — AI chatbot will return fallback responses.")

# Model used — consistent with summary_service.py
MODEL = "llama-3.3-70b-versatile"

# Safety caps
MAX_TOKENS = 500
TEMPERATURE = 0.35
MAX_HISTORY_TURNS = 6  # 3 user + 3 assistant messages max


# ══════════════════════════════════════════════════════════════════════════════
# System prompt builder
# ══════════════════════════════════════════════════════════════════════════════

def _build_system_prompt() -> str:
    knowledge = build_knowledge_block()
    return (
        "You are SnapBot, the official AI assistant for the Snap2Fix road damage "
        "reporting platform.\n\n"

        "Your ONLY job is to help users with questions about Snap2Fix: how to submit "
        "reports, how severity levels work, how to track report status, how the AI "
        "detection and summary features work, app navigation, account settings, and "
        "troubleshooting issues with the app itself.\n\n"

        "FORMATTING RULES (always apply these):\n"
        "• Use **bold** for key terms, feature names, and important warnings.\n"
        "• Use bullet points (•) for lists (e.g., status types, severity levels, features).\n"
        "• Use numbered steps (1. 2. 3.) for multi-step instructions.\n"
        "• Keep paragraphs short — 2-3 sentences maximum per paragraph.\n"
        "• Break up long explanations with line breaks between sections.\n"
        "• Avoid wall-of-text responses; structure answers for scannability.\n\n"

        "STRICT RULES:\n"
        "1. You must ONLY answer questions related to Snap2Fix.\n"
        "2. If a user asks about general knowledge, politics, celebrities, math problems, "
        "   coding help, or anything unrelated to Snap2Fix, politely redirect them back "
        "   to Snap2Fix topics. Example: \"I'm here to help with Snap2Fix! If you have "
        "   questions about submitting reports, tracking status, or using the app, I'm "
        "   happy to assist.\"\n"
        "3. Never reveal internal system details (API keys, database schema, admin routes).\n"
        "4. Keep responses concise (2-4 sentences max per paragraph) unless the user explicitly asks for detail.\n"
        "5. Be friendly and helpful, not robotic.\n"
        "6. Use the knowledge base below to answer. If the knowledge base does not cover "
        "   the exact question, say you don't have that specific info and suggest "
        "   contacting admin support or visiting the FAQ.\n"
        "7. Do not make up features or policies that are not in the knowledge base.\n"
        "8. If you cannot confidently answer, provide a polite escalation fallback that "
        "   includes: (a) an apology, (b) a suggestion to contact support at snap2fix.admin@gmail.com, "
        "   and (c) a mention that they can check the Notifications page or Settings for more help.\n\n"

        f"{knowledge}\n\n"

        "Remember: you are SnapBot, and your world is Snap2Fix only."
    )


# ══════════════════════════════════════════════════════════════════════════════
# Public service functions
# ══════════════════════════════════════════════════════════════════════════════

def _trim_history(history: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """Keep only the most recent N message pairs to stay within context limits."""
    # history entries: {"role": "user"|"assistant", "content": "..."}
    if len(history) <= MAX_HISTORY_TURNS:
        return history
    return history[-MAX_HISTORY_TURNS:]


async def chat(
    message: str,
    history: List[Dict[str, str]] | None = None,
) -> Dict[str, Any]:
    """
    Send a user message + conversation history to Groq and return the AI response.

    Returns:
        {"reply": str, "model": str, "finish_reason": str | None}
    """
    if not client:
        logger.error("Chatbot unavailable — GROQ_API_KEY is missing.")
        return {
            "reply": (
                "SnapBot is temporarily unavailable. Please check back later "
                "or contact support."
            ),
            "model": MODEL,
            "finish_reason": "service_unavailable",
        }

    trimmed = _trim_history(history or [])
    messages: List[Dict[str, str]] = [
        {"role": "system", "content": _build_system_prompt()},
        *trimmed,
        {"role": "user", "content": message},
    ]

    try:
        response = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
            max_tokens=MAX_TOKENS,
            temperature=TEMPERATURE,
        )
        choice = response.choices[0]
        return {
            "reply": choice.message.content.strip(),
            "model": response.model,
            "finish_reason": choice.finish_reason,
        }
    except Exception as e:
        logger.error(f"Groq chat failed: {e}", exc_info=True)
        return {
            "reply": (
                "I'm having trouble connecting right now. "
                "Please try again in a moment!"
            ),
            "model": MODEL,
            "finish_reason": "error",
        }
