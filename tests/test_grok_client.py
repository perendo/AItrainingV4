"""Tests del cliente de respaldo Groq (app/services/grok_client.py).

No hacen llamadas de red reales: se parchea `httpx.Client.post`. Se centran en:
- generate_json (dict simple y con esquema Pydantic)
- generate_text (texto plano)
- clasificación de errores transitorios (429/503) vs permanentes (400)
- skip silencioso cuando no hay GROQ_API_KEY
"""
from unittest.mock import Mock, PropertyMock, patch

import httpx
import pytest
from pydantic import BaseModel

from app.core.config import settings
from app.services.grok_client import GrokClient, _es_error_transitorio


class _Usuario(BaseModel):
    nombre: str
    elo: int


def _respuesta_ok(contenido: str) -> Mock:
    """Devuelve un mock de la respuesta HTTP con ``choices[0].message.content``."""
    resp = Mock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {
        "choices": [{"message": {"content": contenido}}],
        "model": "openai/gpt-oss-120b",
    }
    return resp


def _grok_con_http(cliente_mock: Mock) -> GrokClient:
    """Crea un GrokClient con su cliente HTTP ya inyectado para no tocar la red."""
    grok = GrokClient(model_name="openai/gpt-oss-120b")
    grok._cliente_http = cliente_mock
    return grok


def test_generate_json_devuelve_dict():
    cliente = Mock()
    cliente.post.return_value = _respuesta_ok('{"nombre": "Pedro", "elo": 1700}')
    grok = _grok_con_http(cliente)
    resultado = grok.generate_json(
        "prompt",
        system_prompt="eres un GM",
        temperature=0.3,
        max_output_tokens=4096,
    )
    assert resultado == {"nombre": "Pedro", "elo": 1700}
    # Verifica el payload enviado (json_mode → response_format JSON)
    llamada = cliente.post.call_args
    payload = llamada.kwargs["json"]
    assert payload["model"] == "openai/gpt-oss-120b"
    assert payload["response_format"] == {"type": "json_object"}
    assert payload["messages"][0] == {"role": "system", "content": "eres un GM"}


def test_generate_json_valida_con_schema():
    cliente = Mock()
    cliente.post.return_value = _respuesta_ok('{"nombre": "Pedro", "elo": 1700}')
    grok = _grok_con_http(cliente)
    resultado = grok.generate_json("prompt", schema=_Usuario)
    assert isinstance(resultado, _Usuario)
    assert resultado.nombre == "Pedro"
    assert resultado.elo == 1700


def test_generate_json_error_schema_invalid():
    cliente = Mock()
    cliente.post.return_value = _respuesta_ok('{"nombre": 123}')
    grok = _grok_con_http(cliente)
    with pytest.raises(ValueError, match="no cumple el esquema"):
        grok.generate_json("prompt", schema=_Usuario)


def test_generate_text_no_json_mode():
    cliente = Mock()
    cliente.post.return_value = _respuesta_ok("  informe de ajedrez en Markdown  ")
    grok = _grok_con_http(cliente)
    texto = grok.generate_text("consulta", system_prompt="eres un GM")
    assert texto == "informe de ajedrez en Markdown"
    payload = cliente.post.call_args.kwargs["json"]
    assert "response_format" not in payload


def test_generate_text_limpia_json_fences():
    cliente = Mock()
    cliente.post.return_value = _respuesta_ok("```json\n{\"a\": 1}\n```")
    grok = _grok_con_http(cliente)
    data = grok.generate_json("prompt")
    assert data == {"a": 1}


def test_errores_transitorios_vs_permanentes():
    # 429 y 503 → transitorios
    for codigo in (429, 503):
        resp_err = httpx.Response(codigo, request=httpx.Request("POST", "/chat/completions"))
        exc = httpx.HTTPStatusError("error", request=resp_err.request, response=resp_err)
        assert _es_error_transitorio(exc) is True, f"código {codigo} debería ser transitorio"

    # 400 → permanente
    resp_400 = httpx.Response(400, request=httpx.Request("POST", "/chat/completions"))
    exc_400 = httpx.HTTPStatusError("error", request=resp_400.request, response=resp_400)
    assert _es_error_transitorio(exc_400) is False

    # timeout de red → transitorio
    assert _es_error_transitorio(httpx.TimeoutException("timeout")) is True


def test_generate_json_error_no_transitorio_relanza(monkeypatch):
    """Si el error es permanente (400), se relanza de inmediato sin reintentos."""
    cliente = Mock()
    cliente.post.side_effect = httpx.HTTPStatusError(
        "bad request",
        request=httpx.Request("POST", "/chat/completions"),
        response=httpx.Response(400, request=httpx.Request("POST", "/chat/completions")),
    )
    grok = _grok_con_http(cliente)
    with pytest.raises(httpx.HTTPStatusError):
        grok.generate_json("prompt")
    # No debe haber reintentado (una sola llamada)
    assert cliente.post.call_count == 1


def test_conectar_sin_api_key_lanza_error(monkeypatch):
    """Si GROQ_API_KEY está vacía, _conectar lanza RuntimeError claro."""
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    grok = GrokClient(model_name="openai/gpt-oss-120b")
    with pytest.raises(RuntimeError, match="GROQ_API_KEY"):
        grok._conectar()


# ------------------------------------------------------------------ #
# Integración con el failover de GeminiClient
# ------------------------------------------------------------------ #
def test_failover_gemini_a_groq(monkeypatch):
    """Si Gemini agota primario+reserva, con API key de Groq se delega en Groq."""
    from app.services.gemini_client import GeminiClient

    monkeypatch.setattr(settings, "GROQ_API_KEY", "test-groq-key")
    monkeypatch.setattr(settings, "GROQ_MODEL", "openai/gpt-oss-120b")

    grok_mock = Mock()
    grok_mock.generate_json.return_value = {"analysis": "análisis de GM"}
    grok_mock.generate_text.return_value = "texto de respaldo"

    instancia = GeminiClient(model_name="gemini-3.7-flash")
    with patch.object(GeminiClient, "model", new_callable=PropertyMock) as mock_model:
        mock_model.return_value.generate_content.side_effect = _error_503()
        with patch.object(instancia, "_obtener_grok", return_value=grok_mock):
            resultado = instancia.generate_json(
                "prompt",
                system_prompt="eres un GM",
                schema=None,
            )
    assert resultado == {"analysis": "análisis de GM"}
    grok_mock.generate_json.assert_called_once()


def test_failover_sin_api_key_groq_llega_a_error(monkeypatch):
    """Sin GROQ_API_KEY, el failover no delega en Groq y lanza GeminiSaturadoError."""
    from app.services.gemini_client import GeminiClient, GeminiSaturadoError

    monkeypatch.setattr(settings, "GROQ_API_KEY", "")

    instancia = GeminiClient(model_name="gemini-3.7-flash")
    with patch.object(GeminiClient, "model", new_callable=PropertyMock) as mock_model:
        mock_model.return_value.generate_content.side_effect = _error_503()
        with pytest.raises(GeminiSaturadoError):
            instancia.generate_json("prompt", system_prompt="eres un GM")


def _error_503():
    """Devuelve una excepción transitoria (texto con '503') para que Gemini
    reintente y agote sus intentos dentro del failover."""
    return RuntimeError("503 Service Unavailable")
