# app/models/user.py
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import TimeStampedModel 

class User(TimeStampedModel): 
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=True)
    chess_online_nick = Column(String(100), nullable=True)

    # 🔒 CAMPO PARA SEGURIDAD (Esencial para la autenticación JWT)
    hashed_password = Column(String(255), nullable=False)

    # ⚡ CAMPOS DINÁMICOS DE ELO
    current_elo = Column(Integer, default=1500, nullable=False)  # Elo actual (Ej: 1500 o 2100)
    target_elo = Column(Integer, default=1700, nullable=False)   # Elo objetivo (Ej: 1700 o 2200)

    # ID de la partida GM asignada actualmente (para que no cambie al refrescar)
    current_assigned_gm_game_id = Column(String(36), ForeignKey("gm_games.id", ondelete="SET NULL"), nullable=True)

    # RELACIONES EXISTENTES (¡Intactas y corregidas!)
    games = relationship("Game", back_populates="user", cascade="all, delete-orphan")
    coach_reports = relationship("CoachReport", back_populates="user", cascade="all, delete-orphan")
    
    # RELACIONES DE ENTRENAMIENTO
    training_tasks = relationship("TrainingTask", back_populates="user", cascade="all, delete-orphan")
    weekly_plans = relationship("WeeklyPlan", back_populates="user", cascade="all, delete-orphan")

    # RELACIÓN DE TAREAS DE PROCESAMIENTO
    tasks = relationship("ProcessingTask", back_populates="user", cascade="all, delete-orphan")
    analyzed_gm_games = relationship("UserAnalyzedGMGame", back_populates="user", cascade="all, delete-orphan")