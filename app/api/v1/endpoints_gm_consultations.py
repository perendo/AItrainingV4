# app/api/v1/endpoints_gm_consultations.py
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.v1.dependencies import get_current_user_id
from app.schemas.gm_consultation import (
    GMConsultationCreate,
    GMConsultationResponse,
    GMConsultationStatus,
)
from app.services.gm_consultation_service import gm_consultation_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/",
    response_model=GMConsultationStatus,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enviar una consulta/duda al Gran Maestro (procesamiento en segundo plano)",
)
def create_consultation(
    data: GMConsultationCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Recibe la duda del usuario y la procesa de forma ASÍNCRONA con la IA.
    Responde INMEDIATAMENTE con HTTP 202 (Accepted) devolviendo el
    `consultation_id` y el estado "processing". El informe se genera en
    segundo plano y se consulta vía GET /{id}/status.
    """
    consultation = gm_consultation_service.create_consultation(
        db=db, user_id=user_id, question=data.question
    )

    background_tasks.add_task(
        gm_consultation_service.process_consultation,
        consultation.id,
        user_id,
        data.question,
    )

    return GMConsultationStatus(
        consultation_id=consultation.id,
        status=consultation.status,
        created_at=consultation.created_at,
        updated_at=consultation.updated_at,
    )


@router.get(
    "/{consultation_id}/status",
    response_model=GMConsultationStatus,
    summary="Consultar el estado de una consulta al Gran Maestro",
)
def get_consultation_status(
    consultation_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Devuelve el estado actual de la consulta: "processing", "completed" o "failed".
    Cuando es "completed", incluye la respuesta en `answer`.
    """
    consultation = gm_consultation_service.get_consultation(
        db=db, consultation_id=consultation_id, user_id=user_id
    )
    if not consultation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consulta no encontrada.",
        )
    return GMConsultationStatus(
        consultation_id=consultation.id,
        status=consultation.status,
        answer=consultation.answer,
        error_message=consultation.error_message,
        created_at=consultation.created_at,
        updated_at=consultation.updated_at,
    )


@router.get(
    "/{consultation_id}",
    response_model=GMConsultationResponse,
    summary="Obtener una consulta completa (pregunta + respuesta)",
)
def get_consultation(
    consultation_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    consultation = gm_consultation_service.get_consultation(
        db=db, consultation_id=consultation_id, user_id=user_id
    )
    if not consultation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consulta no encontrada.",
        )
    return consultation


@router.get(
    "/",
    response_model=list[GMConsultationResponse],
    summary="Listar el historial de consultas al Gran Maestro del usuario",
)
def list_consultations(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return gm_consultation_service.list_consultations(db=db, user_id=user_id)
