"""Widen user.username from 30 to 254 characters

Both apps send the email address as the username, and the column held only
30 characters, so anyone whose email was longer than 30 could not sign up
(a 422 "string_too_long" at signup). 254 is the longest valid email address.

Revision ID: c4f1a8d93e27
Revises: b9e4d2a7c513
Create Date: 2026-11-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4f1a8d93e27"
down_revision: Union[str, Sequence[str], None] = "b9e4d2a7c513"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "user",
        "username",
        existing_type=sa.String(length=30),
        type_=sa.String(length=254),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "user",
        "username",
        existing_type=sa.String(length=254),
        type_=sa.String(length=30),
        existing_nullable=True,
    )
