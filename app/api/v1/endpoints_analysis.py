# app/api/v1/endpoints_analysis.py
from typing import List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.v1.dependencies import get_current_user_id
from app.schemas.analysis import (
    GameAnalysisCreate,
    GameAnalysisDraftCreate,
    GameAnalysisResponse,
    GameAnalysisSubmitResponse,
    GameAnalysisStatusResponse,
)
from app.services.tutor_service import tutor_gemini_service
from app.repositories.gm_game_repo import gm_game_repo
from app.models.user_game_analysis import UserGameAnalysis

router = APIRouter()


def _enrich(db: Session, analysis: UserGameAnalysis) -> UserGameAnalysis:
    """Completa white_player/black_player/pgn desde gm_games para registros GM antiguos."""
    if analysis.game_type == "GM" and analysis.game_id:
        if not analysis.white_player or not analysis.black_player or not analysis.pgn:
            gm_game = gm_game_repo.get_by_id(db, str(analysis.game_id))
            if gm_game:
                if not analysis.white_player:
                    analysis.white_player = gm_game.white
                if not analysis.black_player:
                    analysis.black_player = gm_game.black
                if not analysis.pgn:
                    analysis.pgn = gm_game.pgn
    return analysis


@router.post(
    "/submit",
    response_model=GameAnalysisSubmitResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enviar autodiagnóstico al Gran Maestro (auditoría asíncrona en segundo plano)"
)
def submit_game_analysis(
    analysis_data: GameAnalysisCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    try:
        # 1. Persistimos el formulario de inmediato (estado "processing").
        analysis = tutor_gemini_service.create_pending_analysis(
            db=db,
            user_id=user_id,
            analysis_data=analysis_data,
        )
        # 2. La auditoría de Gemini se ejecuta en segundo plano (no bloquea la UI).
        background_tasks.add_task(
            tutor_gemini_service.audit_existing_analysis,
            analysis.id,
            user_id,
            analysis_data,
        )
        return GameAnalysisSubmitResponse(analysis_id=analysis.id, status="processing")
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al enviar la consulta al Gran Maestro: {str(e)}",
        )


@router.get(
    "/{analysis_id}/status",
    response_model=GameAnalysisStatusResponse,
    summary="Consultar el estado de la auditoría del Gran Maestro"
)
def get_analysis_status(
    analysis_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    analysis = (
        db.query(UserGameAnalysis)
        .filter(
            UserGameAnalysis.id == analysis_id,
            UserGameAnalysis.user_id == user_id,
        )
        .first()
    )
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Autodiagnóstico no encontrado.",
        )
    has_feedback = bool(analysis.gemini_feedback)
    # Estado real de la tarea de fondo; si es None (registro antiguo) se deriva
    # del feedback para mantener compatibilidad con datos previos.
    current_status = analysis.status
    if current_status is None:
        current_status = "completed" if has_feedback else "processing"
    error_message = analysis.error_message if current_status == "failed" else None
    return GameAnalysisStatusResponse(
        analysis_id=analysis.id,
        status=current_status,
        has_feedback=has_feedback,
        error_message=error_message,
    )


@router.post(
    "/save-draft",
    response_model=GameAnalysisResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar partida (GM o propia) o guardar autodiagnóstico sin auditar (Pendiente de Análisis)"
)
def save_analysis_draft(
    draft_data: GameAnalysisDraftCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    try:
        result = tutor_gemini_service.save_draft(
            db=db,
            user_id=user_id,
            draft_data=draft_data
        )
        return _enrich(db, result)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al guardar borrador: {str(e)}",
        )


@router.get(
    "/history",
    response_model=List[GameAnalysisResponse],
    status_code=status.HTTP_200_OK,
    summary="Historial de partidas analizadas/registradas por el usuario (created_at DESC)"
)
def list_analysis_history(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    analyses = (
        db.query(UserGameAnalysis)
        .filter(UserGameAnalysis.user_id == user_id)
        .order_by(UserGameAnalysis.created_at.desc(), UserGameAnalysis.id.desc())
        .all()
    )
    return [_enrich(db, a) for a in analyses]


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

    return _enrich(db, analysis)


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
    return list_analysis_history(db, user_id)
