"""
Snap2Fix Chatbot Knowledge Base
================================
Curated FAQ content, feature descriptions, page routes, and common user
questions about the Snap2Fix road damage reporting platform.
"""

from typing import List, Dict


# ── Clickable page routes ───────────────────────────────────────────────────
# SnapBot is only allowed to link to routes listed here. AI-generated
# [Label](page:/route) tokens are validated against this whitelist server-side.
PAGE_ROUTES: Dict[str, str] = {
    "/dashboard": "Dashboard — overview of your reports, stats, and recent activity.",
    "/dashboard/reports": "All Reports — browse all public reports, and submit a new one from here.",
    "/dashboard/submissions": "My Submissions — full list of every report you've submitted, with status filters.",
    "/dashboard/mapview": "Map View — interactive map of all public reports, filterable by damage type, severity, and status.",
    "/dashboard/notifications": "Notifications — status updates, comments, and upvotes on your reports.",
    "/dashboard/settings": "Settings — account details, password, and notification preferences.",
    "/dashboard/profile": "My Profile — your account details and profile picture.",
}

# ── Label → route fallback map ──────────────────────────────────────────────
# Safety net: if the AI mentions a page by its exact bolded name but forgets
# the [Label](page:/route) syntax, this catches it so a clickable link still
# gets generated. Keys are matched case-insensitively against **bold** spans.
PAGE_LABELS: Dict[str, str] = {
    "Dashboard": "/dashboard",
    "All Reports": "/dashboard/reports",
    "My Submissions": "/dashboard/submissions",
    "Map View": "/dashboard/mapview",
    "Notifications": "/dashboard/notifications",
    "Settings": "/dashboard/settings",
    "My Profile": "/dashboard/profile",
}


# ── Core knowledge sections ─────────────────────────────────────────────────

FEATURES: Dict[str, str] = {
    "submit_report": (
        "Users submit road damage reports by uploading a photo or video of the "
        "damage from the [All Reports](page:/dashboard/reports) page. The AI "
        "engine automatically detects cracks and potholes, assigns a severity "
        "level (Low, Moderate, High, Critical), and estimates a confidence "
        "score. Users can add a manual description and pin the exact location "
        "on a map. Submission takes under a minute for a single clear photo."
    ),
    "severity_levels": (
        "Snap2Fix uses four severity levels:\n"
        "• Low — Minor surface issues, cosmetic damage, no immediate hazard.\n"
        "• Moderate — Visible damage that may worsen; affects ride quality.\n"
        "• High — Significant hazard; risk to vehicles or pedestrians.\n"
        "• Critical — Severe damage requiring urgent immediate repair.\n"
        "Severity is determined by the AI detection model based on visual size, "
        "depth cues, and damage pattern, and can be adjusted by admins during "
        "review. Critical reports are prioritized in the repair queue."
    ),
    "ai_detection": (
        "Snap2Fix runs two YOLO-based detection models — one trained for "
        "potholes and one for cracks. When a user uploads media, the AI "
        "analyzes the image, draws bounding boxes, and outputs a damage type + "
        "confidence score. Detections below the confidence threshold are "
        "flagged as 'uncertain' and queued for human review instead of being "
        "auto-classified."
    ),
    "ai_summary": (
        "Every submitted report can generate an AI plain-language summary that "
        "describes the damage, severity, location, and confidence in 1-2 "
        "sentences. There's a daily generation limit per user (5/day) since it "
        "calls a billed external API — once generated, it's cached and never "
        "re-triggers the limit."
    ),
    "status_tracking": (
        "Reports move through a lifecycle with these statuses:\n"
        "• Pending — Submitted, awaiting admin review.\n"
        "• Verified — Admin has confirmed the report is valid.\n"
        "• In Progress — Repair work has been assigned or started.\n"
        "• Resolved — The damage has been fixed and the report is closed.\n"
        "• Declined — The report was rejected (duplicate, fake, or out of scope).\n"
        "Track every status change in [My Submissions](page:/dashboard/submissions) "
        "or on the [Dashboard](page:/dashboard)."
    ),
    "map_view": (
        "The [Map View](page:/dashboard/mapview) shows all public reports as "
        "interactive pins, filterable by damage type, severity, and status. "
        "Clicking a pin opens the report detail — it's the fastest way to check "
        "what's already reported near you before submitting a new one."
    ),
    "notifications": (
        "Users get in-app notifications whenever a report changes status, gets "
        "a comment, or receives an upvote. See them all on the "
        "[Notifications](page:/dashboard/notifications) page — updates arrive "
        "live over WebSocket."
    ),
    "upvotes": (
        "Users can upvote other people's reports to signal urgency. Highly "
        "upvoted reports get prioritized in admin dashboards. You cannot "
        "upvote your own report."
    ),
    "fake_detection": (
        "The platform includes AI-powered fake-image detection to catch photos "
        "that aren't genuine road damage. Reports that fail this check may be "
        "auto-declined or flagged for manual admin review."
    ),
    "duplicate_check": (
        "When submitting near an existing report, the system checks GPS "
        "coordinates for duplicates and warns you, letting you upvote the "
        "existing one instead of creating a near-identical new one."
    ),
    "account": (
        "Accounts use email + OTP verification. Update your name, contact "
        "number, profile picture, or password from "
        "[Settings](page:/dashboard/settings)."
    ),
    "contribution_score": (
        "The [Dashboard](page:/dashboard) shows a personal Contribution score "
        "and reporter badge (New / Rising / Active / Top Reporter) based on how "
        "many reports you've submitted and how many were resolved."
    ),
}

FAQ: List[Dict[str, str]] = [
    {
        "q": "How do I submit a report?",
        "a": (
            "Go to [All Reports](page:/dashboard/reports), upload a clear photo "
            "or video of the damage, let the AI detect it automatically, add a "
            "description if you want, pin the location, and tap **Submit**."
        ),
    },
    {
        "q": "What photo quality do I need?",
        "a": (
            "The photo should be **clear, well-lit, and close enough** that the "
            "damage is visible. Max file size: 50 MB images, 150 MB videos. "
            "Supported formats: JPEG, PNG, WebP for images; MP4, MOV for video."
        ),
    },
    {
        "q": "Why did my report get declined?",
        "a": (
            "Reports are declined for duplicates, photos that don't show real "
            "road damage, out-of-area locations, or admin review. Check "
            "[My Submissions](page:/dashboard/submissions) for the specific "
            "reason."
        ),
    },
    {
        "q": "How long does it take for a report to be fixed?",
        "a": (
            "Depends on severity and repair capacity — **Critical** reports go "
            "first. Track live status on your [Dashboard](page:/dashboard)."
        ),
    },
    {
        "q": "Can I edit a report after submitting?",
        "a": (
            "Yes, while it's still **Pending** or **Declined** — you can edit "
            "the barangay, street name, and description. Once Verified or "
            "beyond, only admins can modify it."
        ),
    },
    {
        "q": "What is the AI summary?",
        "a": (
            "A short auto-generated paragraph summarizing a report's damage "
            "type, severity, location, and AI confidence. Capped at 5 per user "
            "per day."
        ),
    },
    {
        "q": "Is my data safe?",
        "a": (
            "Yes. Photos are stored securely, location is used only for "
            "pinning, and personal info is never shown publicly."
        ),
    },
    {
        "q": "I forgot my password",
        "a": (
            "Use the password reset flow on the login screen — an OTP is sent "
            "to your email. You can also change it anytime from "
            "[Settings](page:/dashboard/settings)."
        ),
    },
    {
        "q": "How does severity get decided?",
        "a": (
            "The AI estimates it first from visual size, depth, and pattern of "
            "the damage. Admins can override it during review."
        ),
    },
    {
        "q": "Can I delete my account?",
        "a": (
            "Yes — from [Settings](page:/dashboard/settings). It's permanent."
        ),
    },
    {
        "q": "What's the difference between Verified and In Progress?",
        "a": (
            "**Verified** = admin confirmed it's legit, repair not started yet. "
            "**In Progress** = a contractor is actively working on it."
        ),
    },
    {
        "q": "Do I need an account to view reports?",
        "a": (
            "You need an account to submit, upvote, or comment, but the "
            "[Map View](page:/dashboard/mapview) is there once you're logged in."
        ),
    },
]

TROUBLESHOOTING: List[Dict[str, str]] = [
    {
        "q": "The app is not detecting my damage photo",
        "a": (
            "Make sure the damage takes up a good portion of the frame. If AI "
            "still can't detect it, you can manually mark damage type and "
            "severity when submitting — it'll be flagged for review instead of "
            "blocking your submission."
        ),
    },
    {
        "q": "I cannot see my submitted report",
        "a": (
            "Check [My Submissions](page:/dashboard/submissions). If it's not "
            "there, the upload may have failed silently — retry on a stable "
            "connection."
        ),
    },
    {
        "q": "Map is not loading",
        "a": (
            "[Map View](page:/dashboard/mapview) needs a stable connection. Try "
            "refreshing the page first."
        ),
    },
    {
        "q": "Notifications are not showing",
        "a": (
            "Make sure you're logged in — sync is live over WebSocket. Check "
            "the [Notifications](page:/dashboard/notifications) page directly "
            "if the bell badge seems off."
        ),
    },
    {
        "q": "Upload keeps failing",
        "a": (
            "Check file size first — 50 MB max for images, 150 MB for videos. "
            "Try a different network if a valid file still fails."
        ),
    },
]


# ── Assembled plain-text knowledge block for the system prompt ───────────────

def build_knowledge_block() -> str:
    lines: List[str] = [
        "=== SNAP2FIX PLATFORM KNOWLEDGE BASE ===",
        "",
        "--- Available Page Routes (ONLY use these for [Label](page:/route) links) ---",
    ]
    for route, desc in PAGE_ROUTES.items():
        lines.append(f"{route} — {desc}")

    lines.extend(["", "--- Core Features ---"])
    for key, desc in FEATURES.items():
        title = key.replace("_", " ").title()
        lines.extend([f"\n{title}:", desc])

    lines.extend(["", "--- Frequently Asked Questions ---"])
    for item in FAQ:
        lines.extend([f"\nQ: {item['q']}", f"A: {item['a']}"])

    lines.extend(["", "--- Troubleshooting ---"])
    for item in TROUBLESHOOTING:
        lines.extend([f"\nQ: {item['q']}", f"A: {item['a']}"])

    lines.append("\n=== END OF KNOWLEDGE BASE ===")
    return "\n".join(lines)