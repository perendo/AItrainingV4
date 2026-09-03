"""Cliente para Groq (xAI) como proveedor de respaldo.

Usado como ÚLTIMO escalón del failover: si Gemini (primario + reserva) se agota
por saturación (503/429), se intenta Groq con Llama 3.3 70B (gratuito) antes de
levantar :class:`GeminiSaturadoError`. Si ``GROQ_API_KEY`` está vacía, Groq se
omite silenciosamente.

La API de Groq es compatible con el formato OpenAI (``/chat/completions``), así
que se llama con ``httpx`` directamente (ya instalado), sin dependencias nuevas.
"""
import json
import logging
from typing import Any, Optional, Type, TypeVar, cast

import httpx

from app.core.config import settings

logger = logging.getLogger("GrokClient")

T = TypeVar("T")

GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Marcadores textuales de indisponibilidad transitoria (429/503/alta demanda).
_MARCAS_TRANSITORIAS = (
    "429",
    "503",
    "rate limit",
    "ratelimit",
    "overloaded",
    "unavailable",
    "temporarily",
    "try again",
    "too many requests",
)


def _es_error_transitorio(exc: Exception) -> bool:
    """True si el fallo es de sobrecarga/servidor (merece reintento o propagar).

    Comprueba códigos HTTP de ``httpx.HTTPStatusError`` y, como red de seguridad,
    el texto del error por si el proveedor lo envuelve distinto.
    """
    if isinstance(exc, httpx.HTTPStatusError):
        codigo = exc.response.status_code
        if codigo in (429, 503):
            return True
        return False
    if isinstance(exc, httpx.TimeoutException):
        return True
    texto = f"{type(exc).__name__}: {exc}".lower()
    return any(marca in texto for marca in _MARCAS_TRANSITORIAS)


class GrokClient:
    """Wrapper delgado sobre la API de Groq (formato OpenAI-compatible)."""

    def __init__(self, model_name: Optional[str] = None):
        self.model_name = model_name or settings.GROQ_MODEL
        self._cliente_http: Optional[httpx.Client] = None

    # ------------------------------------------------------------------ #
    # Inicialización
    # ------------------------------------------------------------------ #
    def _conectar(self) -> httpx.Client:
        """Crea el cliente HTTP una sola vez por proceso (lazy)."""
        if self._cliente_http is None:
            if not settings.GROQ_API_KEY:
                raise RuntimeError(
                    "GROQ_API_KEY no está configurada. Define la API key en el "
                    ".env del backend para activar el proveedor de respaldo Groq."
                )
            self._cliente_http = httpx.Client(
                base_url=GROQ_BASE_URL,
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                timeout=settings.GROQ_TIMEOUT_SECONDS,
            )
        return self._cliente_http

    @property
    def cliente(self) -> httpx.Client:
        return self._conectar()

    # ------------------------------------------------------------------ #
    # Limpieza y validación de respuestas
    # ------------------------------------------------------------------ #
    @staticmethod
    def _clean_json_text(text: str) -> str:
        """Elimina fences Markdown (```json) que a veces envuelven el JSON."""
        cleaned = text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        return cleaned.strip()

    def _parsear_json(self, text: str, schema: Optional[Type[T]]) -> Any:
        """Limpia, parsea el JSON y valida contra ``schema`` (Pydantic) si se provee."""
        from pydantic import ValidationError

        if not text or not text.strip():
            raise ValueError("La API de Groq devolvió una respuesta vacía.")

        cleaned = self._clean_json_text(text)
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.error("JSON de Groq inválido o truncado (pos=%s). Texto: %r", e.pos, cleaned[:2000])
            raise ValueError(
                f"El JSON llegó truncado o inválido (posición {e.pos}). "
                f"Texto crudo (inicio): {cleaned[:300]!r}"
            ) from e

        if schema is None:
            return data
        try:
            return schema(**data)
        except ValidationError as e:
            logger.error("El JSON no cumple el esquema %s: %s", schema.__name__, e)
            raise ValueError(f"La respuesta no cumple el esquema esperado: {e}") from e

    # ------------------------------------------------------------------ #
    # Llamadas HTTP
    # ------------------------------------------------------------------ #
    def _chat_completions(
        self,
        *,
        prompt: str,
        system_prompt: Optional[str],
        temperature: float,
        max_output_tokens: int,
        json_mode: bool,
    ) -> str:
        """Realiza una llamada a ``/chat/completions`` y devuelve el texto de la respuesta.

        Lanza ``httpx.HTTPStatusError`` para errores 4xx/5xx (el llamador decide
        si es transitorio o no). Devuelve el ``content`` de la primera elección.
        """
        mensajes: list[dict] = []
        if system_prompt is not None:
            mensajes.append({"role": "system", "content": system_prompt})
        mensajes.append({"role": "user", "content": prompt})

        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": mensajes,
            "temperature": temperature,
            "max_tokens": max_output_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        resp = self.cliente.post("/chat/completions", json=payload)
        resp.raise_for_status()

        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as e:
            raise ValueError(
                f"Respuesta de Groq inesperada: no se encontró choices[0].message.content. "
                f"Texto: {data!r}"
            ) from e

    # ------------------------------------------------------------------ #
    # API pública de generación
    # ------------------------------------------------------------------ #
    def generate_json(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        schema: Optional[Type[Any]] = None,
        temperature: float = 0.3,
        max_output_tokens: int = 4096,
        timeout: Optional[int] = None,  # sin uso; se usa el timeout del cliente
    ) -> Any:
        """Genera contenido en JSON y devuelve el dict (o el modelo Pydantic validado)."""
        texto = self._chat_completions(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            json_mode=True,
        )
        return self._parsear_json(texto, schema)

    def generate_text(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        temperature: float = 0.5,
        max_output_tokens: int = 2048,
        timeout: Optional[int] = None,  # sin uso; se usa el timeout del cliente
    ) -> str:
        """Genera texto libre (Markdown) y devuelve el string ya limpio."""
        texto = self._chat_completions(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            json_mode=False,
        )
        return (texto or "").strip()