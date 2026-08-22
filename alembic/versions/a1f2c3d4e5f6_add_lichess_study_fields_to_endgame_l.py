"""Add Lichess study fields to endgame_lessons

Revision ID: a1f2c3d4e5f6
Revises: 2b3bd18344d8
Create Date: 2026-08-21 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1f2c3d4e5f6'
down_revision: Union[str, None] = '2b3bd18344d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('endgame_lessons', schema=None) as batch_op:
        batch_op.add_column(sa.Column('lesson_number', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('chapter_name', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('concept', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('pgn_content', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('main_line', sa.JSON(), nullable=True))
        batch_op.create_index(batch_op.f('ix_endgame_lessons_lesson_number'), ['lesson_number'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('endgame_lessons', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_endgame_lessons_lesson_number'))
        batch_op.drop_column('main_line')
        batch_op.drop_column('pgn_content')
        batch_op.drop_column('concept')
        batch_op.drop_column('chapter_name')
        batch_op.drop_column('lesson_number')
