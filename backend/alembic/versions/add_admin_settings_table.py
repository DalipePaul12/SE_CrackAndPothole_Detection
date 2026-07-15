"""add admin_settings table

Revision ID: b2c3d4e5f6a7
Revises: 3371f08e9309
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6a7"
down_revision = "3371f08e9309"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_settings",
        sa.Column("id", sa.Integer(), nullable=False),

        # General
        sa.Column("org_name",      sa.String(255), nullable=False, server_default="Snap2Fix"),
        sa.Column("municipality",  sa.String(255), nullable=False, server_default="Panghulo"),
        sa.Column("timezone",      sa.String(64),  nullable=False, server_default="Asia/Manila"),
        sa.Column("contact_email", sa.String(255), nullable=False, server_default="admin@snap2fix.gov"),

        # Reports & SLA
        sa.Column("default_severity",     sa.String(32),  nullable=False, server_default="medium"),
        sa.Column("auto_assign",          sa.Boolean(),   nullable=False, server_default=sa.text("true")),
        sa.Column("response_time_hours",  sa.Integer(),   nullable=False, server_default="24"),
        sa.Column("escalate_after_hours", sa.Integer(),   nullable=False, server_default="72"),

        # Map
        sa.Column("default_lat",  sa.Float(),     nullable=False, server_default="14.5995"),
        sa.Column("default_lng",  sa.Float(),     nullable=False, server_default="120.9842"),
        sa.Column("default_zoom", sa.Integer(),   nullable=False, server_default="13"),
        sa.Column("map_provider", sa.String(32),  nullable=False, server_default="google"),

        # Notifications
        sa.Column("email_alerts",         sa.Boolean(),   nullable=False, server_default=sa.text("true")),
        sa.Column("sms_alerts",           sa.Boolean(),   nullable=False, server_default=sa.text("false")),
        sa.Column("push_alerts",          sa.Boolean(),   nullable=False, server_default=sa.text("true")),
        sa.Column("digest_frequency",     sa.String(32),  nullable=False, server_default="daily"),
        sa.Column("critical_alert_sound", sa.Boolean(),   nullable=False, server_default=sa.text("true")),

        # Security
        sa.Column("require_2fa",               sa.Boolean(),  nullable=False, server_default=sa.text("false")),
        sa.Column("password_min_length",       sa.Integer(),  nullable=False, server_default="8"),
        sa.Column("session_timeout",           sa.Integer(),  nullable=False, server_default="60"),
        sa.Column("data_retention_days",       sa.Integer(),  nullable=False, server_default="365"),
        sa.Column("allow_public_registration", sa.Boolean(),  nullable=False, server_default=sa.text("false")),

        # Maintenance
        sa.Column("maintenance_mode",    sa.Boolean(),      nullable=False, server_default=sa.text("false")),
        sa.Column("maintenance_message", sa.Text(),         nullable=False,
                  server_default="System under maintenance. Please check back shortly."),
        sa.Column("allowed_admin_ips",   sa.String(1024),   nullable=False, server_default=""),
        sa.Column("api_key",             sa.String(128),    nullable=False, server_default=""),

        # Audit
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),

        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_settings_id", "admin_settings", ["id"])


def downgrade() -> None:
    op.drop_index("ix_admin_settings_id", table_name="admin_settings")
    op.drop_table("admin_settings")
