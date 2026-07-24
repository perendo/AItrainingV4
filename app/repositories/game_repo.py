from typing import List
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.repositories.base import BaseRepository
from app.models.game import Game, MoveError

class GameRepository(BaseRepository[Game]):
    def __init__(self):
        super().__init__(Game)

    def get_user_games_with_errors(self, db: Session, user_id: int) -> List[Game]:
        """
        Retorna todas las partidas del usuario cargando sus errores asociados 
        en una sola consulta (Eager Loading) para evitar el problema N+1.
        """
        return (
            db.query(self.model)
            .filter(self.model.user_id == user_id)
            .options(joinedload(self.model.errors))  # Optimización N+1
            .order_by(self.model.created_at.desc())
            .all()
        )

    def count_user_games(self, db: Session, user_id: int) -> int:
        """Cuenta el total de partidas analizadas de un usuario."""
        return db.query(func.count(self.model.id)).filter(self.model.user_id == user_id).scalar()

    def create_game_with_errors(self, db: Session, game_data: dict, errors_data: List[dict]) -> Game:
        """
        Guarda la partida y todos sus errores en una sola transacción atómica.
        Si algo falla, hace rollback automático garantizando la integridad.
        """
        db_game = self.model(**game_data)
        db.add(db_game)
        db.flush()  # Genera el ID de la partida sin hacer commit definitivo todavía
        
        for error in errors_data:
            db_error = MoveError(game_id=db_game.id, **error)
            db.add(db_error)
            
        db.commit()
        db.refresh(db_game)
        return db_game
    
    # Esto iría dentro de app/repositories/game_repo.py

    def is_game_already_exists(
            self, db: Session, user_id: int, white: str, black: str, 
            result: str, total_moves: int, game_date: str
        ) -> bool:
            """
            Verifica de forma estricta si una partida ya existe para evitar duplicados.
            """
            # Forzamos los filtros usando las propiedades de la clase Game explícitamente
            exists = db.query(Game).filter(
                Game.user_id == user_id,
                Game.white_player == white,
                Game.black_player == black,
                Game.result == result,
                Game.total_moves == total_moves,
                Game.game_date == game_date
            ).first()
            
            return exists is not None

# Instancia singleton para importar en los servicios/endpoints
game_repo = GameRepository()