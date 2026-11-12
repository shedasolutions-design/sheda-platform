"""viewing times: unique per seller among live viewings, not platform-wide

Two problems found in the two-account test:

- appointment.scheduled_at was UNIQUE across the whole platform, so two
  buyers could not view two different properties at 10:00 on the same day.
  It becomes unique per (agent_id, scheduled_at) among viewings that are not
  canceled, so a canceled slot can be booked again.
- booking set agent_availability.is_booked on the seller's whole weekday
  window (e.g. every Friday 08:00-20:00) and nothing ever cleared it, so one
  viewing closed that weekday for good. Booking no longer touches the window;
  the flags it left behind are cleared here.

Revision ID: a9c3e5f71b20
Revises: b2e7c4d91f36
Create Date: 2026-11-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9c3e5f71b20"
down_revision: Union[str, Sequence[str], None] = "b2e7c4d91f36"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE appointment DROP CONSTRAINT IF EXISTS appointment_scheduled_at_key")
    op.create_index(
        "uq_appointment_agent_time_live",
        "appointment",
        ["agent_id", "scheduled_at"],
        unique=True,
        postgresql_where=sa.text("status <> 'canceled'"),
    )
    op.execute("UPDATE agent_availability SET is_booked = false WHERE is_booked")


def downgrade() -> None:
    op.drop_index("uq_appointment_agent_time_live", table_name="appointment")
    op.create_unique_constraint("appointment_scheduled_at_key", "appointment", ["scheduled_at"])
