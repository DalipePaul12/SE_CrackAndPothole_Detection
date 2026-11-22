"""Track report subscriptions, planned repairs and inspections."""
from alembic import op
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON, String, func

revision = "dd418f620a87"
down_revision = "c6ba09d251e4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", Column("scheduled_date", Date))
    op.create_table(
        "report_follows",
        Column("report_id", Integer, ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True),
        Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "repeat_decisions",
        Column("report_id", Integer, ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True),
        Column("prior_id", Integer, ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True),
        Column("decision", String, nullable=False),
        Column("reviewer_id", Integer, ForeignKey("users.id", ondelete="SET NULL")),
        Column("reviewed_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    op.create_table(
        "repair_inspections",
        Column("id", Integer, primary_key=True),
        Column("report_id", Integer, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True),
        Column("visit_date", Date, nullable=False),
        Column("result", String),
        Column("notes", String),
        Column("photos", JSON),
        Column("inspector_id", Integer, ForeignKey("users.id", ondelete="SET NULL")),
        Column("completed_at", DateTime(timezone=True)),
        Column("followup_id", Integer, ForeignKey("reports.id", ondelete="SET NULL"), unique=True),
    )


def downgrade():
    op.drop_table("repair_inspections")
    op.drop_table("repeat_decisions")
    op.drop_table("report_follows")
    op.drop_column("projects", "scheduled_date")
