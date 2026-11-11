"""add near_account_id and device_token

Revision ID: 02bdc72a8c3d
Revises: 0174af76d98a
Create Date: 2026-07-10 12:42:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '02bdc72a8c3d'
down_revision: Union[str, Sequence[str], None] = '0174af76d98a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('user')]
    
    # Add columns if they do not exist
    if 'device_token' not in columns:
        op.add_column('user', sa.Column('device_token', sa.String(length=255), nullable=True))
    if 'near_account_id' not in columns:
        op.add_column('user', sa.Column('near_account_id', sa.String(length=255), nullable=False, server_default=''))
    
    # Add indexes if they do not exist
    indexes = [i['name'] for i in inspector.get_indexes('user')]
    if 'ix_user_device_token' not in indexes:
        op.create_index(op.f('ix_user_device_token'), 'user', ['device_token'], unique=False)
    if 'ix_user_near_account_id' not in indexes:
        op.create_index(op.f('ix_user_near_account_id'), 'user', ['near_account_id'], unique=False)
    
    # Add unique constraint if it does not exist (SQLite requires batch mode)
    constraints = [c['name'] for c in inspector.get_unique_constraints('user')]
    if 'uq_near_account_id_type' not in constraints:
        with op.batch_alter_table('user') as batch_op:
            batch_op.create_unique_constraint('uq_near_account_id_type', ['near_account_id', 'account_type'])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    constraints = [c['name'] for c in inspector.get_unique_constraints('user')]
    
    # Drop unique constraint if it exists
    if 'uq_near_account_id_type' in constraints:
        with op.batch_alter_table('user') as batch_op:
            batch_op.drop_constraint('uq_near_account_id_type', type_='unique')
        
    indexes = [i['name'] for i in inspector.get_indexes('user')]
    if 'ix_user_near_account_id' in indexes:
        op.drop_index(op.f('ix_user_near_account_id'), table_name='user')
    if 'ix_user_device_token' in indexes:
        op.drop_index(op.f('ix_user_device_token'), table_name='user')
        
    columns = [c['name'] for c in inspector.get_columns('user')]
    if 'near_account_id' in columns:
        op.drop_column('user', 'near_account_id')
    if 'device_token' in columns:
        op.drop_column('user', 'device_token')
