"""Add theory tree fields to endgame_lessons

Revision ID: b2f3c4d5e6f7
Revises: a1f2c3d4e5f6
Create Date: 2026-08-21 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2f3c4d5e6f7'
down_revision: Union[str, None] = 'a1f2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('endgame_lessons', schema=None) as batch_op:
        batch_op.add_column(sa.Column('initial_comment', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('theory_tree', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('final_comment', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('endgame_lessons', schema=None) as batch_op:
        batch_op.drop_column('final_comment')
        batch_op.drop_column('theory_tree')
        batch_op.drop_column('initial_comment')
