"""add old_contractor_id and new_contractor_id to project_updates

Revision ID: b3e7f1a92c04
Revises: cea2c6e67363
Create Date: 2026-07-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3e7f1a92c04'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'project_updates',
        sa.Column('old_contractor_id', sa.Integer(), nullable=True),
    )
    op.add_column(
        'project_updates',
        sa.Column('new_contractor_id', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('project_updates', 'new_contractor_id')
    op.drop_column('project_updates', 'old_contractor_id')
