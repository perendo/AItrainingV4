import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

# Carga explícita del .env por ruta absoluta (raíz del repo), independientemente
# del directorio de trabajo del proceso (p.ej. systemd arranca con CWD distinto).
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _REPO_ROOT / ".env"
try:
    from dotenv import load_dotenv

    if _ENV_FILE.is_file():
        load_dotenv(dotenv_path=str(_ENV_FILE), override=False)
except Exception:  # pragma: no cover - dotenv es opcional pero sí está instalado
    pass

class Settings(BaseSettings):
    # Configuración para leer el archivo .env en la raíz del proyecto.
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",  # Ignora otras variables del sistema que no declaremos aquí
        case_sensitive=False,
    )

    PROJECT_NAME: str = "EntrenadorIA Backend"
    API_V1_STR: str = "/api/v1"

    # Base de Datos
    DATABASE_URL: str = Field(default="sqlite:///./entrenador_ia.db")

    # Ruta a Stockfish (Validamos que sea un string con la ruta del ejecutable)
    STOCKFISH_PATH: str = Field(default="D:\\AItrainingV4\\stockfish\\stockfish.exe")
    # ⚠️ ASEGÚRATE DE DEJARLA ASÍ: Con el ": str" obligatorio
    GEMINI_API_KEY: str = ""
    SECRET_KEY: str = "cambia_esta_clave_en_produccion"

    # Tiempo máximo (segundos) de espera por respuesta de la API de Gemini.
    # Si se supera, la tarea de fondo captura el timeout y marca la tarea como fallida.
    GEMINI_TIMEOUT_SECONDS: int = 120

    # Resiliencia ante saturación de Google (503 UNAVAILABLE / alta demanda):
    # - Modelo primario y modelo de reserva (más ligero/rápido) para failover.
    # - Esperas (segundos) entre reintentos por modelo, separadas por coma
    #   (backoff exponencial: 1s → 2s → 4s). El número de reintentos por modelo
    #   coincide con la cantidad de esperas configuradas.
    GEMINI_MODEL_PRIMARY: str = "gemini-flash-latest"
    GEMINI_MODEL_FALLBACK: str = "gemini-flash-lite-latest"
    GEMINI_RETRY_WAITS_SECONDS: str = "1,2,4"

    # Versión vigente de los textos legales (Docs/legal.md). Al cambiarla, los usuarios
    # deberán re-aceptar términos vía POST /users/me/legal-accept.
    LEGAL_VERSION: str = "2026-08-v1"

    # Orígenes permitidos por CORS, separados por coma.
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Directorio de archivos estáticos (audios de finales, etc.).
    # En producción (portátil con Docker) debe apuntar al volumen persistente, p.ej. /data/static.
    STATIC_DIR: str = ""

    @property
    def gemini_retry_waits_list(self) -> list:
        """Esperas de backoff (segundos) parseadas de GEMINI_RETRY_WAITS_SECONDS."""
        waits = [float(x) for x in self.GEMINI_RETRY_WAITS_SECONDS.split(",") if x.strip()]
        return waits or [1.0, 2.0, 4.0]

    @property
    def cors_origins_list(self) -> list:
        raw = self.ALLOWED_ORIGINS or self.CORS_ORIGINS or "http://localhost:3000"
        origins = [o.strip() for o in raw.split(",") if o.strip()]
        if "http://localhost:3000" not in origins and "*" not in origins:
            origins.append("http://localhost:3000")
        return origins

    @property
    def static_dir(self) -> str:
        if self.STATIC_DIR:
            return self.STATIC_DIR
        # Por defecto: <raíz_del_proyecto>/static
        root = Path(__file__).resolve().parent.parent.parent
        return str(root / "static")

# Instancia global para importar en cualquier parte del proyecto
settings = Settings()
