from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.api.v1.dependencies import get_current_user_id
from app.schemas.analysis import GameAnalysisCreate, GameAnalysisResponse
from app.services.tutor_service import tutor_gemini_service
from app.repositories.gm_game_repo import gm_game_repo
from app.models.user_game_analysis import UserGameAnalysis

router = APIRouter()


@router.post(
    "/submit",
    response_model=GameAnalysisResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Enviar autodiagnóstico de partida GM para auditoría de Gemini"
)
def submit_game_analysis(
    analysis_data: GameAnalysisCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    gm_game = gm_game_repo.get_by_id(db, analysis_data.gm_game_id)
    if not gm_game:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Partida GM con ID {analysis_data.gm_game_id} no encontrada en caché."
        )

    try:
        result = tutor_gemini_service.analyze_user_diagnosis(
            db=db,
            user_id=user_id,
            analysis_data=analysis_data
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en auditoría del tutor: {str(e)}",
        )


@router.get(
    "/{analysis_id}",
    response_model=GameAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Obtener autodiagnóstico y auditoría guardados por ID"
)
def get_analysis_by_id(
    analysis_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    analysis = (
        db.query(UserGameAnalysis)
        .filter(
            UserGameAnalysis.id == analysis_id,
            UserGameAnalysis.user_id == user_id
        )
        .first()
    )

    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Autodiagnóstico no encontrado."
        )

    return analysis


@router.get(
    "/",
    response_model=List[GameAnalysisResponse],
    status_code=status.HTTP_200_OK,
    summary="Listar historial de autodiagnósticos del usuario"
)
def list_user_analyses(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    analyses = (
        db.query(UserGameAnalysis)
        .filter(UserGameAnalysis.user_id == user_id)
        .order_by(UserGameAnalysis.created_at.desc())
        .all()
    )
    return analyses
