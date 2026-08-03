from sqlalchemy import Column, Integer, String, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.models.base import TimeStampedModel

class Game(TimeStampedModel):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    white_player = Column(String(100), nullable=False)
    black_player = Column(String(100), nullable=False)
    result = Column(String(10), nullable=False)  # "1-0", "0-1", "1/2-1/2"
    player_color = Column(String(5), nullable=False)  # "white" o "black"
    pgn_content = Column(Text, nullable=False)  # El PGN original completo
    # ⚠️ NUEVOS CAMPOS DE CONTROL (Añade estas dos líneas)
    total_moves = Column(Integer, default=0, nullable=False)
    game_date = Column(String(20), default="????.??.??", nullable=False)

    # Relaciones
    user = relationship("User", back_populates="games")
    errors = relationship("MoveError", back_populates="game", cascade="all, delete-orphan")


class MoveError(TimeStampedModel):
    __tablename__ = "move_errors"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    
    move_number = Column(Integer, nullable=False)
    algebraic_move = Column(String(10), nullable=False)  # Ej: "Nf3", "Bxf7+"
    error_type = Column(String(50), nullable=False)      # "Blunder", "Mistake", "Inaccuracy"
    eval_difference = Column(Integer, nullable=False)    # Pérdida de centipeones (ej: -250)
    
    tactical_theme = Column(String(100), default="Unknown", nullable=False)  # Ej: "Fork", "Hanging Piece"
    description = Column(Text, nullable=True)

    # Relación inversa hacia la partida
    game = relationship("Game", back_populates="errors")


class CoachReport(TimeStampedModel):
    __tablename__ = "coach_reports"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Campos estructurados del informe
    estimated_level = Column(String(50), nullable=False)
    strengths = Column(JSON, nullable=False)
    weaknesses = Column(JSON, nullable=False)
    report_markdown = Column(Text, nullable=False)

    # Relación inversa hacia el usuario
    user = relationship("User", back_populates="coach_reports")