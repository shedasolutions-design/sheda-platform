"""Add kv_store, the shared key-value table used on Workers instead of Redis

One-time email codes and revoked access tokens have to be visible to every
instance that might handle the next request. On a server that is Redis. On
Cloudflare Workers there is no Redis connection to make and no memory shared
between instances, so they live in Postgres instead (core/kv.py).

Revision ID: b9e4d2a7c513
Revises: a1c5e30bf742
Create Date: 2026-11-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b9e4d2a7c513"
down_revision: Union[str, Sequence[str], None] = "a1c5e30bf742"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "kv_store",
        sa.Column("key", sa.String(length=512), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_kv_store_expires_at", "kv_store", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_kv_store_expires_at", table_name="kv_store")
    op.drop_table("kv_store")
