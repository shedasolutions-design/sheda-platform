"""property lease term and deposit, and contract-to-chain linkage

The listing form has always let a seller set a rental term, and the app has
always sent one — but `PropertyBase` never declared the field, and Pydantic
drops what a schema does not declare. Every tenancy length was lost silently
between the form and the database.

Days rather than months because that is the unit the contract stores and the
unit the form offers. A month column cannot hold a seven-day let: it rounds to
thirty, and then the chain and the backend disagree about when the same
tenancy ends.

Revision ID: a7f3b81c04d9
Revises: e6c1f927a4b3
Create Date: 2026-09-23

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7f3b81c04d9"
down_revision: Union[str, Sequence[str], None] = "e6c1f927a4b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "property",
        sa.Column("lease_duration_days", sa.Integer(), nullable=True),
    )
    # Atomic stablecoin units as a string, the same shape the chain reports
    # u128 in. A float would round, and a deposit off by a rounding error is a
    # deposit somebody argues about.
    op.add_column(
        "property",
        sa.Column("damage_deposit_required", sa.String(length=40), nullable=True),
    )

    # A contract row could not say which on-chain deal it stood for. The app
    # has always sent these three; nothing was listening, so reconciling the
    # two sides meant guessing from amounts and dates.
    op.add_column("contract", sa.Column("bid_id", sa.Integer(), nullable=True))
    op.add_column("contract", sa.Column("lease_id", sa.Integer(), nullable=True))
    op.add_column(
        "contract", sa.Column("transaction_hash", sa.String(length=120), nullable=True)
    )
    op.create_index("ix_contract_bid_id", "contract", ["bid_id"])
    op.create_index("ix_contract_lease_id", "contract", ["lease_id"])


def downgrade() -> None:
    op.drop_index("ix_contract_lease_id", table_name="contract")
    op.drop_index("ix_contract_bid_id", table_name="contract")
    op.drop_column("contract", "transaction_hash")
    op.drop_column("contract", "lease_id")
    op.drop_column("contract", "bid_id")
    op.drop_column("property", "damage_deposit_required")
    op.drop_column("property", "lease_duration_days")
