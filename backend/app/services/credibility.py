"""
Credibility service — adjusts a user's reputation_score based on
the outcome of their submitted reports.

Score rules:
  +10   report verified by admin
  -15   report declined (fake or invalid)
  +2    report upvoted by another user
  -5    media flagged as AI-generated
  Min: 0.0    Max: 1000.0
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User

logger = logging.getLogger(__name__)

MIN_SCORE = 0.0
MAX_SCORE = 1000.0

_DELTA = {
    "report_verified":  +10.0,
    "report_declined":  -15.0,
    "report_upvoted":   +2.0,
    "ai_media_flagged": -5.0,
}


async def adjust_score(db: AsyncSession, user: User, reason: str) -> float:
    """
    Apply the delta for `reason` to user.reputation_score.
    Clamps result to [0, 1000]. Returns the new score.
    """
    delta = _DELTA.get(reason, 0.0)
    if delta == 0.0:
        logger.warning(f"Unknown credibility reason: '{reason}'")
        return user.reputation_score

    new_score = max(MIN_SCORE, min(MAX_SCORE, user.reputation_score + delta))
    user.reputation_score = new_score
    await db.commit()
    logger.info(
        f"Credibility — user={user.id} reason={reason} "
        f"delta={delta:+.1f} score={new_score:.1f}"
    )
    return new_score