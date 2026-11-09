"""sync diverged profile passwords

Revision ID: d5f3b81c47a9
Revises: a7f3b81c04d9
Create Date: 2026-08-09 00:00:00.000000

Every signup creates two rows for one person — a Client and an Agent sharing
an email — seeded with the same password hash. reset_password only ever wrote
to the row holding the current token, so any account that reset its password
left the twin behind on the old hash.

That never surfaced because authenticate_user resolves the client row for
every login, so the agent hash was dead data. Sign-in as seller changes that:
it authenticates the agent row directly, and a stale hash there rejects the
user's real password.

This copies the client hash onto its agent twin wherever the two disagree.
Client is authoritative because it is the row every existing login already
authenticates against — it is, by definition, the password these users know
works.
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d5f3b81c47a9"
down_revision: Union[str, Sequence[str], None] = "a7f3b81c04d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # admin rows are untouched: they are not part of the client/agent pair and
    # share nothing with it but an email address.
    op.execute(
        """
        UPDATE "user" AS agent_row
        SET password = client_row.password,
            updated_at = now()
        FROM "user" AS client_row
        WHERE agent_row.email = client_row.email
          AND agent_row.account_type = 'agent'
          AND client_row.account_type = 'client'
          AND agent_row.password IS DISTINCT FROM client_row.password
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Irreversible by nature: the overwritten hashes are one-way and were not
    # recorded anywhere before the update. Reverting is also undesirable — it
    # would restore exactly the stale passwords that break seller sign-in.
    pass
