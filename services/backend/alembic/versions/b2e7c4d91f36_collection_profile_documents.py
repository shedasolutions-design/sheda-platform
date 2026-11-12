"""Licences and registration papers on builder and manager profiles.

Raises could carry documents, but the people behind them could not: a
builder had nowhere to show a CAC registration, a professional licence or
a permit to operate, so an investor could not check who they were dealing
with. Same three states as raise documents (missing, uploaded, verified),
and the same rule: only Sheda can mark one verified.

Revision ID: b2e7c4d91f36
Revises: a7d3e5f20b91
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b2e7c4d91f36"
down_revision = "a7d3e5f20b91"
branch_labels = None
depends_on = None

# Created by a1c5e30bf742 for raise documents; reused, never re-created.
document_status = postgresql.ENUM(
    "verified", "uploaded", "missing", name="collection_document_status", create_type=False
)


def upgrade() -> None:
    op.create_table(
        "collection_profile_document",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("profile_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("status", document_status, nullable=False, server_default="uploaded"),
        sa.Column("file_url", sa.String(length=500), nullable=True),
        sa.Column("verified_by_id", sa.Integer(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["profile_id"], ["collection_profile.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["verified_by_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_collection_profile_document_profile_id",
        "collection_profile_document",
        ["profile_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_collection_profile_document_profile_id", table_name="collection_profile_document"
    )
    op.drop_table("collection_profile_document")
