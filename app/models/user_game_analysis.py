# app/models/user_game_analysis.py
from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class UserGameAnalysis(Base):
    __tablename__ = "user_game_analyses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    game_id = Column(String(36), ForeignKey("gm_games.id", ondelete="SET NULL"), nullable=True)
    game_type = Column(String(10), nullable=False, default="GM")
    fases_analisis = Column(Text, nullable=True)
    momentos_criticos = Column(Text, nullable=True)
    factores_posicionales = Column(Text, nullable=True)
    conclusiones_plan = Column(Text, nullable=True)
    gemini_feedback = Column(Text, nullable=True)
    created_at = Column(Text, nullable=False)

    user = relationship("User")
    gm_game = relationship("GMGame")
