"""add attachment_type to media_attachments and materials_used to projects

Revision ID: c4d5e6f7a8b9
Revises: b3e7f1a92c04
Create Date: 2026-07-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, None] = 'b3e7f1a92c04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Distinguish submission photos from completion-proof photos.
    # NULL = original submission photo (existing rows unaffected).
    op.add_column(
        'media_attachments',
        sa.Column('attachment_type', sa.String(), nullable=True),
    )

    # Materials used during project completion: [{name, quantity, unit_cost}].
    # Nullable so existing project rows are unaffected.
    op.add_column(
        'projects',
        sa.Column('materials_used', sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('projects', 'materials_used')
    op.drop_column('media_attachments', 'attachment_type')
