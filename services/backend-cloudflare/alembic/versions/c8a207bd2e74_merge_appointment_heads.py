"""merge appointment heads

Revision ID: c8a207bd2e74
Revises: a3e7c951f204, c7d2f5e8b913
Create Date: 2026-08-02 00:00:00.000000

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "c8a207bd2e74"
down_revision: Union[str, Sequence[str], None] = ("a3e7c951f204", "c7d2f5e8b913")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # a3e7c951f204 and b3d6e9a2f108 both add the same appointment enum
    # values via ALTER TYPE ... ADD VALUE IF NOT EXISTS, so re-applying
    # either is a no-op.  c7d2f5e8b913 adds lease enum values the same
    # way.  Nothing to actually apply here — this is a pure merge.
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
