"""add two_factor enum and ensure otps table exists

Revision ID: 20260515_2fa_otp_safe
Revises: 1dbe9ad95f07
Create Date: 2026-05-15 02:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '20260515_2fa_otp_safe'
down_revision = '1dbe9ad95f07'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add two_factor to enum (safe — skips if already there)
    op.execute("ALTER TYPE otppurpose ADD VALUE IF NOT EXISTS 'two_factor'")

    # 2. Create otps table only if it doesn't exist
    op.execute("""
        CREATE TABLE IF NOT EXISTS otps (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            email VARCHAR NOT NULL,
            hashed_code VARCHAR NOT NULL,
            purpose otppurpose NOT NULL,
            is_used BOOLEAN DEFAULT FALSE,
            attempt_count INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
    """)

    # 3. Create indexes only if they don't exist
    op.execute("CREATE INDEX IF NOT EXISTS ix_otps_email ON otps(email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_otps_expires_at ON otps(expires_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_otps_id ON otps(id)")

    # 4. Create foreign key only if it doesn't exist
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint 
                WHERE conname = 'fk_otps_user_id' 
                AND conrelid = 'otps'::regclass
            ) THEN
                ALTER TABLE otps 
                ADD CONSTRAINT fk_otps_user_id 
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
            END IF;
        END $$;
    """)


def downgrade():
    pass