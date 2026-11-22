"""Track when reports enter the resolved state."""

import sqlalchemy as sa
from alembic import op

revision = "c6ba09d251e4"
down_revision = "f05c8a7136bd"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("reports", sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("""
        UPDATE reports
        SET resolved_at = projects.actual_completion_date
        FROM projects
        WHERE projects.report_id = reports.id
          AND reports.status = 'RESOLVED'
          AND projects.status = 'COMPLETED'
          AND projects.actual_completion_date IS NOT NULL
    """)


def downgrade():
    op.drop_column("reports", "resolved_at")
