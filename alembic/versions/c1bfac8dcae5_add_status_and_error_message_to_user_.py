"""reconcile status and error_message on user_game_analyses

La BD de producción (entrenador_ia.db y dist/entrenador_ia.db) se creó desde
un modelo anterior que no incluía estas columnas y ya estaba marcada en "head",
así que `alembic upgrade head` nunca las añadía. Esta migración las agrega de
forma idempotente: si la columna/index ya existe (p.ej. BD recién creada desde
fe831aa70a9f, que sí las define) se omite y no falla.

Revision ID: c1bfac8dcae5
Revises: fe831aa70a9f
Create Date: 2026-08-20 10:54:28.637131

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1bfac8dcae5'
down_revision: Union[str, None] = 'fe831aa70a9f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("user_game_analyses")}
    existing_idx = {i["name"] for i in insp.get_indexes("user_game_analyses")}

    with op.batch_alter_table('user_game_analyses', schema=None) as batch_op:
        if 'status' not in existing_cols:
            batch_op.add_column(
                sa.Column('status', sa.String(length=20), nullable=False, server_default='processing')
            )
        if 'error_message' not in existing_cols:
            batch_op.add_column(sa.Column('error_message', sa.Text(), nullable=True))

    if 'ix_user_game_analyses_status' not in existing_idx:
        op.create_index(
            'ix_user_game_analyses_status', 'user_game_analyses', ['status'], unique=False
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("user_game_analyses")}
    existing_idx = {i["name"] for i in insp.get_indexes("user_game_analyses")}

    if 'ix_user_game_analyses_status' in existing_idx:
        op.drop_index('ix_user_game_analyses_status')

    with op.batch_alter_table('user_game_analyses', schema=None) as batch_op:
        if 'error_message' in existing_cols:
            batch_op.drop_column('error_message')
        if 'status' in existing_cols:
            batch_op.drop_column('status')
