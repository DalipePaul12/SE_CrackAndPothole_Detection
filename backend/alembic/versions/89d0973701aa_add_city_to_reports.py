"""add city to reports

Revision ID: 89d0973701aa
Revises: e37663669a91
Create Date: 2026-10-08 21:36:35.982774

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '89d0973701aa'
down_revision: Union[str, Sequence[str], None] = 'e37663669a91'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('reports', sa.Column('city', sa.String(), nullable=True))
    op.create_index('idx_report_city', 'reports', ['city'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_report_city', table_name='reports')
    op.drop_column('reports', 'city')