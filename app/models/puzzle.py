# app/models/puzzle.py
from sqlalchemy import Column, Integer, String
from app.models.base import Base

class ChessPuzzle(Base):
    __tablename__ = "chess_puzzles"

    id = Column(Integer, primary_key=True, index=True)
    puzzle_id = Column(String(50), unique=True, index=True, nullable=False) # El ID de Lichess (ej: '00008')
    fen = Column(String(255), nullable=False)                              # Posición inicial
    moves = Column(String(1000), nullable=False)                          # Secuencia de jugadas en formato UCI
    rating = Column(Integer, index=True, nullable=False)                  # Dificultad del puzle (Elo)
    themes = Column(String(500), index=True, nullable=False)              # Tags separados por espacios (ej: 'fork advantage middlegame')
    