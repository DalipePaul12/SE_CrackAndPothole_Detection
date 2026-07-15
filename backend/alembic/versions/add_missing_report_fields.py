"""add_missing_report_fields

Alembic migration that adds all columns present in ReportCreate / ReportResponse
schemas but previously missing from the reports table in the database.

Missing columns were the root cause of HTTP 500 on every report submission:
  Pydantic model_validate(report) read attributes that did not exist on the
  SQLAlchemy ORM object → AttributeError → HTTP 500.

Revision ID: 0001_add_missing_report_fields
Revises: 105dd01b71ae
Create Date: 2025-05-14

Chain note: this migration branches from 105dd01b71ae in parallel with
a1b2c3d4e5f6 (add_revoked_tokens_table). Both branches are merged by
1dbe9ad95f07. The merge commit is still required.
"""

from alembic import op
import sqlalchemy as sa


# ── Revision identifiers ───────────────────────────────────────────────────────
revision = "0001_add_missing_report_fields"
down_revision = "105dd01b71ae"   # branches in parallel with a1b2c3d4e5f6
branch_labels = None
depends_on = None


# ─────────────────────────────────────────────────────────────────────────────
# UPGRADE
# ─────────────────────────────────────────────────────────────────────────────

def upgrade() -> None:
    # Each ADD COLUMN uses IF NOT EXISTS so the migration is safe to re-run.

    op.execute("""
        ALTER TABLE reports
        ADD COLUMN IF NOT EXISTS ai_validation_status     VARCHAR(50),
        ADD COLUMN IF NOT EXISTS ai_validation_confidence FLOAT
            CHECK (ai_validation_confidence IS NULL OR
                   (ai_validation_confidence >= 0.0 AND ai_validation_confidence <= 1.0)),
        ADD COLUMN IF NOT EXISTS ai_validation_model      VARCHAR(100),
        ADD COLUMN IF NOT EXISTS capture_metadata         JSONB,
        ADD COLUMN IF NOT EXISTS requires_admin_review    BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS review_reason            VARCHAR(500),
        ADD COLUMN IF NOT EXISTS disclaimer_accepted      BOOLEAN NOT NULL DEFAULT FALSE
    """)

    # Index for admin review queue — common filter in admin dashboard
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_report_requires_review
        ON reports (requires_admin_review)
        WHERE requires_admin_review = TRUE
    """)

    # Index on owner_id for /reports/mine queries
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_report_owner_id
        ON reports (owner_id)
    """)


# ─────────────────────────────────────────────────────────────────────────────
# DOWNGRADE
# ─────────────────────────────────────────────────────────────────────────────

def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_report_requires_review")
    op.execute("DROP INDEX IF EXISTS idx_report_owner_id")

    op.execute("""
        ALTER TABLE reports
        DROP COLUMN IF EXISTS ai_validation_status,
        DROP COLUMN IF EXISTS ai_validation_confidence,
        DROP COLUMN IF EXISTS ai_validation_model,
        DROP COLUMN IF EXISTS capture_metadata,
        DROP COLUMN IF EXISTS requires_admin_review,
        DROP COLUMN IF EXISTS review_reason,
        DROP COLUMN IF EXISTS disclaimer_accepted
    """)