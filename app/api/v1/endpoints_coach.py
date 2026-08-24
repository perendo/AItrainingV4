# app/api/v1/endpoints_coach.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.services.llm_coach import llm_coach_service
from app.services.gemini_client import GeminiSaturadoError, MENSAJE_SATURACION
from app.api.v1.dependencies import get_current_user_id
from app.models.game import CoachReport as CoachReportModel
from app.schemas.coach import CoachReportResponse # <-- Actualizado

router = APIRouter()


@router.post(
    "/diagnostic",
    response_model=CoachReportResponse, # <-- Actualizado
    status_code=status.HTTP_201_CREATED,
    summary="Generar diagnóstico pedagógico de IA"
)
def get_game_diagnostic(
    db: Session = Depends(get_db), 
    user_id: int = Depends(get_current_user_id)
):
    """
    Analiza el historial de errores tácticos del usuario y solicita a un LLM
    la generación de un informe estructurado en JSON con los patrones de juego.
    Este es un endpoint POST porque crea un nuevo recurso (un informe).
    """
    try:
        # El servicio ahora devuelve el objeto ORM con la estructura nueva
        # FastAPI lo serializará a CoachReportResponse gracias a `from_attributes = True`
        return llm_coach_service.generate_diagnostic(db, user_id=user_id)
    except ValueError as e:
        # Errores de validación o lógica de negocio (ej. no hay partidas)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except GeminiSaturadoError:
        # Primario y reserva saturados (503/alta demanda) tras agotar reintentos.
        # Se devuelve 503 con mensaje amigable; el frontend lo muestra tal cual.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=MENSAJE_SATURACION,
        )
    except Exception as e:
        # Errores inesperados del servidor o de la API de Gemini
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar el diagnóstico con el Entrenador IA: {e}",
        )


@router.get(
    "/history",
    response_model=List[CoachReportResponse], # <-- Actualizado
    status_code=status.HTTP_200_OK,
    summary="Obtener el historial de informes del entrenador",
)
def get_coach_reports_history(
    db: Session = Depends(get_db), 
    user_id: int = Depends(get_current_user_id)
):
    """
    Devuelve la lista completa de diagnósticos e informes pedagógicos
    realizados al usuario, ordenados desde el más reciente al más antiguo.
    """
    reports = (
        db.query(CoachReportModel)
        .filter(CoachReportModel.user_id == user_id)
        .order_by(CoachReportModel.created_at.desc())
        .all()
    )
    return reports