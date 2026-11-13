"""Invest lifecycle notifications: followers, notifications, chain snapshot

Revision ID: e8f3a6c2d417
Revises: d2b7e4a91c05
Create Date: 2026-11-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e8f3a6c2d417"
down_revision: Union[str, Sequence[str], None] = "d2b7e4a91c05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("collection_project", sa.Column("chain_snapshot", sa.JSON(), nullable=True))
    op.add_column("collection_project", sa.Column("last_swept_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "collection_watch",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("collection_project.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("near_account_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("project_id", "user_id", name="uq_collection_watch"),
    )
    op.create_index("ix_collection_watch_project_id", "collection_watch", ["project_id"])
    op.create_index("ix_collection_watch_user_id", "collection_watch", ["user_id"])
    op.create_table(
        "collection_notification",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("collection_project.id", ondelete="CASCADE"), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("link", sa.String(length=255), nullable=True),
        sa.Column("dedupe_key", sa.String(length=160), nullable=False, unique=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_collection_notification_user_id", "collection_notification", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_collection_notification_user_id", table_name="collection_notification")
    op.drop_table("collection_notification")
    op.drop_index("ix_collection_watch_user_id", table_name="collection_watch")
    op.drop_index("ix_collection_watch_project_id", table_name="collection_watch")
    op.drop_table("collection_watch")
    op.drop_column("collection_project", "last_swept_at")
    op.drop_column("collection_project", "chain_snapshot")
