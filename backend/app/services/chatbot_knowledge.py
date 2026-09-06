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
#
# NOTE: Project Tracking (/dashboard/submissions/:reportId/track) is
# intentionally NOT listed here. It's a per-report route and this whitelist
# only supports static paths, so SnapBot cannot safely emit a working link
# to it. It's documented under FEATURES["project_tracking"] instead so
# SnapBot can describe where the Track button appears without generating a
# broken link.
PAGE_ROUTES: Dict[str, str] = {
    "/dashboard": "Dashboard — overview of your reports, stats, and recent activity.",
    "/dashboard/reports": "All Reports — browse all public reports, and submit a new one from here.",
    "/dashboard/submissions": "My Submissions — full list of every report you've submitted, with status filters.",
    "/dashboard/mapview": "Map View — interactive map of all public reports, filterable by damage type, severity, and status.",
    "/dashboard/notifications": "Notifications — status updates, comments, and upvotes on your reports.",
    "/dashboard/settings": "Settings — account details, password, notification preferences, and appearance theme.",
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
        "of Critical or Non-Critical, and estimates a confidence score. Users "
        "can add a manual description and pin the exact location on a map. "
        "Submission takes under a minute for a single clear photo."
    ),
    "severity_levels": (
        "Snap2Fix currently uses two severity levels:\n"
        "• Non-Critical — Visible damage that isn't an immediate hazard.\n"
        "• Critical — Severe damage that may pose a risk and needs attention "
        "sooner.\n"
        "Severity is assigned by the AI detection model based on visual size, "
        "depth cues, and damage pattern. Admins review and triage reports, but "
        "there is currently no way for an admin (or a user) to manually change "
        "the AI's severity value. Critical reports tend to get administrative "
        "attention sooner, but there's no strict, guaranteed repair-queue "
        "ordering."
    ),
    "ai_detection": (
        "Snap2Fix runs two YOLO-based detection models — one trained for "
        "potholes and one for cracks. When a user uploads media, the AI "
        "analyzes the image, draws bounding boxes, and outputs a damage type + "
        "confidence score. Detections below the confidence threshold are "
        "flagged as 'uncertain' and queued for human review instead of being "
        "auto-classified."
    ),
    "ai_confidence_explainer": (
        "On any report's Details tab, users can tap 'Why classified as "
        "[damage type]?' to see the AI's damage type, severity, and confidence "
        "percentage, plus a plain-language note on how the model reached that "
        "classification. If confidence is low, it also explains that an admin "
        "will manually review the report."
    ),
    "ai_summary": (
        "Every submitted report can generate an AI plain-language summary that "
        "describes the damage, severity, location, and confidence in 1-2 "
        "sentences, via an external AI service. There's a daily generation "
        "limit per user (5/day) for newly-generated summaries — once a summary "
        "is generated it's cached, and viewing a cached summary again does not "
        "count against the daily limit."
    ),
    "status_tracking": (
        "From a citizen's point of view, reports move through this simplified "
        "lifecycle:\n"
        "• Pending — Submitted, awaiting admin review.\n"
        "• Verified — Admin has confirmed the report is valid.\n"
        "• In Progress — The report has moved into the repair workflow.\n"
        "• Resolved — The damage has been fixed and the report is closed.\n"
        "• Declined — The report was rejected or did not pass review.\n"
        "This is the citizen-facing view of a more detailed internal status "
        "system. Track every status change in "
        "[My Submissions](page:/dashboard/submissions) or on the "
        "[Dashboard](page:/dashboard)."
    ),
    "project_tracking": (
        "Once a report reaches In Progress or Resolved, a 'Track →' button "
        "appears on that report (in both the list and card view of "
        "[My Submissions](page:/dashboard/submissions)). Tapping it opens a "
        "dedicated project tracking page with repair progress and completion "
        "details. This button does not appear for Pending or Declined reports."
    ),
    "report_withdrawal": (
        "While a report is still Pending or Declined, its owner can withdraw "
        "(delete) it from the report's detail modal, with a confirmation step. "
        "Once a report is Verified or further along, it can no longer be "
        "withdrawn by the citizen."
    ),
    "citizen_messaging": (
        "Each report has an 'Updates' tab in its detail modal where the "
        "citizen can send a note/question to admins, and see admin replies in "
        "a message thread. Unread admin replies show a badge on the tab, and "
        "new messages arrive live over WebSocket."
    ),
    "map_view": (
        "The [Map View](page:/dashboard/mapview) shows all public reports as "
        "interactive pins, filterable by damage type, severity, and status. "
        "Pins are color-coded by severity — red for Critical, orange for "
        "Non-Critical, and gray when severity is unknown. Clicking a pin opens "
        "the report detail — it's the fastest way to check what's already "
        "reported near you before submitting a new one."
    ),
    "video_frame_detection": (
        "When a video is submitted, Snap2Fix runs frame-by-frame detection and "
        "shows a gallery of annotated frames (with damage type and confidence "
        "per frame) in the report's Media tab, so users can see exactly where "
        "in the video damage was detected."
    ),
    "notifications": (
        "Users get in-app notifications whenever a report changes status or "
        "receives a comment. See them all on the "
        "[Notifications](page:/dashboard/notifications) page — updates arrive "
        "live over WebSocket."
    ),
    "appearance": (
        "Users can switch the app's appearance between Light, Dark, or Auto "
        "from [Settings](page:/dashboard/settings); the choice is remembered "
        "for future visits."
    ),
    "deep_linking": (
        "Notifications and dashboard links can open a specific report directly "
        "using the format /dashboard/submissions?report_id=<id>&tab=<tab> "
        "(tab is one of details, timeline, media, or messages). This is the "
        "correct way to link to a specific report — a bare /reports/:id URL "
        "is not a valid route."
    ),
    "fake_detection": (
        "The platform includes an AI-powered authenticity check to help catch "
        "media that doesn't look like genuine road damage (for example, "
        "AI-generated images). When this check is configured and flags a "
        "possible issue, the report is marked for manual admin review rather "
        "than being classified normally."
    ),
    "account": (
        "Accounts use email + OTP verification. Update your name, contact "
        "number, profile picture, password, or appearance theme from "
        "[Settings](page:/dashboard/settings)."
    ),
    "contribution_score": (
        "The [Dashboard](page:/dashboard) shows a personal Contribution score "
        "and reporter badge (New / Rising / Active / Top Reporter) based on how "
        "many reports you've submitted and how many were resolved."
    ),
}

# ── Known, currently-broken or unavailable behavior ─────────────────────────
# Kept separate from FEATURES/FAQ so temporary issues can be added/removed in
# one place without editing permanent documentation. Update this list as
# issues are fixed or new ones are found.
KNOWN_ISSUES: List[Dict[str, str]] = [
    {
        "issue": "Upvoting",
        "detail": (
            "Upvote counts are displayed on reports, but there is currently no "
            "button in the citizen UI to actually cast an upvote — the feature "
            "is not usable yet, even though the backend supports it. If a user "
            "asks why they can't upvote or why their upvote didn't register, "
            "don't suggest retrying or troubleshooting on their end — let them "
            "know it's a known limitation the team is aware of."
        ),
    },
]

FAQ: List[Dict[str, str]] = [
    {
        "q": "How do I submit a report?",
        "a": (
            "Go to [Menu] and tap the **+** "
            "button to start a new report. Upload a clear photo or video of "
            "the damage, let the AI detect it automatically, add a description "
            "if you want, pin the location, and tap **Submit**."
        ),
    },
    {
        "q": "What photo quality do I need?",
        "a": (
            "The photo should be **clear, well-lit, and close enough** that the "
            "damage is visible. Max file size: 45 MB for both images and "
            "videos. Supported formats: JPEG, PNG, WebP, and GIF for images; "
            "MP4, MOV, and WebM for video."
        ),
    },
    {
        "q": "Why did my report get declined?",
        "a": (
            "Reports may be declined if the photo doesn't clearly show real "
            "road damage, the location is out of the covered area, or after "
            "admin review for other reasons. Check "
            "[My Submissions](page:/dashboard/submissions) for the specific "
            "decline reason on your report."
        ),
    },
    {
        "q": "How long does it take for a report to be fixed?",
        "a": (
            "Depends on severity and repair capacity — reports marked "
            "**Critical** tend to get administrative attention sooner, though "
            "there's no fixed queue order. Track live status on your "
            "[Dashboard](page:/dashboard)."
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
        "q": "Can I withdraw or cancel my report?",
        "a": (
            "Yes, while it's still **Pending** or **Declined**, using the "
            "Withdraw button in the report's detail view (with a confirmation "
            "step). Once it's Verified or further along, it can no longer be "
            "withdrawn."
        ),
    },
    {
        "q": "What is the AI summary?",
        "a": (
            "A short auto-generated paragraph summarizing a report's damage "
            "type, severity, location, and AI confidence. Capped at 5 "
            "newly-generated summaries per user per day — re-viewing an "
            "already-generated summary doesn't count against that limit."
        ),
    },
    {
        "q": "Is my data safe?",
        "a": (
            "Photos are stored securely and your location is used only for "
            "pinning the report. Report and account data is access-controlled, "
            "though some report details (like public map listings) are "
            "visible to other users as part of the platform's public reporting "
            "feature."
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
            "The AI estimates Critical or Non-Critical from the visual size, "
            "depth, and pattern of the damage. Admins review and triage "
            "reports, but there isn't currently a way to manually change the "
            "AI's severity value."
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
            "**Verified** = an admin has confirmed the report is legitimate. "
            "**In Progress** = the report has moved into the repair workflow. "
            "Exact repair activity can vary by report."
        ),
    },
    {
        "q": "Do I need an account to view reports?",
        "a": (
            "You need an account to submit, upvote, or comment, but the "
            "[Map View](page:/dashboard/mapview) is there once you're logged in."
        ),
    },
    {
        "q": "What happens if my report gets flagged?",
        "a": (
            "Flagged reports (low AI confidence, or a possible authenticity "
            "issue with the media) go to an admin for manual review — there's "
            "no way to edit the AI's classification yourself. Check "
            "[My Submissions](page:/dashboard/submissions) to see the outcome, "
            "including a decline reason if it's rejected."
        ),
    },
    {
        "q": "Why can't I upvote a report?",
        "a": (
            "Upvoting isn't available to citizens yet — counts are shown on "
            "reports, but there's no button to cast one right now. This is a "
            "known limitation the team is aware of, not something on your end."
        ),
    },
    {
        "q": "How do I see admin replies to my report?",
        "a": (
            "Open the report from [My Submissions](page:/dashboard/submissions) "
            "and check the **Updates** tab — that's where admin replies and "
            "your own notes to admins appear as a message thread."
        ),
    },
    {
        "q": "Where can I track the repair progress?",
        "a": (
            "Once a report is **In Progress** or **Resolved**, a 'Track →' "
            "button appears on it in [My Submissions](page:/dashboard/submissions) "
            "— tap it to open the project tracking page with repair details."
        ),
    },
]

TROUBLESHOOTING: List[Dict[str, str]] = [
    {
        "q": "The app is not detecting my damage photo",
        "a": (
            "Make sure the damage takes up a good portion of the frame, is "
            "well-lit, and is close enough to see clearly. There is currently "
            "no way to manually set the damage type or severity yourself — if "
            "the AI can't confidently classify the photo, the report is flagged "
            "as low-confidence/uncertain and sent to an admin for manual review "
            "instead. Your submission still goes through; it'll just show as "
            "pending admin review rather than getting an instant AI classification."
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
        "q": "My report disappeared",
        "a": (
            "Check [My Submissions](page:/dashboard/submissions) first — it "
            "may just be filtered out by a status or search filter. If it's "
            "genuinely missing, the original upload may have failed silently; "
            "try resubmitting on a stable connection."
        ),
    },
    {
        "q": "I submitted a report but cannot find it",
        "a": (
            "Check [My Submissions](page:/dashboard/submissions) and clear any "
            "active filters. If it's still not there, the upload may not have "
            "completed — try again on a stable connection."
        ),
    },
    {
        "q": "Where is my report?",
        "a": (
            "All your reports live in "
            "[My Submissions](page:/dashboard/submissions). If you don't see "
            "one you just submitted, clear any filters first, then check your "
            "connection and try resubmitting if it's truly missing."
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
            "Check file size first — 45 MB max for both images and videos. "
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

    lines.extend(["", "--- Known Issues (do not present these as working) ---"])
    for item in KNOWN_ISSUES:
        lines.extend([f"\n{item['issue']}:", item["detail"]])

    lines.extend(["", "--- Frequently Asked Questions ---"])
    for item in FAQ:
        lines.extend([f"\nQ: {item['q']}", f"A: {item['a']}"])

    lines.extend(["", "--- Troubleshooting ---"])
    for item in TROUBLESHOOTING:
        lines.extend([f"\nQ: {item['q']}", f"A: {item['a']}"])

    lines.append("\n=== END OF KNOWLEDGE BASE ===")
    return "\n".join(lines)