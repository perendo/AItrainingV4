import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
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

    # Configuración para leer el archivo .env en la raíz del proyecto
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore" # Ignora otras variables del sistema que no declaremos aquí
    )

    # Orígenes permitidos por CORS, separados por coma.
    # Por defecto: los dos orígenes locales del frontend de desarrollo.
    # Usar "*" desactiva la restricción de origen (solo para dev; deshabilita credenciales).
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origins_list(self) -> list:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

# Instancia global para importar en cualquier parte del proyecto
settings = Settings()