# app/schemas/endgame.py
from typing import List, Optional, Dict
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, ConfigDict


class LessonCategory(str, Enum):
    PEONES = "peones"
    TORRES = "torres"
    PIEZAS_MENORES = "piezas_menores"
    DAMAS = "damas"


class LessonStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    MASTERED = "mastered"


class ActionType(str, Enum):
    MOVE_PIECE = "move_piece"
    HIGHLIGHT_SQUARE = "highlight_square"
    DRAW_ARROW = "draw_arrow"
    PAUSE_FOR_QUIZ = "pause_for_quiz"


# ---------------------------------------------------------------------- #
# Respuestas
# ---------------------------------------------------------------------- #
class TimelineEventResponse(BaseModel):
    id: int
    lesson_id: int
    timestamp_seconds: float
    action_type: ActionType
    payload: dict

    model_config = ConfigDict(from_attributes=True)


class EndgameLessonListItem(BaseModel):
    id: int
    slug: str
    title: str
    category: LessonCategory
    difficulty: str
    target_result: str
    has_audio: bool
    status: LessonStatus = LessonStatus.NOT_STARTED
    last_listened_second: float = 0.0
    lesson_number: Optional[int] = None
    concept: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CategoryCatalog(BaseModel):
    categories: Dict[str, List[EndgameLessonListItem]] = Field(
        default_factory=dict,
        description="Catálogo agrupado por categoría de lección.",
    )


class EndgameLessonDetail(BaseModel):
    id: int
    slug: str
    title: str
    category: LessonCategory
    difficulty: str
    target_result: str
    initial_fen: str
    audio_url: Optional[str] = None
    podcast_script: Optional[str] = None
    timeline_events: List[TimelineEventResponse] = Field(default_factory=list)
    lesson_number: Optional[int] = None
    chapter_name: Optional[str] = None
    concept: Optional[str] = None
    pgn_content: Optional[str] = None
    main_line: Optional[List[str]] = None
    initial_comment: Optional[str] = None
    theory_tree: Optional[list] = None
    final_comment: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class EndgameProgressResponse(BaseModel):
    slug: str
    status: LessonStatus
    last_listened_second: float
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------- #
# Peticiones
# ---------------------------------------------------------------------- #
class EndgameProgressUpdate(BaseModel):
    status: LessonStatus = LessonStatus.IN_PROGRESS
    last_listened_second: float = 0.0
