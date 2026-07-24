from typing import List, Optional
from sqlalchemy.orm import Session
from app.repositories.base import BaseRepository
from app.models.user_game_analysis import UserGameAnalysis


class UserGameAnalysisRepository(BaseRepository[UserGameAnalysis]):
    def __init__(self):
        super().__init__(UserGameAnalysis)

    def get_user_analyses(self, db: Session, user_id: int) -> List[UserGameAnalysis]:
        """Retorna todos los autodiagnósticos del usuario ordenados por fecha descendente."""
        return (
            db.query(self.model)
            .filter(self.model.user_id == user_id)
            .order_by(self.model.created_at.desc())
            .all()
        )

    def get_analysis_by_id(self, db: Session, user_id: int, analysis_id: int) -> Optional[UserGameAnalysis]:
        """Obtiene un autodiagnóstico específico por ID y usuario."""
        return (
            db.query(self.model)
            .filter(self.model.id == analysis_id, self.model.user_id == user_id)
            .first()
        )

    def get_analysis_by_gm_game(self, db: Session, user_id: int, gm_game_id: int) -> Optional[UserGameAnalysis]:
        """Obtiene el autodiagnóstico de un usuario para una partida GM específica."""
        return (
            db.query(self.model)
            .filter(self.model.user_id == user_id, self.model.game_id == gm_game_id)
            .first()
        )

    def count_user_analyses(self, db: Session, user_id: int) -> int:
        """Cuenta el total de autodiagnósticos del usuario."""
        return db.query(self.model).filter(self.model.user_id == user_id).count()


user_game_analysis_repo = UserGameAnalysisRepository()