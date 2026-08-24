"""Cliente unificado para Google Gemini.

Centraliza la inicialización perezosa del modelo, la configuración de la API,
el formateo de prompts (system instruction), el manejo de timeouts y la
limpieza/validación de respuestas JSON. Evita la duplicación que existía en
``llm_coach``, ``tutor_service``, ``gm_consultation_service`` y ``gm_service``.
"""
import logging
import json
from typing import Any, Optional, Type, TypeVar

import google.generativeai as genai

from app.core.config import settings

logger = logging.getLogger("GeminiClient")

T = TypeVar("T")

DEFAULT_MODEL_NAME = "gemini-flash-latest"


class GeminiClient:
    """Wrapper delgado sobre ``google.generativeai`` reutilizable por todos los servicios."""

    def __init__(self, model_name: str = DEFAULT_MODEL_NAME):
        self.model_name = model_name
        self._model: Any = None
        self._configured = False

    # ------------------------------------------------------------------ #
    # Inicialización
    # ------------------------------------------------------------------ #
    def configure(self) -> None:
        """Configura la API una sola vez por proceso."""
        if not self._configured:
            if not settings.GEMINI_API_KEY:
                raise RuntimeError(
                    "GEMINI_API_KEY no está configurada (vacía). El backend no puede "
                    "autenticarse con Gemini y caería en credenciales por defecto (ADC), "
                    "que Gemini rechaza con 401 ACCESS_TOKEN_TYPE_UNSUPPORTED. "
                    "Define GEMINI_API_KEY en el .env del backend."
                )
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self._configured = True

    @property
    def model(self) -> Any:
        if self._model is None:
            self.configure()
            self._model = genai.GenerativeModel(self.model_name)
        return self._model

    # ------------------------------------------------------------------ #
    # Generación
    # ------------------------------------------------------------------ #
    def _generate(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        generation_config: Optional[dict] = None,
        timeout: Optional[int] = None,
    ) -> Any:
        model = self.model
        if system_prompt is not None:
            model.system_instruction = system_prompt
        response = model.generate_content(
            prompt,
            generation_config=generation_config or {},
            request_options={
                "timeout": timeout
                if timeout is not None
                else settings.GEMINI_TIMEOUT_SECONDS
            },
        )
        return response

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


gemini_client = GeminiClient()
