# app/main.py
import logging
import os
import sys
import threading
from datetime import datetime, timedelta

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


def _lanzar_hilo_daemon(target, *args) -> None:
    """Lanza una tarea de fondo fuera del ciclo de vida del request (reinicio)."""
    threading.Thread(target=target, args=args, daemon=True).start()


def cleanup_stuck_background_tasks() -> None:
    """
    Al arrancar el servidor, recupera las tareas que quedaron atascadas en
    estado "processing" (por un reinicio del servidor o una caída durante el
    procesamiento en segundo plano):

    - Si estaban a mitad de los reintentos ante saturación de la IA (quedan
      intentos disponibles y se actualizaron hace poco), se relanzan en un hilo
      de fondo para no perder la auditoría: el borrador y sus datos ya están
      persistidos.
    - En caso contrario se marcan como fallidas para liberar el estado y que
      el frontend deje de hacer polling infinito; el usuario puede reenviarlas
      manualmente desde el histórico.
    """
    from app.core.database import SessionLocal
    from app.services.gm_consultation_service import gm_consultation_service
    from app.services.tutor_service import tutor_gemini_service

    ventana_relanzamiento = datetime.utcnow() - timedelta(minutes=30)
    max_intentos = max(1, settings.GEMINI_TASK_RETRIES)
    relanzadas = 0
    fallidas = 0
    try:
        db = SessionLocal()
        try:
            message = "Procesamiento interrumpido por reinicio del servidor."

            stuck_consultations = (
                db.query(GMConsultation)
                .filter(GMConsultation.status == "processing")
                .all()
            )
            for consultation in stuck_consultations:
                reciente = bool(
                    consultation.updated_at
                    and consultation.updated_at >= ventana_relanzamiento
                )
                if reciente and consultation.attempts < max_intentos:
                    # Relanzar con la pregunta persistida (hilo daemon: si el
                    # arranque vuelve a caer, el siguiente inicio reintenta igual).
                    _lanzar_hilo_daemon(
                        gm_consultation_service.process_consultation,
                        consultation.id,
                        consultation.user_id,
                        consultation.question,
                    )
                    relanzadas += 1
                    continue
                consultation.status = "failed"
                if not consultation.error_message or "Reintentando" in consultation.error_message:
                    consultation.error_message = message
                fallidas += 1

            stuck_analyses = (
                db.query(UserGameAnalysis)
                .filter(UserGameAnalysis.status == "processing")
                .all()
            )
            for analysis in stuck_analyses:
                data = _reconstruir_analysis_data(analysis)
                reciente = bool(
                    analysis.updated_at and analysis.updated_at >= ventana_relanzamiento
                )
                if data is not None and reciente and analysis.audit_attempts < max_intentos:
                    _lanzar_hilo_daemon(
                        tutor_gemini_service.audit_existing_analysis,
                        analysis.id,
                        analysis.user_id,
                        data,
                    )
                    relanzadas += 1
                    continue
                analysis.status = "failed"
                if not analysis.error_message or "Reintentando" in analysis.error_message:
                    analysis.error_message = message
                fallidas += 1

            if stuck_consultations or stuck_analyses:
                db.commit()
                logger.info(
                    "Tareas en segundo plano recuperadas tras reinicio: "
                    f"{relanzadas} relanzadas (reintentos de IA) y "
                    f"{fallidas} marcadas como fallidas."
                )
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"No se pudo limpiar las tareas atascadas: {e}")


def _reconstruir_analysis_data(analysis: "UserGameAnalysis"):
    """Reconstruye el GameAnalysisCreate guardado con el envío (audit_payload).

    Devuelve None si no hay snapshot utilizable (registros antiguos o corruptos),
    en cuyo caso la tarea se marca como fallida en lugar de relanzarse a ciegas.
    """
    from app.schemas.analysis import GameAnalysisCreate

    raw = getattr(analysis, "audit_payload", None)
    if not raw:
        return None
    try:
        return GameAnalysisCreate.model_validate_json(raw)
    except Exception as e:
        logger.warning(
            f"Autodiagnóstico #{analysis.id}: snapshot no recuperable ({e}); se marca como fallido."
        )
        return None


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

# 2b. Logging de peticiones (debug): registra method, path y status en el journal.
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        if request.url.path.startswith(f"{settings.API_V1_STR}"):
            print(
                f"[REQLOG] {request.method} {request.url.path} -> {response.status_code} "
                f"({round((time.time() - start) * 1000)} ms)",
                flush=True,
            )
        return response

app.add_middleware(RequestLogMiddleware)

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