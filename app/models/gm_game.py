# app/models/gm_game.py
import uuid
from sqlalchemy import Column, Integer, String, Text
from app.models.base import TimeStampedModel

from sqlalchemy.orm import relationship

class GMGame(TimeStampedModel):
    """
    Modelo para almacenar partidas de Grandes Maestros (GM) cacheadas.
    """
    __tablename__ = "gm_games"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    gm_name = Column(String(100), nullable=False, index=True, doc="Nombre del GM buscado (ej: 'Carlsen')")
    white = Column(String(100), nullable=False, doc="Jugador de las piezas blancas")
    black = Column(String(100), nullable=False, doc="Jugador de las piezas negras")
    event = Column(String(200), default="Partida Online", doc="Torneo o evento donde se jugó")
    year = Column(Integer, nullable=False, doc="Año en que se jugó la partida")
    result = Column(String(20), nullable=False, doc="Resultado de la partida (ej: '1-0', '0-1', '1/2-1/2')")
    pgn = Column(Text, nullable=False, doc="Notación PGN completa de la partida")
    theme_tags = Column(String(500), index=True, nullable=True, doc="Etiquetas temáticas (ej: 'endgame', 'pawn_structure')")
    
    analysis_records = relationship("UserAnalyzedGMGame", back_populates="gm_game", cascade="all, delete-orphan")
