"""appointment.property_id FK: add ON DELETE CASCADE

Every other foreign key pointing at property.id already declares an ondelete
(CASCADE or SET NULL). appointment.property_id did not, so it defaulted to
NO ACTION and deleting a property that had any appointment raised an
IntegrityError. Nothing caught it, so the API returned a 500 — which the
browser then reported as a CORS failure, because the error response was
generated outside the CORS middleware.

Revision ID: d4b8e1c39a05
Revises: c8a207bd2e74
Create Date: 2026-08-07 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d4b8e1c39a05"
down_revision: Union[str, Sequence[str], None] = "c8a207bd2e74"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The original constraint was created without an explicit name, so Postgres
# auto-named it. That's conventionally appointment_property_id_fkey, but
# looking it up by column beats assuming — a wrong guess would make this
# migration fail on exactly the databases it needs to fix.
_DROP_EXISTING_FK = """
DO $$
DECLARE
    fk_name text;
BEGIN
    SELECT con.conname INTO fk_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid
     AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'appointment'
      AND att.attname = 'property_id'
      AND con.contype = 'f'
    LIMIT 1;

    IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE appointment DROP CONSTRAINT %I', fk_name);
    END IF;
END $$;
"""


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(_DROP_EXISTING_FK)
    op.create_foreign_key(
        "appointment_property_id_fkey",
        "appointment",
        "property",
        ["property_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "appointment_property_id_fkey", "appointment", type_="foreignkey"
    )
    op.create_foreign_key(
        "appointment_property_id_fkey",
        "appointment",
        "property",
        ["property_id"],
        ["id"],
    )
