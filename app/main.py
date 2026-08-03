# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base  # Usamos la Base oficial de la base de datos
from app.core.middleware import GlobalExceptionMiddleware
from app.api.v1.router import api_router

# 🔄 IMPORTANTE: Importamos todos los modelos para que SQLAlchemy registre sus estructuras
from app.models.user import User
from app.models.game import Game, MoveError, CoachReport
from app.models.exercise import TrainingTask, WeeklyPlan  # <-- Aseguramos las tablas de ejercicios
from app.models.puzzle import Puzzle                       # <-- Aseguramos la tabla de puzles de Lichess
from app.models.task import ProcessingTask                 # <-- Tabla de tareas de procesamiento
from app.models.gm_game import GMGame                      # <-- Tabla de partidas de GMs
from app.models.user_analyzed_gm_game import UserAnalyzedGMGame  # <-- Registro de partidas GM ya analizadas
from app.models.user_game_analysis import UserGameAnalysis  # <-- Tabla de autodiagnóstico de partidas GM

# Inicialización física de todas las tablas de la base de datos en SQLite
Base.metadata.create_all(bind=engine)

# Migración ligera: añadir columna a tablas existentes en SQLite si falta
try:
    from app.core.database import engine as _eng
    with _eng.connect() as _conn:
        _conn.execute(__import__("sqlalchemy").text(
            "ALTER TABLE users ADD COLUMN current_assigned_gm_game_id VARCHAR(36)"
        ))
        _conn.commit()
except Exception:
    pass  # Columna ya existe o DB no es SQLite

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend optimizado para el análisis de partidas de ajedrez y detección de patrones de error.",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# 1. CORS — debe ir antes que otros middlewares
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Inyectamos el middleware global de errores
app.add_middleware(GlobalExceptionMiddleware)

# 3. Registramos las rutas de la API unificadas
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Root"])
def root():
    return {
        "proyecto": settings.PROJECT_NAME,
        "fase": "Embrionaria - Núcleo de Análisis y Persistencia listo",
        "estado": "Online",
        "documentacion_interactiva": f"{settings.API_V1_STR}/docs"
    }