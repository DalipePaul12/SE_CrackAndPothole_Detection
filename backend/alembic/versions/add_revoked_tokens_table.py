"""add revoked_tokens table

Revision ID: a1b2c3d4e5f6
Revises: 
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "105dd01b71ae"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "revoked_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("jti", sa.String(), nullable=False),
        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_revoked_tokens_id", "revoked_tokens", ["id"])
    op.create_index("ix_revoked_tokens_jti", "revoked_tokens", ["jti"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_revoked_tokens_jti", table_name="revoked_tokens")
    op.drop_index("ix_revoked_tokens_id", table_name="revoked_tokens")
    op.drop_table("revoked_tokens")