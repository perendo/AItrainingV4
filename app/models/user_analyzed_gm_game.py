from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import TimeStampedModel

class UserAnalyzedGMGame(TimeStampedModel):
    __tablename__ = "user_analyzed_gm_games"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    gm_game_id = Column(String(36), ForeignKey("gm_games.id", ondelete="CASCADE"), nullable=False)

    user = relationship("User")
    gm_game = relationship("GMGame")
