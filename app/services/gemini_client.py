"""Cliente unificado para Google Gemini.

Centraliza la inicialización perezosa del modelo, la configuración de la API,
el formateo de prompts (system instruction), el manejo de timeouts y la
limpieza/validación de respuestas JSON. Evita la duplicación que existía en
``llm_coach``, ``tutor_service``, ``gm_consultation_service`` y ``gm_service``.

Resiliencia ante saturación de Google (503 UNAVAILABLE / alta demanda):
- Reintentos automáticos con backoff exponencial configurable
  (por defecto 1s → 2s → 4s) para cada modelo.
- Failover automático al modelo de reserva (más ligero) cuando el primario
  sigue saturado tras agotar sus reintentos.
- Si ambos modelos fallan se lanza :class:`GeminiSaturadoError`, que la capa
  HTTP traduce en una respuesta 503 con mensaje amigable para el usuario.

Nota sobre concurrencia: el backend es síncrono (FastAPI ejecuta endpoints
``def`` y tareas de fondo en el threadpool), por lo que ``time.sleep`` entre
reintentos NO bloquea el event loop.
"""
import logging
import json
import time
from typing import Any, List, Optional, Tuple, Type, TypeVar

from google import genai
from google.genai import types
from google.genai import errors as genai_errors

try:  # google-api-core llega como dependencia transitiva; se defiende su ausencia.
    from google.api_core.exceptions import ServiceUnavailable as _ApiCoreUnavailable
except ImportError:  # pragma: no cover
    _ApiCoreUnavailable = None

from app.core.config import settings

logger = logging.getLogger("GeminiClient")

T = TypeVar("T")

DEFAULT_MODEL_NAME = "gemini-3.7-flash"

MENSAJE_SATURACION = (
    "El Entrenador IA se encuentra saturado momentáneamente. "
    "Por favor, reinténtalo en unos segundos."
)


class GeminiSaturadoError(RuntimeError):
    """Primario y reserva agotados por indisponibilidad de Google (503/alta demanda)."""

    def __init__(self, mensaje: str = MENSAJE_SATURACION):
        super().__init__(mensaje)


# Marcadores textuales de indisponibilidad, por si el SDK envuelve el fallo en
# una excepción genérica sin código tipado (p.ej. a través de httpx).
_MARCAS_TRANSITORIAS = (
    "503",
    "unavailable",
    "high demand",
    "overloaded",
    "overload",
    "resource_exhausted",
    "429",
)


class GeminiClient:
    """Wrapper delgado sobre ``google.genai`` reutilizable por todos los servicios."""

    def __init__(self, model_name: str = DEFAULT_MODEL_NAME):
        self.model_name = model_name
        self._client: Optional[genai.Client] = None

    # ------------------------------------------------------------------ #
    # Inicialización
    # ------------------------------------------------------------------ #
    def configure(self) -> None:
        """Configura el cliente una sola vez por proceso."""
        if self._client is None:
            if not settings.GEMINI_API_KEY:
                raise RuntimeError(
                    "GEMINI_API_KEY no está configurada (vacía). El backend no puede "
                    "autenticarse con Gemini y caería en credenciales por defecto (ADC), "
                    "que Gemini rechaza con 401 ACCESS_TOKEN_TYPE_UNSUPPORTED. "
                    "Define GEMINI_API_KEY en el .env del backend."
                )
            self._client = genai.Client(api_key=settings.GEMINI_API_KEY)

    @property
    def client(self) -> genai.Client:
        if self._client is None:
            self.configure()
        return self._client

    @property
    def model(self) -> Any:
        """Wrapper para mantener compatibilidad con los tests que parchean
        ``GeminiClient.model``. En producción delega en el cliente nuevo."""
        return _GeminiModel(self)

    # ------------------------------------------------------------------ #
    # Generación (con reintentos y failover)
    # ------------------------------------------------------------------ #
    @staticmethod
    def _es_error_transitorio(exc: Exception) -> bool:
        """True si el fallo es de sobrecarga/servidor: tiene sentido reintentar
        o conmutar al modelo de reserva. Los 4xx reales (payload, credenciales)
        fallan rápido sin reintentos."""
        if isinstance(exc, genai_errors.ServerError):  # 5xx tipados del SDK nuevo
            return True
        if _ApiCoreUnavailable is not None and isinstance(exc, _ApiCoreUnavailable):
            return True
        if isinstance(exc, genai_errors.ClientError):
            # Solo 429 (RESOURCE_EXHAUSTED) es transitorio; resto de 4xx no.
            return getattr(exc, "code", None) == 429
        texto = f"{type(exc).__name__}: {exc}".lower()
        return any(marca in texto for marca in _MARCAS_TRANSITORIAS)

    def _cadena_de_modelos(self) -> List[str]:
        """Modelos a probar en orden: primario y, si difiere, el de reserva."""
        modelos = [self.model_name or settings.GEMINI_MODEL_PRIMARY]
        reserva = settings.GEMINI_MODEL_FALLBACK
        if reserva and reserva not in modelos:
            modelos.append(reserva)
        return modelos

    def _intentar_modelo(
        self, nombre_modelo: str, prompt: str, config: types.GenerateContentConfig
    ) -> Tuple[Optional[Any], Optional[Exception]]:
        """Llama a un modelo reintentando con backoff exponencial si hay sobrecarga.

        Devuelve ``(respuesta, None)`` en caso de éxito o ``(None, ultimo_error)``
        si se agotaron los intentos por errores transitorios. Los errores no
        transitorios se relanzan inmediatamente.
        """
        esperas = settings.gemini_retry_waits_list  # p. ej. [1.0, 2.0, 4.0]
        total_intentos = len(esperas) + 1  # intento inicial + N reintentos
        ultimo_error: Optional[Exception] = None

        for intento in range(1, total_intentos + 1):
            if intento > 1:
                espera = esperas[min(intento - 2, len(esperas) - 1)]
                logger.warning(
                    "Gemini: %s saturado (%s). Reintento %d/%d en %.0fs...",
                    nombre_modelo,
                    ultimo_error,
                    intento,
                    total_intentos,
                    espera,
                )
                time.sleep(espera)
            try:
                respuesta = self.model.generate_content(
                    prompt, config=config, model_name=nombre_modelo
                )
                if intento > 1:
                    logger.info(
                        "Gemini: %s respondió en el intento %d/%d.",
                        nombre_modelo,
                        intento,
                        total_intentos,
                    )
                return respuesta, None
            except Exception as exc:  # noqa: BLE001 - se clasifica abajo
                if not self._es_error_transitorio(exc):
                    raise  # error permanente: reintentar o conmutar no ayuda
                ultimo_error = exc

        logger.error(
            "Gemini: modelo %s agotó sus %d intentos por indisponibilidad.",
            nombre_modelo,
            total_intentos,
        )
        return None, ultimo_error

    def _generar_con_failover(
        self, prompt: str, config: types.GenerateContentConfig
    ) -> Any:
        """Prueba el modelo primario y, si sigue saturado, conmuta al de reserva."""
        ultimo_error: Optional[Exception] = None
        for nombre_modelo in self._cadena_de_modelos():
            respuesta, ultimo_error = self._intentar_modelo(nombre_modelo, prompt, config)
            if respuesta is not None:
                return respuesta
            logger.warning(
                "Gemini: conmutando del modelo %s al modelo de reserva...",
                nombre_modelo,
            )
        logger.error("Gemini: primario y reserva saturados. Se informa al cliente.")
        raise GeminiSaturadoError() from ultimo_error

    def _generate(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        generation_config: Optional[dict] = None,
        timeout: Optional[int] = None,
    ) -> Any:
        config = self._construir_config(system_prompt, generation_config, timeout)
        return self._generar_con_failover(prompt, config)

    def _construir_config(
        self,
        system_prompt: Optional[str],
        generation_config: Optional[dict],
        timeout: Optional[int],
    ) -> types.GenerateContentConfig:
        generation_config = generation_config or {}
        config = types.GenerateContentConfig()

        if system_prompt is not None:
            config.system_instruction = system_prompt
        if generation_config.get("temperature") is not None:
            config.temperature = generation_config["temperature"]
        if generation_config.get("max_output_tokens") is not None:
            config.max_output_tokens = generation_config["max_output_tokens"]
        if generation_config.get("response_mime_type") is not None:
            config.response_mime_type = generation_config["response_mime_type"]
        gemini_schema = generation_config.get("response_schema")
        if gemini_schema is not None and gemini_schema is not False:
            config.response_schema = gemini_schema

        timeout = timeout if timeout is not None else settings.GEMINI_TIMEOUT_SECONDS
        # google.genai espera HttpOptions.timeout en MILISEGUNDOS
        config.http_options = types.HttpOptions(timeout=timeout * 1000)
        return config

    # ------------------------------------------------------------------ #
    # API pública de generación
    # ------------------------------------------------------------------ #
    def generate_json(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        schema: Optional[Type[Any]] = None,
        response_schema: Optional[Any] = None,
        temperature: float = 0.3,
        max_output_tokens: int = 4096,
        timeout: Optional[int] = None,
    ) -> Any:
        """Genera contenido pidiendo JSON y devuelve el dict (o el modelo Pydantic validado).

        ``response_schema`` es el esquema que se envía a Gemini (puede ser más
        permisivo que ``schema``, que se usa para validar la respuesta localmente).
        """
        generation_config: dict = {
            "response_mime_type": "application/json",
            "temperature": temperature,
            "max_output_tokens": max_output_tokens,
        }
        gemini_schema = response_schema if response_schema is not None else schema
        if gemini_schema is not None and gemini_schema is not False:
            generation_config["response_schema"] = gemini_schema
        response = self._generate(
            prompt,
            system_prompt=system_prompt,
            generation_config=generation_config,
            timeout=timeout,
        )
        return self.parse_json_response(response, schema)

    def generate_text(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        temperature: float = 0.5,
        max_output_tokens: int = 2048,
        timeout: Optional[int] = None,
    ) -> str:
        """Genera texto libre (Markdown) y devuelve el string ya limpio."""
        generation_config = {
            "temperature": temperature,
            "max_output_tokens": max_output_tokens,
        }
        response = self._generate(
            prompt,
            system_prompt=system_prompt,
            generation_config=generation_config,
            timeout=timeout,
        )
        return (response.text or "").strip()

    # ------------------------------------------------------------------ #
    # Limpieza y validación de respuestas
    # ------------------------------------------------------------------ #
    @staticmethod
    def _clean_json_text(text: str) -> str:
        cleaned = text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        return cleaned.strip()

    def parse_json_response(self, response: Any, schema: Optional[Type[T]] = None) -> Any:
        """Limpia fences Markdown, parsea el JSON y valida contra ``schema`` si se provee."""
        from pydantic import ValidationError

        response_text = response.text
        if not response_text:
            raise ValueError("La API de Gemini devolvió una respuesta vacía.")

        finish_reason = None
        try:
            finish_reason = response.candidates[0].finish_reason
        except (AttributeError, IndexError, TypeError):
            pass

        cleaned_text = self._clean_json_text(response_text)

        try:
            data = json.loads(cleaned_text)
        except json.JSONDecodeError as e:
            logger.error(
                "JSON de Gemini inválido o truncado (finish_reason=%s, pos=%s). "
                "Texto crudo: %r",
                finish_reason,
                e.pos,
                cleaned_text[:2000],
            )
            raise ValueError(
                f"El JSON llegó truncado o inválido (finish_reason={finish_reason}, "
                f"posición {e.pos}). Texto crudo (inicio): {cleaned_text[:300]!r}"
            ) from e

        if schema is None:
            return data

        try:
            return schema(**data)
        except ValidationError as e:
            logger.error(
                "El JSON no cumple el esquema %s: %s. Texto crudo: %r",
                schema.__name__,
                e,
                cleaned_text[:2000],
            )
            raise ValueError(
                f"La respuesta no cumple el esquema esperado: {e}"
            ) from e


class _GeminiModel:
    """Adaptador mínimo que enruta ``generate_content`` al cliente ``google.genai``."""

    def __init__(self, wrapper: "GeminiClient"):
        self._wrapper = wrapper

    def generate_content(
        self, prompt: str, config: Any = None, model_name: Optional[str] = None
    ) -> Any:
        return self._wrapper.client.models.generate_content(
            model=model_name or self._wrapper.model_name,
            contents=prompt,
            config=config,
        )


gemini_client = GeminiClient(model_name=settings.GEMINI_MODEL_PRIMARY)
