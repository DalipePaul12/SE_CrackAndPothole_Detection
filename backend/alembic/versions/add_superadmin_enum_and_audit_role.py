"""add superadmin to userrole enum and performed_by_role to audit_logs

Revision ID: f6e5d4c3b2a1
Revises: e2f3a4b5c6d7
Create Date: 2026-07-18

Notes
-----
Part 1 — ALTER TYPE userrole ADD VALUE:
    PostgreSQL does not allow removing enum values, so the downgrade() for
    part 1 is intentionally a no-op.  Rolling back this migration does NOT
    remove 'superadmin' from the type.  To remove it you must recreate the
    enum from scratch (requires a full table rewrite) — see PostgreSQL docs on
    ALTER TYPE.

Part 2 — performed_by_role column:
    Nullable String(32) — captures the acting user's role at the moment of the
    audit entry.  Joining audit_logs to users.role after the fact is unreliable
    because roles can change; this column locks in the historical value.
    Downgrade drops the column cleanly.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic
revision = "f6e5d4c3b2a1"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Part 1: add 'superadmin' to the PostgreSQL userrole enum ─────────────
    #
    # ALTER TYPE … ADD VALUE must run OUTSIDE a transaction block in PostgreSQL
    # (the value is committed immediately and cannot be rolled back).
    # autocommit_block() suspends Alembic's surrounding transaction, executes
    # the statement with AUTOCOMMIT isolation, then hands control back.
    with op.get_context().autocommit_block():
        op.execute(sa.text(
            "ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'superadmin'"
        ))

    # ── Part 2: add performed_by_role to audit_logs ───────────────────────────
    #
    # Nullable String(32) — wide enough for any UserRole value ("superadmin" is
    # the longest at 10 chars).  SET LOCAL statement_timeout = 0 prevents
    # Supabase's short DDL timeout from cancelling the ALTER TABLE.
    op.execute(sa.text("SET LOCAL statement_timeout = 0"))
    op.add_column(
        "audit_logs",
        sa.Column("performed_by_role", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    # Part 1: PostgreSQL cannot remove enum values — no-op intentional.
    # To remove 'superadmin' from the userrole type you must drop and recreate
    # the enum alongside all columns that reference it (users.role, etc.).
    # This is a manual operation outside Alembic's scope.

    # Part 2: drop the column cleanly.
    op.execute(sa.text("SET LOCAL statement_timeout = 0"))
    op.drop_column("audit_logs", "performed_by_role")
