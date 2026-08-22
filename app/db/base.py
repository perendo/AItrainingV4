# app/db/base.py
from app.core.database import Base

# Importar todos los modelos para asegurar que sean registrados en Base.metadata
from app.models.user import User  # noqa: F401
from app.models.game import Game, MoveError, CoachReport  # noqa: F401
from app.models.exercise import TrainingTask, WeeklyPlan  # noqa: F401
from app.models.puzzle import Puzzle  # noqa: F401
from app.models.task import ProcessingTask  # noqa: F401
from app.models.gm_game import GMGame  # noqa: F401
from app.models.user_analyzed_gm_game import UserAnalyzedGMGame  # noqa: F401
from app.models.user_game_analysis import UserGameAnalysis  # noqa: F401
from app.models.gm_consultation import GMConsultation  # noqa: F401
from app.models.endgame import EndgameLesson, EndgameTimelineEvent, UserEndgameProgress  # noqa: F401
