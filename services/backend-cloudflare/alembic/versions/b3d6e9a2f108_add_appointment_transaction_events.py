"""add appointment transaction event enum values

Revision ID: b3d6e9a2f108
Revises: 9f4c2b1a8d7e
Create Date: 2026-07-27 14:10:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b3d6e9a2f108"
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
