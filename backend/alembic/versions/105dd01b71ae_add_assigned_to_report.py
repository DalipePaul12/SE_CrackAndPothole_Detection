"""add_assigned_to_report

Revision ID: 105dd01b71ae
Revises: 666068d82849
Create Date: 2026-05-08 03:18:25.225945

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '105dd01b71ae'
down_revision: Union[str, Sequence[str], None] = '666068d82849'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    op.add_column('reports', sa.Column('assigned_to', sa.String(), nullable=True))

def downgrade() -> None:

    op.drop_column('reports', 'assigned_to')

