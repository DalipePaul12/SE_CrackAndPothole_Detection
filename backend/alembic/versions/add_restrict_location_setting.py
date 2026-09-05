"""add authoritative location restriction setting

Revision ID: b7c8d9e0f1a2
Revises: a9b8c7d6e5f4
"""
from alembic import op
import sqlalchemy as sa

revision = "b7c8d9e0f1a2"
down_revision = "a9b8c7d6e5f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "admin_settings",
        sa.Column("restrict_location", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("admin_settings", "restrict_location")