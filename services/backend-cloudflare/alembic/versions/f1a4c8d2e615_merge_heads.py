"""merge heads

Revision ID: f1a4c8d2e615
Revises: 29ef12a08c4a, b3d6e9a2f108
Create Date: 2026-07-28 00:00:00.000000

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "f1a4c8d2e615"
down_revision: Union[str, Sequence[str], None] = ("29ef12a08c4a", "b3d6e9a2f108")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Merge only — 29ef12a08c4a and b3d6e9a2f108 both branched off
    # 0174af76d98a independently and diverged, leaving two heads. That
    # doesn't break `alembic upgrade heads` (used by entrypoint.sh), but it
    # does break `alembic upgrade head` (used by quick_start.sh) and any
    # other tooling that assumes a single head. Nothing to actually apply —
    # 29ef12a08c4a's own upgrade() is already a no-op.
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
