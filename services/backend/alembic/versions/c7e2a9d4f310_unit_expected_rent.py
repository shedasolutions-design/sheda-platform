"""expected yearly rent range on each Collections flat

Revision ID: c7e2a9d4f310
Revises: b4d8f2a6c901
Create Date: 2026-11-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c7e2a9d4f310"
down_revision: Union[str, Sequence[str], None] = "b4d8f2a6c901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("collection_unit", sa.Column("rent_min_atomic", sa.String(length=40), nullable=True))
    op.add_column("collection_unit", sa.Column("rent_max_atomic", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("collection_unit", "rent_max_atomic")
    op.drop_column("collection_unit", "rent_min_atomic")
