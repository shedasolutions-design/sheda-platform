"""link appointments to their on-chain bid and record the viewing's outcome

Appointments lived only in this database and bids lived only on chain, with
nothing joining them. That left two holes the buyer feels directly:

  * a seller with more than one accepted bid on a property could not tell which
    buyer a viewing belonged to; and
  * neither side could see where the deal actually stood. The buyer's escrow is
    locked from the moment their bid is accepted, but the next on-chain step —
    the seller releasing the agreement NFT — is gated on a real-world meeting
    the chain cannot observe.

`bid_id` joins the two. The new statuses record what the meeting produced:
`confirmed` only ever meant the slot was booked, so there was no way to say
whether the viewing went ahead, let alone whether the parties agreed.

Revision ID: e6c1f927a4b3
Revises: c8a207bd2e74
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e6c1f927a4b3"
down_revision: Union[str, Sequence[str], None] = "c8a207bd2e74"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Postgres enum backing AppointmentStatEnum. Resolved at runtime rather than
# hardcoded: the type is auto-named by SQLAlchemy and has been renamed once
# already in this project's history.
_ENUM_LOOKUP = """
SELECT t.typname
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE e.enumlabel = 'canceled'
  AND EXISTS (
      SELECT 1 FROM pg_enum e2
      WHERE e2.enumtypid = t.oid AND e2.enumlabel = 'confirmed'
  )
LIMIT 1
"""


def upgrade() -> None:
    op.add_column("appointment", sa.Column("bid_id", sa.Integer(), nullable=True))
    op.create_index("ix_appointment_bid_id", "appointment", ["bid_id"])

    # No FK: bid ids are on-chain, not rows in this database. Enforcing
    # referential integrity here would mean mirroring the contract's bid table,
    # which is exactly the duplication that let the two drift apart before.
    conn = op.get_bind()
    enum_name = conn.exec_driver_sql(_ENUM_LOOKUP).scalar()

    if enum_name:
        # ALTER TYPE ... ADD VALUE cannot run inside a transaction block on
        # older Postgres, and alembic wraps migrations in one. COMMIT first so
        # the ADD VALUE statements run standalone.
        conn.exec_driver_sql("COMMIT")
        for label in ("completed", "not_agreed"):
            conn.exec_driver_sql(
                f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS '{label}'"
            )


def downgrade() -> None:
    op.drop_index("ix_appointment_bid_id", table_name="appointment")
    op.drop_column("appointment", "bid_id")
    # Enum labels are deliberately not removed. Postgres has no DROP VALUE, so
    # reversing them means recreating the type and rewriting every row that
    # uses it — destructive for any appointment already marked completed or
    # not_agreed. Leaving two unused labels behind is harmless by comparison.
