# app/models/endgame.py
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey, Enum, DateTime, JSON
from sqlalchemy.orm import relationship

from app.core.database import Base


class LessonCategory(str, enum.Enum):
    PEONES = "peones"
    TORRES = "torres"
    PIEZAS_MENORES = "piezas_menores"
    DAMAS = "damas"


class ActionType(str, enum.Enum):
    MOVE_PIECE = "move_piece"
    HIGHLIGHT_SQUARE = "highlight_square"
    DRAW_ARROW = "draw_arrow"
    PAUSE_FOR_QUIZ = "pause_for_quiz"


class LessonStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    MASTERED = "mastered"


class EndgameLesson(Base):
    __tablename__ = "endgame_lessons"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    title = Column(String(200), nullable=False)
    category = Column(Enum(LessonCategory), index=True, nullable=False)
    difficulty = Column(String(50), default="intermedio")
    initial_fen = Column(String(100), nullable=False)
    target_result = Column(String(20), default="win", nullable=False)
    lesson_number = Column(Integer, index=True, nullable=True)
    chapter_name = Column(String(255), nullable=True)
    concept = Column(String(255), nullable=True)
    pgn_content = Column(Text, nullable=True)
    main_line = Column(JSON, nullable=True)
    initial_comment = Column(Text, nullable=True)
    theory_tree = Column(JSON, nullable=True)
    final_comment = Column(Text, nullable=True)
    audio_path = Column(String(255), nullable=True)
    podcast_script = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relaciones
    timeline_events = relationship(
        "EndgameTimelineEvent",
        back_populates="lesson",
        cascade="all, delete-orphan",
    )
    user_progress = relationship(
        "UserEndgameProgress",
        back_populates="lesson",
        cascade="all, delete-orphan",
    )


class EndgameTimelineEvent(Base):
    __tablename__ = "endgame_timeline_events"

    id = Column(Integer, primary_key=True, index=True)
    lesson_id = Column(
        Integer,
        ForeignKey("endgame_lessons.id", ondelete="CASCADE"),
        nullable=False,
    )
    timestamp_seconds = Column(Float, index=True, nullable=False)
    action_type = Column(Enum(ActionType), nullable=False)
    payload = Column(JSON, nullable=False)

    # Relación
    lesson = relationship("EndgameLesson", back_populates="timeline_events")


class UserEndgameProgress(Base):
    __tablename__ = "user_endgame_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    lesson_id = Column(
        Integer,
        ForeignKey("endgame_lessons.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status = Column(
        Enum(LessonStatus), default=LessonStatus.NOT_STARTED, nullable=False
    )
    last_listened_second = Column(Float, default=0.0)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    # Relaciones
    lesson = relationship("EndgameLesson", back_populates="user_progress")
    user = relationship("User")
