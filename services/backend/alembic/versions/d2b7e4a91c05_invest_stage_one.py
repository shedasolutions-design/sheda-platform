"""Invest stage one: project type, map, minimum, manager fee and pledge,
nominations, project updates, project pack and document fingerprints

Revision ID: d2b7e4a91c05
Revises: c7e2a9d4f310
Create Date: 2026-11-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d2b7e4a91c05"
down_revision: Union[str, Sequence[str], None] = "c7e2a9d4f310"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("collection_profile", sa.Column("logo_url", sa.String(length=500), nullable=True))
    op.add_column("collection_profile", sa.Column("fee_bps", sa.Integer(), nullable=True))
    op.add_column("collection_profile", sa.Column("pledge", sa.Text(), nullable=True))
    op.add_column("collection_profile", sa.Column("pledge_updated_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column(
        "collection_project",
        sa.Column("project_type", sa.String(length=24), nullable=False, server_default="under_construction"),
    )
    op.add_column("collection_project", sa.Column("address", sa.String(length=255), nullable=True))
    op.add_column("collection_project", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("collection_project", sa.Column("longitude", sa.Float(), nullable=True))
    op.add_column("collection_project", sa.Column("min_investment_atomic", sa.String(length=40), nullable=True))

    op.add_column(
        "collection_document", sa.Column("is_pack", sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.add_column("collection_document", sa.Column("sha256", sa.String(length=64), nullable=True))

    op.create_table(
        "collection_manager_nomination",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("collection_project.id", ondelete="CASCADE"), nullable=False),
        sa.Column("profile_id", sa.Integer(), sa.ForeignKey("collection_profile.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="invited"),
        sa.Column("self_managed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("fee_bps", sa.Integer(), nullable=True),
        sa.Column("pledge", sa.Text(), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("project_id", "profile_id", name="uq_collection_nomination"),
    )
    op.create_index("ix_collection_manager_nomination_project_id", "collection_manager_nomination", ["project_id"])
    op.create_index("ix_collection_manager_nomination_profile_id", "collection_manager_nomination", ["profile_id"])

    op.create_table(
        "collection_project_update",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("collection_project.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("author_name", sa.String(length=120), nullable=False),
        sa.Column("kind", sa.String(length=24), nullable=False, server_default="progress"),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_collection_project_update_project_id", "collection_project_update", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_collection_project_update_project_id", table_name="collection_project_update")
    op.drop_table("collection_project_update")
    op.drop_index("ix_collection_manager_nomination_profile_id", table_name="collection_manager_nomination")
    op.drop_index("ix_collection_manager_nomination_project_id", table_name="collection_manager_nomination")
    op.drop_table("collection_manager_nomination")
    op.drop_column("collection_document", "sha256")
    op.drop_column("collection_document", "is_pack")
    for col in ("min_investment_atomic", "longitude", "latitude", "address", "project_type"):
        op.drop_column("collection_project", col)
    for col in ("pledge_updated_at", "pledge", "fee_bps", "logo_url"):
        op.drop_column("collection_profile", col)
