"""merge heads

Revision ID: 1dbe9ad95f07
Revises: 0001_add_missing_report_fields, a1b2c3d4e5f6
Create Date: 2026-05-14 13:26:45.845411

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1dbe9ad95f07'
down_revision: Union[str, Sequence[str], None] = ('0001_add_missing_report_fields', 'a1b2c3d4e5f6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
