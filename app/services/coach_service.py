from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.exercise import TrainingTask, ExerciseCategory
from app.services.puzzle_service import PuzzleService

class CoachService:

    @staticmethod
    def asignar_plan_entrenamiento_interactivo(
        db: Session, 
        user_id: int, 
        user_rating: int = 1500,
        weak_themes: Optional[List[str]] = None
    ) -> List[TrainingTask]:
        """
        Genera y asigna las tareas semanales.
        Para las tareas tácticas, consulta en la BD puzzles reales
        ajustados al rating del usuario y a sus temas débiles.
        """
        # 1. Limpiar tareas anteriores pendientes del usuario
        db.query(TrainingTask).filter(
            TrainingTask.user_id == user_id, 
            TrainingTask.is_completed == False
        ).delete()

        # Temas por defecto si no vienen especificados
        themes_to_practice = weak_themes or ["fork", "pin", "hangingPiece"]

        # 2. Buscar puzzles reales de la BD ajustados al rating del usuario
        tactical_puzzles = PuzzleService.get_random_puzzles_by_themes(
            db=db,
            themes=themes_to_practice,
            user_rating=user_rating,
            count_per_theme=3
        )
        
        # Extraemos los IDs para guardarlos en la tarea (ej: "000a9,000b1,000c3")
        puzzle_ids_str = ",".join([p.id for p in tactical_puzzles])

        # 3. Estructurar el plan de tareas
        tareas = [
            # Bloque Táctica Dinámica (vincular ejercicios reales de la BD)
            TrainingTask(
                user_id=user_id,
                category=ExerciseCategory.TACTICS,
                description=f"Resolución de tácticas sobre: {', '.join(themes_to_practice)}",
                target_count=len(tactical_puzzles),
                puzzle_ids=puzzle_ids_str  # Guarda los IDs asignados
            ),
            
            # Bloque Posicional / Estratégico
            TrainingTask(
                user_id=user_id,
                category=ExerciseCategory.STRATEGY,
                description="Analizar partidas clásicas (Capablanca/Karpov) enfocándose en estructuras de peones",
                target_count=3
            ),
            TrainingTask(
                user_id=user_id,
                category=ExerciseCategory.STRATEGY,
                description="Ejercicios de evaluación posicional diaria (identificar debilidades sin motor)",
                target_count=5
            ),
            
            # Bloque Finales y Seguridad del Rey
            TrainingTask(
                user_id=user_id,
                category=ExerciseCategory.ENDGAME,
                description="Estudio interactivo de finales básicos (Oposición y Triangulación de Rey)",
                target_count=1
            ),
            TrainingTask(
                user_id=user_id,
                category=ExerciseCategory.ENDGAME,
                description="Análisis profundo del error crítico Ke3 en tus propias partidas frente al tablero",
                target_count=1
            )
        ]

        db.add_all(tareas)
        db.commit()
        
        return tareas