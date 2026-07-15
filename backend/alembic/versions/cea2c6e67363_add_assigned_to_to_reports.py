"""add assigned_to to reports

Revision ID: cea2c6e67363
Revises: 20260515_2fa_otp_safe
Create Date: 2026-05-15 14:17:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cea2c6e67363'
down_revision: Union[str, None] = '20260515_2fa_otp_safe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # reports.assigned_to was already added by 105dd01b71ae (add_assigned_to_report),
    # which runs earlier in the chain (666068d82849 → 105dd01b71ae → ... → here).
    # Adding it again would raise DuplicateColumn on a fresh database.
    # The column already exists by the time this migration runs — no-op intentional.
    pass


def downgrade() -> None:
    # Nothing was added in upgrade(), so nothing to undo.
    # The column itself is owned by 105dd01b71ae; its downgrade drops it there.
    pass