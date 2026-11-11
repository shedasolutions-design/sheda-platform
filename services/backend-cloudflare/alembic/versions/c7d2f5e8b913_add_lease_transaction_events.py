"""add lease transaction event enum values

Revision ID: c7d2f5e8b913
Revises: f1a4c8d2e615
Create Date: 2026-07-28 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c7d2f5e8b913"
down_revision: Union[str, Sequence[str], None] = "f1a4c8d2e615"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        "ALTER TYPE transactioneventenum ADD VALUE IF NOT EXISTS 'lease_completed'"
    )
    op.execute(
        "ALTER TYPE transactioneventenum ADD VALUE IF NOT EXISTS 'lease_renewed'"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # PostgreSQL does not support removing enum values without recreating the type.
    pass
