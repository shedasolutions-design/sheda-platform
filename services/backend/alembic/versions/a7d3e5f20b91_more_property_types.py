"""Accept the eleven property types the app offers, not just four.

The app's browse and listing screens offer bungalow, duplex, luxury villa,
townhouse, waterfront, new development and affordable home, but the column
only took four, so the app saved those as "apartment".

Revision ID: a7d3e5f20b91
Revises: c4f1a8d93e27
"""

from alembic import op

revision = "a7d3e5f20b91"
down_revision = "c4f1a8d93e27"
branch_labels = None
depends_on = None

OLD = ("apartment", "land", "shortlet", "shared_apartment")
NEW = (
    "bungalow",
    "duplex",
    "luxury_villa",
    "townhouse",
    "waterfront",
    "new_development",
    "affordable_home",
)


def _check(values):
    listed = ", ".join(f"'{v}'" for v in values)
    return f"property_type IN ({listed})"


def upgrade() -> None:
    # ADD VALUE cannot run inside a transaction block on older Postgres.
    with op.get_context().autocommit_block():
        for value in NEW:
            op.execute(f"ALTER TYPE propertytypeenum ADD VALUE IF NOT EXISTS '{value}'")
    op.drop_constraint("check_property_type", "property", type_="check")
    op.create_check_constraint("check_property_type", "property", _check(OLD + NEW))


def downgrade() -> None:
    # Postgres cannot drop enum values; rows using the new types are moved
    # to "apartment" and the narrower check is restored.
    listed = ", ".join(f"'{v}'" for v in NEW)
    op.execute(f"UPDATE property SET property_type = 'apartment' WHERE property_type::text IN ({listed})")
    op.drop_constraint("check_property_type", "property", type_="check")
    op.create_check_constraint("check_property_type", "property", _check(OLD))
