# app/models/training.py
import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.models.base import TimeStampedModel

class TaskType(str, enum.Enum):
    PUZZLE_BATCH = "PUZZLE_BATCH"         # Lote de puzzles por tema
    GM_GAME_STUDY = "GM_GAME_STUDY"       # Partida de GM comentada
    USER_GAME_ANALYSIS = "USER_GAME_ANALYSIS" # Revisión de partida propia con anotaciones

class TaskStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    EXPIRED = "EXPIRED"

class WeeklyPlan(TimeStampedModel):
    __tablename__ = "weekly_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    coach_report_id = Column(Integer, ForeignKey("coach_reports.id"), nullable=True)
    
    week_start = Column(DateTime, nullable=False) # Viernes inicio
    week_end = Column(DateTime, nullable=False)   # Viernes siguiente (expiración)
    is_active = Column(Boolean, default=True)
    
    # Relación con los módulos/tareas de esta semana
    tasks = relationship("TrainingTask", back_populates="weekly_plan", cascade="all, delete-orphan")

class TrainingTask(TimeStampedModel):
    __tablename__ = "training_tasks"

    id = Column(Integer, primary_key=True, index=True)
    weekly_plan_id = Column(Integer, ForeignKey("weekly_plans.id"), nullable=False)
    
    task_type = Column(Enum(TaskType), nullable=False)
    title = Column(String(200), nullable=False)        # Ej: "15 Ejercicios de Eliminación del Defensor"
    description = Column(Text, nullable=True)         # Motivo técnico/explicación de la IA
    theme_tag = Column(String(100), nullable=True)     # Ej: "hangingPiece", "endgame", etc.
    status = Column(Enum(TaskStatus), default=TaskStatus.PENDING)
    
    # Datos específicos del módulo (JSON)
    # Si es PUZZLE_BATCH: {"puzzle_ids": ["000a9", ...], "completed_ids": []}
    # Si es GM_GAME_STUDY: {"gm_name": "Capablanca", "topic": "Peón aislado"}
    payload = Column(JSON, nullable=True)
    
    weekly_plan = relationship("WeeklyPlan", back_populates="tasks")
    gm_game = relationship("GMGameAssignment", back_populates="task", uselist=False, cascade="all, delete-orphan")

class GMGameAssignment(TimeStampedModel):
    __tablename__ = "gm_game_assignments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("training_tasks.id"), nullable=False)
    
    gm_name = Column(String(100), nullable=False)
    opponent = Column(String(100), nullable=True)
    event_year = Column(String(50), nullable=True)
    topic = Column(String(150), nullable=False)
    
    pgn_base = Column(Text, nullable=False)              # PGN limpio de la partida
    pgn_annotated = Column(Text, nullable=True)          # PGN con comentarios pedagógicos de Gemini
    user_notes = Column(Text, nullable=True)             # Anotaciones/variantes escritas por el usuario
    coach_feedback = Column(Text, nullable=True)         # Respuesta/evaluación de Gemini al análisis del usuario

    task = relationship("TrainingTask", back_populates="gm_game")