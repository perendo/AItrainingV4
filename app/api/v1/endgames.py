# app/api/v1/endgames.py
import logging
import chess
import chess.engine
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import asc

from app.core.database import get_db
from app.core.config import settings
from app.api.v1.dependencies import get_current_user_id
from app.models.endgame import (
    EndgameLesson,
    EndgameTimelineEvent,
    UserEndgameProgress,
    LessonCategory,
    LessonStatus,
)
from app.schemas.endgame import (
    EndgameLessonListItem,
    EndgameLessonDetail,
    TimelineEventResponse,
    EndgameProgressUpdate,
    EndgameProgressResponse,
    LessonStatus as LessonStatusSchema,
    ActionType,
)

logger = logging.getLogger("Endgames")

AUDIO_URL_PREFIX = "/static/audio/endgames"


class UTF8JSONResponse(JSONResponse):
    """Respuesta JSON que declara explícitamente `charset=utf-8`.

    Starlette ya serializa con `ensure_ascii=False` y codifica a UTF-8, pero
    el header queda como `application/json` a secas. Declarar el charset de
    forma explícita evita que proxies/clientes mal configurados interpreten
    el cuerpo como Latin-1 y corrompan tildes/ñ ("PeÃ³n" en vez de "Peón").
    """

    media_type = "application/json; charset=utf-8"


def _build_audio_url(lesson: EndgameLesson) -> Optional[str]:
    if not lesson.audio_path:
        return None
    # audio_path se guarda como "audio/endgames/{slug}.mp3"
    return f"{AUDIO_URL_PREFIX}/{lesson.slug}.mp3"


def _get_user_progress(db: Session, user_id: int, lesson_id: int) -> Optional[UserEndgameProgress]:
    return (
        db.query(UserEndgameProgress)
        .filter(
            UserEndgameProgress.user_id == user_id,
            UserEndgameProgress.lesson_id == lesson_id,
        )
        .first()
    )


def _to_list_item(lesson: EndgameLesson, progress: Optional[UserEndgameProgress]) -> EndgameLessonListItem:
    status_val = LessonStatusSchema.NOT_STARTED
    last = 0.0
    if progress:
        status_val = LessonStatusSchema(progress.status.value)
        last = progress.last_listened_second
    return EndgameLessonListItem(
        id=lesson.id,
        slug=lesson.slug,
        title=lesson.title,
        category=LessonCategory(lesson.category.value),
        difficulty=lesson.difficulty or "intermedio",
        target_result=lesson.target_result or "win",
        has_audio=bool(lesson.audio_path),
        status=status_val,
        last_listened_second=last,
        lesson_number=lesson.lesson_number,
        concept=lesson.concept,
    )


router = APIRouter()


@router.get(
    "/lessons",
    response_model=dict,
    response_class=UTF8JSONResponse,
    summary="Catálogo de lecciones de finales teóricos",
)
def list_lessons(
    category: Optional[str] = Query(None, description="Filtrar por categoría (peones, torres, piezas_menores, damas)"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Devuelve el catálogo de lecciones agrupado por categoría, incluyendo el
    estado de progreso del usuario autenticado para cada lección.
    Si se pasa `category`, se devuelve únicamente esa categoría.
    """
    query = db.query(EndgameLesson)
    if category:
        try:
            cat_enum = LessonCategory(category)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Categoría inválida: {category}",
            )
        query = query.filter(EndgameLesson.category == cat_enum)

    lessons = query.order_by(EndgameLesson.id).all()

    grouped: dict = {}
    for lesson in lessons:
        progress = _get_user_progress(db, user_id, lesson.id)
        item = _to_list_item(lesson, progress)
        cat_key = lesson.category.value
        grouped.setdefault(cat_key, []).append(item)

    if category:
        return {category: grouped.get(category, [])}

    return grouped


@router.get(
    "/lessons/{slug}",
    response_model=EndgameLessonDetail,
    response_class=UTF8JSONResponse,
    summary="Detalle de una lección de final teórico",
)
def get_lesson_detail(
    slug: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Devuelve los detalles de una lección específica: FEN inicial, URL del audio
    y la lista de `timeline_events` ordenada por `timestamp_seconds`.
    """
    lesson = db.query(EndgameLesson).filter(EndgameLesson.slug == slug).first()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lección no encontrada.",
        )

    events = (
        db.query(EndgameTimelineEvent)
        .filter(EndgameTimelineEvent.lesson_id == lesson.id)
        .order_by(asc(EndgameTimelineEvent.timestamp_seconds))
        .all()
    )

    return EndgameLessonDetail(
        id=lesson.id,
        slug=lesson.slug,
        title=lesson.title,
        category=LessonCategory(lesson.category.value),
        difficulty=lesson.difficulty or "intermedio",
        target_result=lesson.target_result or "win",
        initial_fen=lesson.initial_fen,
        audio_url=_build_audio_url(lesson),
        podcast_script=lesson.podcast_script,
        timeline_events=[
            TimelineEventResponse(
                id=e.id,
                lesson_id=e.lesson_id,
                timestamp_seconds=e.timestamp_seconds,
                action_type=ActionType(e.action_type.value),
                payload=e.payload,
            )
            for e in events
        ],
        lesson_number=lesson.lesson_number,
        chapter_name=lesson.chapter_name,
        concept=lesson.concept,
        pgn_content=lesson.pgn_content,
        main_line=lesson.main_line,
        initial_comment=lesson.initial_comment,
        theory_tree=lesson.theory_tree,
        final_comment=lesson.final_comment,
    )


@router.post(
    "/lessons/{slug}/progress",
    response_model=EndgameProgressResponse,
    response_class=UTF8JSONResponse,
    summary="Actualizar el progreso del usuario en una lección",
)
def update_lesson_progress(
    slug: str,
    payload: EndgameProgressUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Crea o actualiza el progreso del usuario para una lección
    (`status` y `last_listened_second`).
    """
    lesson = db.query(EndgameLesson).filter(EndgameLesson.slug == slug).first()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lección no encontrada.",
        )

    progress = _get_user_progress(db, user_id, lesson.id)
    if not progress:
        progress = UserEndgameProgress(
            user_id=user_id,
            lesson_id=lesson.id,
        )
        db.add(progress)

    # No degradar un progreso ya dominado: reabrir la teoría (markInProgress
    # envía "in_progress") no debe borrar un "mastered" conseguido en la práctica.
    from app.models.endgame import LessonStatus as _LS
    if progress.status == _LS.MASTERED and payload.status != _LS.MASTERED:
        pass
    else:
        progress.status = LessonStatus(payload.status.value)
    progress.last_listened_second = payload.last_listened_second
    db.commit()
    db.refresh(progress)

    return EndgameProgressResponse(
        slug=slug,
        status=LessonStatusSchema(progress.status.value),
        last_listened_second=progress.last_listened_second,
        updated_at=progress.updated_at,
    )


# ── Stockfish Practice Mode ──────────────────────────────────────────────── #


class StockfishMoveRequest(BaseModel):
    fen: str = Field(..., description="Posición FEN actual del tablero")
    skill_level: int = Field(
        default=8, ge=1, le=20,
        description="Nivel de habilidad de Stockfish (1=fácil, 20=máximo)",
    )
    time_limit: float = Field(
        default=0.5, ge=0.05, le=2.0,
        description="Tiempo máximo de cálculo en segundos",
    )


class StockfishMoveResponse(BaseModel):
    move_uci: str = Field(..., description="Mejor jugada en notación UCI (ej: e2e4)")
    move_san: str = Field(..., description="Mejor jugada en notación algebraica (ej: e4)")
    fen_after: str = Field(..., description="Posición FEN resultante tras la jugada")


@router.post(
    "/stockfish-move",
    response_model=StockfishMoveResponse,
    response_class=UTF8JSONResponse,
    summary="Obtener la mejor jugada de Stockfish para práctica",
)
def get_stockfish_move(payload: StockfishMoveRequest):
    """
    Calcula la mejor jugada de Stockfish para la posición dada.
    Diseñado para el modo Práctica de finales: el usuario juega una posición
    y Stockfish responde como oponente al nivel configurado.
    """
    # Validar FEN
    try:
        board = chess.Board(payload.fen)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="FEN inválido.",
        )

    if board.is_game_over():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La posición ya es final de partida (game over).",
        )

    engine = None
    try:
        engine = chess.engine.SimpleEngine.popen_uci(settings.STOCKFISH_PATH)
        engine.configure({"Skill Level": payload.skill_level})

        result = engine.play(
            board,
            chess.engine.Limit(time=payload.time_limit),
        )

        move_uci = result.move.uci()
        move_san = board.san(result.move)

        board.push(result.move)
        fen_after = board.fen()

        return StockfishMoveResponse(
            move_uci=move_uci,
            move_san=move_san,
            fen_after=fen_after,
        )

    except (chess.engine.EngineTerminatedError, chess.engine.EngineError) as e:
        logger.error(f"Error de motor Stockfish: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al comunicarse con el motor Stockfish.",
        )
    except Exception as e:
        logger.error(f"Error inesperado en stockfish-move: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al calcular la jugada.",
        )
    finally:
        if engine:
            try:
                engine.quit()
            except Exception:
                pass
