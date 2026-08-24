"""consentimiento RGPD: legal_accepted_at y legal_accepted_version en users

Añade a la tabla users la prueba de consentimiento exigida por el RGPD
(arts. 6.1.a y 7): fecha de aceptación de los Términos/Política de Privacidad
y versión de los textos aceptados (Docs/legal.md).

Los usuarios existentes se rellenan con la fecha del despliegue y la versión
vigente (backfill), para que nadie quede "sin aceptar".

Revision ID: d4e5f6a7b8c9
Revises: b2f3c4d5e6f7
Create Date: 2026-08-24

"""
from typing import Sequence, Union
from datetime import datetime

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'b2f3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LEGAL_VERSION_BACKFILL = '2026-08-v1'


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("users")}

    with op.batch_alter_table('users', schema=None) as batch_op:
        if 'legal_accepted_at' not in existing_cols:
            batch_op.add_column(sa.Column('legal_accepted_at', sa.DateTime(), nullable=True))
        if 'legal_accepted_version' not in existing_cols:
            batch_op.add_column(sa.Column('legal_accepted_version', sa.String(length=20), nullable=True))

    # Backfill: los usuarios ya registrados antes del despliegue se consideran
    # aceptantes a fecha de la migración (eran testers del propio titular).
    if 'legal_accepted_at' not in existing_cols:
        bind.execute(
            sa.text(
                "UPDATE users SET legal_accepted_at = :ts, "
                "legal_accepted_version = :ver WHERE legal_accepted_at IS NULL"
            ),
            {"ts": datetime.utcnow(), "ver": LEGAL_VERSION_BACKFILL},
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("users")}

    with op.batch_alter_table('users', schema=None) as batch_op:
        if 'legal_accepted_version' in existing_cols:
            batch_op.drop_column('legal_accepted_version')
        if 'legal_accepted_at' in existing_cols:
            batch_op.drop_column('legal_accepted_at')
