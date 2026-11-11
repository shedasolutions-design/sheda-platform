"""add missing transaction event enum values

Revision ID: 9f4c2b1a8d7e
Revises: 0174af76d98a
Create Date: 2026-07-27 11:35:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "9f4c2b1a8d7e"
down_revision: Union[str, Sequence[str], None] = "0174af76d98a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        "ALTER TYPE transactioneventenum ADD VALUE IF NOT EXISTS 'bid_placed'"
    )
    op.execute(
        "ALTER TYPE transactioneventenum ADD VALUE IF NOT EXISTS 'bid_cancelled'"
    )
    op.execute(
        "ALTER TYPE transactioneventenum ADD VALUE IF NOT EXISTS 'transaction_completed'"
    )
    op.execute(
        "ALTER TYPE transactioneventenum ADD VALUE IF NOT EXISTS 'dispute_raised'"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # PostgreSQL does not support removing enum values without recreating the type.
    pass
