"""add image_url and timestamp_seconds to frame_detections

Revision ID: e37663669a91
Revises: b7c8d9e0f1a2
Create Date: 2026-09-06 03:19:32.399465

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e37663669a91'
down_revision: Union[str, Sequence[str], None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('frame_detections', sa.Column('image_url', sa.String(), nullable=True))
    op.add_column('frame_detections', sa.Column('timestamp_seconds', sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('frame_detections', 'timestamp_seconds')
    op.drop_column('frame_detections', 'image_url')