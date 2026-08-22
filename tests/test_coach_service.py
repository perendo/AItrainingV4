import pytest
from app.services.coach_service import CoachService
from app.models.user import User
from app.models.exercise import TrainingTask, ExerciseCategory
from app.core.security import hash_password


class TestCoachService:
    def _create_user(self, db_session):
        user = User(
            username="coach_test",
            full_name="Coach Test User",
            hashed_password=hash_password("pass123"),
            current_elo=1700,
            target_elo=2000,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    def test_asignar_plan_crea_tareas(self, db_session):
        user = self._create_user(db_session)
        CoachService.asignar_plan_entrenamiento_interactivo(db_session, user.id)
        tareas = db_session.query(TrainingTask).filter(TrainingTask.user_id == user.id).all()
        assert len(tareas) >= 1

    def test_asignar_plan_categorias_correctas(self, db_session):
        user = self._create_user(db_session)
        CoachService.asignar_plan_entrenamiento_interactivo(db_session, user.id)
        tareas = db_session.query(TrainingTask).filter(TrainingTask.user_id == user.id).all()
        categorias = {t.category for t in tareas}
        assert ExerciseCategory.STRATEGY in categorias
        assert ExerciseCategory.TACTICS in categorias
        assert ExerciseCategory.ENDGAME in categorias

    def test_asignar_plan_elimina_anteriores(self, db_session):
        user = self._create_user(db_session)
        CoachService.asignar_plan_entrenamiento_interactivo(db_session, user.id)
        CoachService.asignar_plan_entrenamiento_interactivo(db_session, user.id)
        tareas = db_session.query(TrainingTask).filter(TrainingTask.user_id == user.id).all()
        assert len(tareas) >= 1
        assert len(tareas) <= 6
