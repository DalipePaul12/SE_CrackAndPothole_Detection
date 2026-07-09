"""
Snap2Fix Chatbot Knowledge Base
================================
Curated FAQ content, feature descriptions, and common user questions
about the Snap2Fix road damage reporting platform.

This module provides structured knowledge that the chatbot service
loads and injects into the AI system prompt. Keeping content separate
from the AI logic makes the knowledge base easy to extend without
touching the Groq API code.
"""

from typing import List, Dict


# ── Core knowledge sections ─────────────────────────────────────────────────

FEATURES: Dict[str, str] = {
    "submit_report": (
        "Users can submit road damage reports through the app by uploading a photo "
        "or video of the damage. The AI engine automatically detects cracks and "
        "potholes, assigns a severity level (Low, Moderate, High, Critical), and "
        "estimates a confidence score. Users can add a manual description and "
        "pin the exact location on a map."
    ),
    "severity_levels": (
        "Snap2Fix uses four severity levels:\n"
        "• Low — Minor surface issues, cosmetic damage, no immediate hazard.\n"
        "• Moderate — Visible damage that may worsen; affects ride quality.\n"
        "• High — Significant hazard; risk to vehicles or pedestrians.\n"
        "• Critical — Severe damage requiring urgent immediate repair.\n"
        "Severity is determined by the AI detection model and can be adjusted by admins."
    ),
    "ai_detection": (
        "Snap2Fix runs two YOLO-based detection models — one trained for potholes "
        "and one for cracks. When a user uploads media, the AI analyzes the image, "
        "draws segmentation masks, and outputs a damage type + confidence score. "
        "The confidence threshold is configurable (default 0.60). Below-threshold "
        "detections are flagged for human review."
    ),
    "ai_summary": (
        "Every submitted report gets an AI-generated plain-language summary that "
        "describes the damage, severity, location, and confidence in 1-2 sentences. "
        "This summary appears on the report detail page and helps admins quickly "
        "understand the issue without reading the full description."
    ),
    "status_tracking": (
        "Reports move through a lifecycle with these statuses:\n"
        "• Pending — Submitted, awaiting admin review.\n"
        "• Verified — Admin has confirmed the report is valid.\n"
        "• In Progress — Repair work has been assigned or started.\n"
        "• Resolved — The damage has been fixed and the report is closed.\n"
        "• Declined — The report was rejected (duplicate, fake, or out of scope).\n"
        "Users can track their own reports in My Submissions and the Personal Activity Feed."
    ),
    "map_view": (
        "The Map View shows all public reports as interactive pins. Users can filter "
        "by damage type (pothole / crack), severity, and status. Clicking a pin opens "
        "the report detail. The map is powered by Mapbox."
    ),
    "notifications": (
        "Users receive in-app notifications whenever their report changes status, "
        "gets a comment, or receives an upvote. Notifications appear in the bell icon "
        "dropdown and are also visible on the Notifications page."
    ),
    "upvotes": (
        "Users can upvote other people's reports to signal urgency. Highly upvoted "
        "reports get prioritized in admin dashboards. You cannot upvote your own report."
    ),
    "fake_detection": (
        "The platform includes AI-powered fake-image detection to catch photos that "
        "are not genuine road damage (e.g., screenshots, unrelated images). If a report "
        "fails this check, it may be auto-declined or flagged for review."
    ),
    "duplicate_check": (
        "When submitting near an existing report, the system checks for duplicates "
        "by comparing GPS coordinates. If a very close report already exists, the "
        "user is warned and can choose to upvote the existing one instead."
    ),
    "account": (
        "Accounts are created with email + OTP verification. Users can set their "
        "full name, contact number, and profile picture. Passwords can be changed "
        "from Settings. Admins have additional panels for managing reports and users."
    ),
}

FAQ: List[Dict[str, str]] = [
    {
        "q": "How do I submit a report?",
        "a": (
            "Go to Create Report, upload a clear photo or video of the road damage, "
            "allow the AI to detect it automatically, add a description if you want, "
            "pin the exact location on the map, and tap Submit."
        ),
    },
    {
        "q": "What photo quality do I need?",
        "a": (
            "The photo should be clear, well-lit, and taken close enough that the "
            "damage is visible. Avoid blurry, dark, or heavily cropped images. "
            "Maximum file size is 50 MB for images and 150 MB for videos."
        ),
    },
    {
        "q": "Why did my report get declined?",
        "a": (
            "Reports are declined if they are duplicates, the photo does not show "
            "real road damage, the location is outside the service area, or the admin "
            "marks it as invalid. Check the notification for the specific reason."
        ),
    },
    {
        "q": "How long does it take for a report to be fixed?",
        "a": (
            "It depends on severity and local government capacity. Critical reports "
            "are prioritized. You can track status updates in My Submissions."
        ),
    },
    {
        "q": "Can I edit a report after submitting?",
        "a": (
            "You can edit the description and severity while the report is still "
            "Pending. Once it moves to Verified or beyond, only admins can modify it."
        ),
    },
    {
        "q": "What is the AI summary?",
        "a": (
            "The AI summary is a short natural-language paragraph automatically "
            "generated for every report. It summarizes the damage type, severity, "
            "location, and confidence score in plain language so you can understand "
            "the issue at a glance."
        ),
    },
    {
        "q": "Is my data safe?",
        "a": (
            "Yes. Photos are stored securely, location data is used only for report "
            "pinning, and personal information is never shared publicly. Only your "
            "full name (if you set one) appears on public reports."
        ),
    },
    {
        "q": "I forgot my password",
        "a": (
            "Use the password reset flow on the login screen. An OTP will be sent "
            "to your registered email. If you still have trouble, contact support."
        ),
    },
    {
        "q": "How does severity get decided?",
        "a": (
            "Severity is first estimated by the AI detection model based on the "
            "visual characteristics of the damage. Admins can override this during "
            "review if they disagree with the AI's assessment."
        ),
    },
    {
        "q": "Can I delete my account?",
        "a": (
            "Account deletion is not yet available in the app. Contact admin support "
            "to request account removal."
        ),
    },
]

TROUBLESHOOTING: List[Dict[str, str]] = [
    {
        "q": "The app is not detecting my damage photo",
        "a": (
            "Make sure the image is clear and the damage is visible. If the AI still "
            "does not detect anything, you can manually mark the damage type and "
            "severity when submitting. The AI confidence score will show how certain "
            "the model was."
        ),
    },
    {
        "q": "I cannot see my submitted report",
        "a": (
            "Check My Submissions under the dashboard. If it is not there, the "
            "submission may have failed — try uploading again. Ensure you have a "
            "stable internet connection."
        ),
    },
    {
        "q": "Map is not loading",
        "a": (
            "The Map View requires a stable internet connection and a valid Mapbox "
            "token. If the map stays blank, try refreshing the page or checking "
            "your network connection."
        ),
    },
    {
        "q": "Notifications are not showing",
        "a": (
            "Make sure you are logged in. Notifications are real-time via WebSocket. "
            "If the bell icon badge is missing, try refreshing the page or checking "
            "the Notifications page directly."
        ),
    },
    {
        "q": "Upload keeps failing",
        "a": (
            "Check your file size — images must be under 50 MB and videos under "
            "150 MB. Supported formats: JPEG, PNG, WebP for images; MP4, MOV for videos. "
            "If the file is valid but still fails, try a different network."
        ),
    },
]

# ── Assembled plain-text knowledge block for the system prompt ───────────────

def build_knowledge_block() -> str:
    """Return a single formatted string containing all KB content."""
    lines: List[str] = [
        "=== SNAP2FIX PLATFORM KNOWLEDGE BASE ===",
        "",
        "--- Core Features ---",
    ]
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
