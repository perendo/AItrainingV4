# app/services/coach_service.py
from sqlalchemy.orm import Session
from app.models.exercise import TrainingTask, ExerciseCategory

def asignar_plan_entrenamiento_interactivo(db: Session, user_id: int):
    # Eliminamos tareas anteriores sin completar para no acumularle trabajo
    db.query(TrainingTask).filter(TrainingTask.user_id == user_id, TrainingTask.is_completed == False).delete()

    tareas = [
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
            description="Ejercicios de Evaluación Posicional diaria (identificar debilidades sin motor)",
            target_count=5  # 5 posiciones al día
        ),
        
        # Bloque Táctica / Capturas
        TrainingTask(
            user_id=user_id,
            category=ExerciseCategory.TACTICS,
            description="Resolución de tácticas enfocadas en Capturas y Ataques Dobles",
            target_count=1  # Representa la sesión diaria de 45 mins
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