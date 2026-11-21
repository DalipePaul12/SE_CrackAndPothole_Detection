"""Store contractor repair review attempts and private photos."""

import sqlalchemy as sa
from alembic import op

revision = "f05c8a7136bd"
down_revision = "e1a4c7b2d903"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "repair_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contractor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("reviewer_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("reason", sa.Text()),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("materials", sa.JSON()),
        sa.Column("actual_cost", sa.Float()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_repair_reviews_project_id", "repair_reviews", ["project_id"])
    op.create_table(
        "repair_review_photos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("review_id", sa.Integer(), sa.ForeignKey("repair_reviews.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content_type", sa.String(32), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
    )
    op.create_index("ix_repair_review_photos_review_id", "repair_review_photos", ["review_id"])
    if op.get_context().dialect.name == "postgresql":
        op.execute("ALTER TABLE repair_reviews ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE repair_review_photos ENABLE ROW LEVEL SECURITY")


def downgrade():
    op.drop_table("repair_review_photos")
    op.drop_table("repair_reviews")
