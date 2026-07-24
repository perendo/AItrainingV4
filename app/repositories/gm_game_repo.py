from typing import Optional
from sqlalchemy.orm import Session
from app.repositories.base import BaseRepository
from app.models.gm_game import GMGame


class GMGameRepository(BaseRepository[GMGame]):
    def __init__(self):
        super().__init__(GMGame)

    def get_by_id(self, db: Session, gm_game_id: str) -> Optional[GMGame]:
        """Obtiene una partida GM por su ID (UUID string)."""
        return db.query(self.model).filter(self.model.id == gm_game_id).first()

    def get_by_gm_name(self, db: Session, gm_name: str, limit: int = 10) -> list[GMGame]:
        """Busca partidas por nombre del GM (case-insensitive)."""
        return (
            db.query(self.model)
            .filter(self.model.gm_name.ilike(f"%{gm_name}%"))
            .limit(limit)
            .all()
        )


gm_game_repo = GMGameRepository()