# app/main.py
import logging
import os
import sys

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base  # Usamos la Base oficial de la base de datos
from app.core.middleware import GlobalExceptionMiddleware
from app.api.v1.router import api_router

logger = logging.getLogger("startup")

# 🔄 IMPORTANTE: Importamos todos los modelos para que SQLAlchemy registre sus estructuras
from app.models.user import User
from app.models.game import Game, MoveError, CoachReport
from app.models.exercise import TrainingTask, WeeklyPlan  # <-- Aseguramos las tablas de ejercicios
from app.models.puzzle import Puzzle                       # <-- Aseguramos la tabla de puzles de Lichess
from app.models.task import ProcessingTask                 # <-- Tabla de tareas de procesamiento
from app.models.gm_game import GMGame                      # <-- Tabla de partidas de GMs
from app.models.user_analyzed_gm_game import UserAnalyzedGMGame  # <-- Registro de partidas GM ya analizadas
from app.models.user_game_analysis import UserGameAnalysis  # <-- Tabla de autodiagnóstico de partidas GM
from app.models.gm_consultation import GMConsultation         # <-- Tabla de consultas (dudas) al Gran Maestro

# Crea las tablas si no existen (red de seguridad para instalaciones nuevas
# sin Alembic todavía presente). Las migraciones de Alembic son la fuente
# de verdad para evolucionar el esquema.
Base.metadata.create_all(bind=engine)


def _alembic_base_dir() -> str:
    """Ruta base donde residen alembic.ini y las migraciones.

    - Modo fuente (dev): raíz del proyecto (donde está app/).
    - Modo congelado (PyInstaller): carpeta del ejecutable, donde se empaquetan
      alembic.ini y el directorio 'alembic_migrations'.
    """
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    # app/main.py -> dos niveles arriba está la raíz del proyecto.
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def apply_database_migrations() -> None:
    """
    Aplica las migraciones de Alembic de forma programática al arrancar el
    servidor, en lugar de los ALTER TABLE manuales.

    - En una BD nueva: `upgrade head` crea todas las tablas desde cero.
    - En una BD ya en head: es un no-op.
    - En una BD previa a Alembic (tablas existentes, sin versionado): el
      `upgrade` falla al recrear tablas, así que caemos a `create_all` y
      dejamos la BD marcada en head con `stamp` para no perder datos.
    """
    try:
        from alembic import command
        from alembic.config import Config

        base = _alembic_base_dir()
        ini_path = os.path.join(base, "alembic.ini")
        cfg = Config(ini_path)
        # En modo congelado las migraciones viven en 'alembic_migrations'.
        if getattr(sys, "frozen", False):
            cfg.set_main_option(
                "script_location", os.path.join(base, "alembic_migrations")
            )
        command.upgrade(cfg, "head")
    except Exception as e:  # pragma: no cover - depende del entorno
        logger.warning(
            f"No se pudo aplicar migraciones con Alembic ({e}); "
            "se usa create_all como respaldo y se marca la BD en head."
        )
        Base.metadata.create_all(bind=engine)
        try:
            from alembic import command
            from alembic.config import Config

            base = _alembic_base_dir()
            ini_path = os.path.join(base, "alembic.ini")
            cfg = Config(ini_path)
            if getattr(sys, "frozen", False):
                cfg.set_main_option(
                    "script_location", os.path.join(base, "alembic_migrations")
                )
            command.stamp(cfg, "head")
        except Exception:
            pass


def cleanup_stuck_background_tasks() -> None:
    """
    Al arrancar el servidor, marca como fallidas las tareas que quedaron
    atascadas en estado "processing" (por un reinicio del servidor o una caída
    durante el procesamiento en segundo plano). Así se libera el estado y el
    frontend deja de hacer polling infinito.
    """
    try:
        from app.core.database import SessionLocal

        db = SessionLocal()
        try:
            message = "Procesamiento interrumpido por reinicio del servidor."
            stuck_consultations = (
                db.query(GMConsultation)
                .filter(GMConsultation.status == "processing")
                .all()
            )
            for consultation in stuck_consultations:
                consultation.status = "failed"
                consultation.error_message = message

            stuck_analyses = (
                db.query(UserGameAnalysis)
                .filter(UserGameAnalysis.status == "processing")
                .all()
            )
            for analysis in stuck_analyses:
                analysis.status = "failed"
                analysis.error_message = message

            if stuck_consultations or stuck_analyses:
                db.commit()
                logger.info(
                    "Tareas en segundo plano recuperadas tras reinicio: "
                    f"{len(stuck_consultations)} consultas y "
                    f"{len(stuck_analyses)} análisis marcados como fallidos."
                )
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"No se pudo limpiar las tareas atascadas: {e}")


def validar_secret_key() -> None:
    """
    Avisa al arrancar si SECRET_KEY no es apta para firmar JWT:
    ausente, la default de desarrollo o corta (<32 bytes). Una clave débil
    provoca InsecureKeyLengthWarning en tiempo de firma y tokens forjables.
    Cambiarla invalida todas las sesiones activas (los usuarios re-loguean).
    """
    clave = settings.SECRET_KEY or ""
    if not clave or clave == "cambia_esta_clave_en_produccion":
        logger.warning(
            "SECRET_KEY no configurada (se usa la default de desarrollo). "
            "Define una clave fuerte en el .env: "
            "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
        )
    elif len(clave.encode()) < 32:
        logger.warning(
            "SECRET_KEY demasiado corta (%d bytes < 32). Genera una más larga, "
            "p. ej.: python -c \"import secrets; print(secrets.token_urlsafe(48))\"",
            len(clave.encode()),
        )


# Aplica migraciones de Alembic al iniciar la aplicación.
apply_database_migrations()

# Ejecuta la limpieza de tareas huérfanas al iniciar la aplicación.
cleanup_stuck_background_tasks()

# Valida que SECRET_KEY sea apta para firmar JWT (solo avisa, no bloquea).
validar_secret_key()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend optimizado para el análisis de partidas de ajedrez y detección de patrones de error.",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
)

# 1. CORS — debe ir antes que otros middlewares.
# Orígenes configurables vía ALLOWED_ORIGINS (o CORS_ORIGINS) en .env (separados por coma).
# Incluye http://localhost:3000 por defecto.
cors_origins = settings.cors_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials="*" not in cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Inyectamos el middleware global de errores
app.add_middleware(GlobalExceptionMiddleware)

# 3. Registramos las rutas de la API unificadas
app.include_router(api_router, prefix=settings.API_V1_STR)

# 4. Archivos estáticos (audios de finales teóricos, etc.)
# En producción (Fly.io) STATIC_DIR apunta al volumen persistente (/data/static).
STATIC_DIR = settings.static_dir
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "audio", "endgames"), exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", tags=["Root"])
def root():
    return {
        "proyecto": settings.PROJECT_NAME,
        "fase": "Embrionaria - Núcleo de Análisis y Persistencia listo",
        "estado": "Online",
        "documentacion_interactiva": f"{settings.API_V1_STR}/docs"
    }