"""
Deprecated — all settings have moved to app.core.config.

This file exists only for backward compatibility.
Import from app.core.config instead:

    from app.core.config import settings
"""
from app.core.config import settings  # noqa: F401

__all__ = ["settings"]