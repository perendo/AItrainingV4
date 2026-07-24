# app/models/exercise.py
import enum
from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Enum, Date
from sqlalchemy.orm import relationship
from app.models.base import TimeStampedModel


# 1. Declaramos el Enum
class ExerciseCategory(str, enum.Enum):
    STRATEGY = "Estrategia y Posicional"
    TACTICS = "Táctica y Capturas"
    ENDGAME = "Seguridad del Rey y Finales"


# 2. Declaramos el modelo TrainingTask primero (o WeeklyPlan, SQLAlchemy lo resuelve bien)
class TrainingTask(TimeStampedModel):
    __tablename__ = "training_tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False)
    category = Column(Enum(ExerciseCategory), nullable=False)
    description = Column(String(255), nullable=False)
    target_count = Column(Integer, default=1)
    current_count = Column(Integer, default=0)
    is_completed = Column(Boolean, default=False)    
    
    # Relación con el usuario
    user = relationship("User", back_populates="training_tasks")
    
    # Clave foránea hacia el plan semanal
    # 💡 Cambiado ondelete a "CASCADE" para alinearlo con el cascade de WeeklyPlan
    weekly_plan_id = Column(Integer, ForeignKey("weekly_plans.id", ondelete="CASCADE"), nullable=True)
    
    # Relación inversa con el plan semanal
    weekly_plan = relationship("WeeklyPlan", back_populates="tasks")


# 3. Declaramos el modelo WeeklyPlan
class WeeklyPlan(TimeStampedModel):
    __tablename__ = "weekly_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Rango de fechas que cubre esta semana de entrenamiento
    start_date = Column(Date, nullable=False)  # Normalmente el lunes
    end_date = Column(Date, nullable=False)    # Normalmente el domingo
    
    # Nos permite saber cuál es la semana en curso
    is_active = Column(Boolean, default=True, nullable=False)

    # Relaciones
    user = relationship("User", back_populates="weekly_plans")
    
    # Al borrar un plan semanal, eliminamos también todas sus tareas asociadas
    tasks = relationship("TrainingTask", back_populates="weekly_plan", cascade="all, delete-orphan")

    @property
    def compliance_rate(self) -> float:
        """
        Calcula dinámicamente el % de éxito de la semana.
        Ejemplo: Si tienes 3 tareas y completas 1, devuelve 33.33
        """
        if not self.tasks:
            return 0.0
        completed_tasks = sum(1 for task in self.tasks if task.is_completed)
        return round((completed_tasks / len(self.tasks)) * 100, 2)