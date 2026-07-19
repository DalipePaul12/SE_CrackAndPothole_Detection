"""add indexes on audit_logs.target_resource and audit_logs.performed_by_role

Revision ID: a9b8c7d6e5f4
Revises: f6e5d4c3b2a1
Create Date: 2026-07-19

Context
-------
The GET /audit-logs endpoint filters on five columns.  Three already have
indexes from the initial create_all_tables migration:

    ix_audit_logs_user_id    — user_id   (ForeignKey, index=True in model)
    ix_audit_logs_action     — action    (index=True in model)
    ix_audit_logs_timestamp  — timestamp (index=True in model)

Two filter columns have no index:

    target_resource   — e.g. "users", "reports"
    performed_by_role — e.g. "superadmin", "system_cli"

Both are low-cardinality strings.  PostgreSQL will still use btree indexes
for equality predicates even on low-cardinality columns when the table is
large, and will ignore them for tiny tables.  Adding them now avoids a
full-scan as the audit_logs table grows.

Down_revision note
------------------
This migration follows f6e5d4c3b2a1 (add_superadmin_enum_and_audit_role).
If your environment shows multiple heads when you run `alembic heads`, merge
them first with `alembic merge heads -m "merge"` before upgrading.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a9b8c7d6e5f4"
down_revision = "f6e5d4c3b2a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("SET LOCAL statement_timeout = 0"))

    # CONCURRENTLY cannot run inside a transaction; Alembic wraps everything
    # in one by default.  Use CREATE INDEX without CONCURRENTLY here — the
    # table is an append-only audit log and locks are brief on small tables.
    # For very large existing tables run this migration during a maintenance
    # window or apply the indexes manually with CONCURRENTLY outside Alembic.
    op.create_index(
        "ix_audit_logs_target_resource",
        "audit_logs",
        ["target_resource"],
        unique=False,
    )
    op.create_index(
        "ix_audit_logs_performed_by_role",
        "audit_logs",
        ["performed_by_role"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_audit_logs_performed_by_role", table_name="audit_logs")
    op.drop_index("ix_audit_logs_target_resource",   table_name="audit_logs")
