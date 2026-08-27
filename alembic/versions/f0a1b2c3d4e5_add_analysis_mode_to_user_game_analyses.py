"""add analysis_mode to user_game_analyses

Nuevo modo de análisis: 'auto' (detección implícita), 'ai' (análisis completo del
Gran Maestro sin comentarios del alumno) o 'self_audit' (auditoría del autodiagnóstico).
Migración idempotente: si la columna ya existe se omite.

Revision ID: f0a1b2c3d4e5
Revises: 7b3bc00bb49f
Create Date: 2026-08-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f0a1b2c3d4e5'
down_revision: Union[str, None] = '7b3bc00bb49f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("user_game_analyses")}

    with op.batch_alter_table('user_game_analyses', schema=None) as batch_op:
        if 'analysis_mode' not in existing_cols:
            batch_op.add_column(
                sa.Column('analysis_mode', sa.String(length=12), nullable=True, server_default='auto')
            )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("user_game_analyses")}

    with op.batch_alter_table('user_game_analyses', schema=None) as batch_op:
        if 'analysis_mode' in existing_cols:
            batch_op.drop_column('analysis_mode')
