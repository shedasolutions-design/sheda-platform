"""add appointment transaction event enum values

Revision ID: a3e7c951f204
Revises: 9f4c2b1a8d7e
Create Date: 2026-07-29 09:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a3e7c951f204"
down_revision: Union[str, Sequence[str], None] = "9f4c2b1a8d7e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        "ALTER TYPE transactioneventenum ADD VALUE IF NOT EXISTS 'appointment_booked'"
    )
    op.execute(
        "ALTER TYPE transactioneventenum ADD VALUE IF NOT EXISTS 'appointment_accepted'"
    )
    op.execute(
        "ALTER TYPE transactioneventenum ADD VALUE IF NOT EXISTS 'appointment_rejected'"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # PostgreSQL does not support removing enum values without recreating the type.
    pass
