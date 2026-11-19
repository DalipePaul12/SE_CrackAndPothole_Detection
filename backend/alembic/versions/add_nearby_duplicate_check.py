"""Add the nearby duplicate check admin setting."""

from alembic import op
import sqlalchemy as sa

revision = "e1a4c7b2d903"
down_revision = "89d0973701aa"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("admin_settings", sa.Column(
        "nearby_duplicate_check", sa.Boolean(), nullable=False, server_default=sa.true(),
    ))


def downgrade():
    op.drop_column("admin_settings", "nearby_duplicate_check")
