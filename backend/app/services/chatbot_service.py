import logging
import re
from typing import List, Dict, Any

from groq import AsyncGroq
from app.core.config import settings
from app.services.chatbot_knowledge import build_knowledge_block, PAGE_ROUTES, PAGE_LABELS

logger = logging.getLogger(__name__)

client = AsyncGroq(api_key=settings.GROQ_API_KEY) if settings.GROQ_API_KEY else None

if not settings.GROQ_API_KEY:
    logger.warning("GROQ_API_KEY is not set — AI chatbot will return fallback responses.")

# Model used — consistent with summary_service.py
MODEL = "openai/gpt-oss-120b"

# Safety caps
# Safety caps
MAX_TOKENS = 700
TEMPERATURE = 0.35
MAX_HISTORY_TURNS = 6  # 3 user + 3 assistant messages max

# Matches [Label](page:/route) — the AI's explicit link syntax.
_PAGE_LINK_RE = re.compile(r"\[([^\]]+)\]\(page:(/[a-zA-Z0-9\-_/]*)\)")

# Matches **Bolded Text** — used as a fallback to catch page names the AI
# mentioned but forgot to wrap in the [Label](page:/route) syntax.
_BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")

# Case-insensitive label -> route lookup built once at import time.
_LABEL_LOOKUP = {label.lower(): (label, route) for label, route in PAGE_LABELS.items()}


def _extract_page_links(reply: str) -> tuple[str, list[dict]]:
    """
    Turn page references in the AI's reply into inline clickable links
    instead of a separate button row, using two passes:

      Pass 1 — explicit [Label](page:/route) syntax, validated against the
               PAGE_ROUTES whitelist.
      Pass 2 — fallback: any remaining **Bolded Label** that exactly matches
               a known page name (PAGE_LABELS) also becomes clickable, even
               if the AI forgot the explicit syntax entirely.

    Both passes emit the same internal marker format: [[LINK:i|Label]],
    which is converted to markdown [Label](pagelink:i) at the end — the
    frontend resolves index i against the validated page_links array it
    receives alongside the reply, so a route string from the AI is never
    trusted directly as a navigable href.
    """
    links: list[dict] = []
    seen_routes: set[str] = set()

    def _register(label: str, route: str) -> int | None:
        if route not in PAGE_ROUTES:
            return None
        if route in seen_routes:
            # Already linked once — reuse that index so we don't create dupes.
            for i, link in enumerate(links):
                if link["route"] == route:
                    return i
            return None
        seen_routes.add(route)
        links.append({"label": label, "route": route})
        return len(links) - 1

    # ── Pass 1: explicit [Label](page:/route) syntax ──────────────────────
    def _replace_explicit(match: re.Match) -> str:
        label, route = match.group(1), match.group(2)
        idx = _register(label, route)
        if idx is None:
            return f"**{label}**"
        return f"[[LINK:{idx}|{label}]]"

    stage1 = _PAGE_LINK_RE.sub(_replace_explicit, reply)

    # ── Pass 2: fallback — bare **Bolded Label** matching a known page ────
    def _replace_bold(match: re.Match) -> str:
        text = match.group(1)
        hit = _LABEL_LOOKUP.get(text.strip().lower())
        if not hit:
            return match.group(0)  # leave normal bold text untouched
        canonical_label, route = hit
        idx = _register(canonical_label, route)
        if idx is None:
            return match.group(0)
        return f"[[LINK:{idx}|{text}]]"

    stage2 = _BOLD_RE.sub(_replace_bold, stage1)

    # ── Convert internal markers to real markdown links ────────────────────
    cleaned = re.sub(
        r"\[\[LINK:(\d+)\|([^\]]+)\]\]",
        lambda m: f"[{m.group(2)}](pagelink:{m.group(1)})",
        stage2,
    )

    return cleaned, links

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
        "• Use **bold** for key terms, feature names, statuses, and important warnings — "
        "  bold the single most crucial word or phrase in each answer so a skimming user "
        "  catches it immediately.\n"
        "• Use bullet points (•) for lists (e.g., status types, severity levels, features).\n"
        "• Use numbered steps (1. 2. 3.) for multi-step instructions.\n"
        "• Keep paragraphs short — 2-3 sentences maximum per paragraph.\n"
        "• Break up long explanations with line breaks between sections.\n"
        "• Avoid wall-of-text responses; structure answers for scannability.\n\n"

        "PAGE LINK RULES:\n"
        "• Whenever you mention a specific app page by name (Dashboard, All Reports, My "
        "  Submissions, Map View, Notifications, Settings, My Profile), ALWAYS wrap it in "
        "  the format [Label](page:/route) using the exact route from 'Available Page "
        "  Routes' below — every single time you reference that page, not just the first.\n"
        "• Never invent a route that isn't in that list. If no listed route fits, don't add a link.\n"
        "• Use the exact page name as the label (e.g. 'My Submissions', not 'your submissions' "
        "  or 'the submissions page') so it matches consistently.\n\n"

        "BE PROACTIVE AND ANTICIPATORY:\n"
        "• Think one step ahead of the literal question. If someone asks how severity "
        "  works, they'll likely also want to know how it affects repair priority — weave "
        "  that in briefly rather than waiting to be asked.\n"
        "• When relevant, connect related features (e.g. mention duplicate checking when "
        "  explaining how to submit, mention upvotes when explaining report status).\n"
        "• If the question is ambiguous, answer the most likely interpretation first, then "
        "  briefly note the other angle rather than asking a clarifying question — users "
        "  in a chat widget want an answer, not a follow-up question.\n\n"

        "STRICT RULES:\n"
        "1. You must ONLY answer questions related to Snap2Fix.\n"
        "2. If a user asks about general knowledge, politics, celebrities, math problems, "
        "   coding help, or anything unrelated to Snap2Fix, politely redirect them back "
        "   to Snap2Fix topics. Example: \"I'm here to help with Snap2Fix! If you have "
        "   questions about submitting reports, tracking status, or using the app, I'm "
        "   happy to assist.\"\n"
        "3. Never reveal internal system details (API keys, database schema, admin routes "
        "   not listed in Available Page Routes).\n"
        "4. Keep responses concise (2-4 sentences max per paragraph) unless the user explicitly asks for detail.\n"
        "5. Be friendly, warm, and helpful — never robotic or overly formal.\n"
        "6. Use the knowledge base below to answer. If the knowledge base does not cover "
        "   the exact question, say you don't have that specific info and suggest "
        "   contacting admin support or checking the relevant page.\n"
        "7. Do not make up features, policies, or routes that are not in the knowledge base.\n"
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
            "page_links": [],
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
        cleaned_reply, page_links = _extract_page_links(choice.message.content.strip())
        return {
            "reply": cleaned_reply,
            "page_links": page_links,
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
            "page_links": [],
            "model": MODEL,
            "finish_reason": "error",
        }
