"""intentos y payload de reauditoria en analisis y consultas GM

Revision ID: 7b3bc00bb49f
Revises: d4e5f6a7b8c9
Create Date: 2026-08-25 16:05:02.254391

Reintentos de tareas de fondo ante saturación de la IA:
- gm_consultations.attempts: intentos realizados en la última ronda.
- user_game_analyses.audit_attempts: ídem para la auditoría del autodiagnóstico.
- user_game_analyses.audit_payload: snapshot JSON del envío para relanzar la
  auditoría tras un reinicio del servidor sin perder contexto.

(Generada por autogenerate y recortada: solo las columnas nuevas; el resto de
diferencias detectadas eran drift preexistente modelo/BD que no se toca aquí.)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7b3bc00bb49f'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('gm_consultations', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('attempts', sa.Integer(), nullable=False, server_default='0')
        )

    with op.batch_alter_table('user_game_analyses', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('audit_attempts', sa.Integer(), nullable=False, server_default='0')
        )
        batch_op.add_column(sa.Column('audit_payload', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('user_game_analyses', schema=None) as batch_op:
        batch_op.drop_column('audit_payload')
        batch_op.drop_column('audit_attempts')

    with op.batch_alter_table('gm_consultations', schema=None) as batch_op:
        batch_op.drop_column('attempts')
