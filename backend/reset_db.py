"""
Run this once to drop all tables and recreate them from your SQLAlchemy models.
Usage:
    cd backend
    .venv\Scripts\Activate.ps1
    python reset_db.py
"""
import asyncio
from app.db.base import Base
from app.db.session import engine

# Import every model so Base.metadata knows about all tables
import app.models.user
import app.models.report
import app.models.media_attachment
import app.models.ai_detection_result
import app.models.report_upvote
import app.models.audit_log
import app.models.notification
import app.models.comment
import app.models.project
import app.models.refresh_token
import app.models.cctv
import app.models.otp


async def reset():
    async with engine.begin() as conn:
        print("Dropping all tables...")
        await conn.run_sync(Base.metadata.drop_all)
        print("Recreating all tables...")
        await conn.run_sync(Base.metadata.create_all)
        print("Done. Database is clean.")

asyncio.run(reset())