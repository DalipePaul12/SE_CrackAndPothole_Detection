"""add is_available to users

Revision ID: d1e2f3a4b5c6
Revises: c4d5e6f7a8b9
Create Date: 2026-07-16 00:00:00.000000

Adds a nullable boolean column `is_available` to the users table.
Contractor rows use this to signal whether they are accepting new work.

Safe properties
---------------
- nullable=True  → existing rows are NOT NULL-violated (they get the
  server_default value of TRUE via the PostgreSQL ADD COLUMN DEFAULT path).
- server_default='true' → PostgreSQL sets existing rows to TRUE when the
  column is added (standard PG behaviour for ADD COLUMN … DEFAULT …).
- No UserCreate / login / profile-edit schema is touched.
- citizen / admin / superadmin rows also receive is_available=TRUE but the
  field is ignored by all non-contractor code paths.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default='true' means PostgreSQL fills every existing row with
    # TRUE when the column is added — no backfill migration step required.
    op.add_column(
        'users',
        sa.Column(
            'is_available',
            sa.Boolean(),
            nullable=True,
            server_default=sa.text('true'),
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'is_available')
