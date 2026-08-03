import random
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.puzzle import Puzzle

class PuzzleService:
    @staticmethod
    def get_puzzle_by_id(db: Session, puzzle_id: str) -> Optional[Puzzle]:
        """Obtiene un ejercicio específico por su ID (ej: '000a9')."""
        return db.query(Puzzle).filter(Puzzle.id == puzzle_id).first()

    @staticmethod
    def get_puzzles_for_training(
        db: Session,
        user_rating: int,
        rating_margin: int = 150,
        theme: Optional[str] = None,
        opening_tag: Optional[str] = None,
        limit: int = 10
    ) -> List[Puzzle]:
        """
        Selecciona un conjunto de ejercicios ajustados al nivel del usuario.
        
        :param db: Sesión de SQLAlchemy
        :param user_rating: Elo/Rating actual del usuario
        :param rating_margin: Margen de diferencia de rating (ej. +/- 150)
        :param theme: Tema táctico opcional (ej. 'fork', 'pin', 'endgame')
        :param opening_tag: Tag de apertura opcional (ej. 'Sicilian_Defense')
        :param limit: Número de ejercicios a devolver
        """
        min_rating = max(user_rating - rating_margin, 600)
        max_rating = user_rating + rating_margin

        query = db.query(Puzzle).filter(
            Puzzle.rating >= min_rating,
            Puzzle.rating <= max_rating
        )

        # Filtrar por tema táctico si se especifica
        if theme:
            query = query.filter(Puzzle.themes.ilike(f"%{theme}%"))

        # Filtrar por tag de apertura si se especifica
        if opening_tag:
            query = query.filter(Puzzle.opening_tags.ilike(f"%{opening_tag}%"))

        # Seleccionar aleatoriamente entre los candidatos encontrados
        puzzles = query.order_by(func.random()).limit(limit).all()

        # Fallback: si el filtro por tema fue demasiado estricto y no trajo suficientes,
        # relajamos el tema para devolver al menos ejercicios de su nivel.
        if len(puzzles) < limit and (theme or opening_tag):
            fallback_query = db.query(Puzzle).filter(
                Puzzle.rating >= min_rating,
                Puzzle.rating <= max_rating
            ).order_by(func.random()).limit(limit - len(puzzles))
            
            puzzles.extend(fallback_query.all())

        return puzzles

    @staticmethod
    def get_random_puzzles_by_themes(
        db: Session,
        themes: List[str],
        user_rating: int,
        count_per_theme: int = 5
    ) -> List[Puzzle]:
        """
        Obtiene un paquete mezclado de ejercicios basados en una lista de temas a mejorar.
        Útil para generar las tareas diarias asignadas por Gemini.
        """
        selected_puzzles = []
        for theme in themes:
            puzzles = PuzzleService.get_puzzles_for_training(
                db=db,
                user_rating=user_rating,
                theme=theme.strip(),
                limit=count_per_theme
            )
            selected_puzzles.extend(puzzles)
        
        # Eliminar posibles duplicados
        unique_puzzles = {p.id: p for p in selected_puzzles}.values()
        return list(unique_puzzles)