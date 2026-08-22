"""
Script de diagnóstico para probar la conexión con Gemini API.

Uso:
- Como script independiente: python tests/test_gemini_connection.py
- Como test de pytest: solo verifica que la API key está configurada
  (no hace llamadas de red dentro de la suite para no ralentizarla).
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core.config import settings
from google import genai
from google.genai import types


def _test_gemini():
    api_key = settings.GEMINI_API_KEY
    print(f"API Key loaded: {api_key[:15]}...")
    print(f"API Key length: {len(api_key)}")
    
    if not api_key or api_key == "":
        print("❌ ERROR: GEMINI_API_KEY está vacía en .env")
        return False
    
    client = genai.Client(api_key=api_key)
    
    try:
        print("⏳ Probando conexión con Gemini API (modelo: gemini-flash-latest)...")
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents="Responde SOLO con un JSON: {\"test\": true, \"message\": \"Conexion exitosa\"}",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
            )
        )
        print(f"✅ Respuesta recibida:")
        print(f"   Texto: {response.text}")
        print(f"\n🎉 Gemini API funciona correctamente!")
        return True
    except Exception as e:
        print(f"❌ ERROR al conectar con Gemini: {type(e).__name__}")
        print(f"   Detalle: {e}")
        return False


def _test_gm_game_prompt():
    """Test específico del prompt que usa gm_service.py"""
    api_key = settings.GEMINI_API_KEY
    client = genai.Client(api_key=api_key)
    
    prompt = """
    Actúa como un Gran Maestro de ajedrez e historiador.
    Genera una lista de las 2 partidas más famosas, emblemáticas e instruidas del Gran Maestro Capablanca.
    
    Debes devolver UNICAMENTE un JSON que cumpla estrictamente con la estructura de una lista de objetos.
    Cada objeto debe tener los campos: "gm_name", "white", "black", "event", "year", "result", "pgn", "theme_tags".
    El campo "year" debe ser un número entero. No incluyas comentarios en el JSON ni bloques de formato markdown.
    """
    
    try:
        print("\n⏳ Probando prompt específico de GM games...")
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
            )
        )
        print(f"✅ Respuesta de Gemini para GM prompt:")
        print(f"   {response.text[:500]}...")
        return True
    except Exception as e:
        print(f"❌ ERROR en prompt GM: {type(e).__name__}")
        print(f"   Detalle: {e}")
        return False


def test_gemini_api_key_configurada():
    """Test de pytest: verifica que la API key existe sin llamar a la red."""
    assert settings.GEMINI_API_KEY, "GEMINI_API_KEY está vacía en .env"


if __name__ == "__main__":
    print("=" * 60)
    print("🔍 DIAGNÓSTICO DE CONEXIÓN GEMINI API")
    print("=" * 60)
    
    success = _test_gemini()
    if success:
        _test_gm_game_prompt()
    
    print("\n" + "=" * 60)
    if success:
        print("✅ Gemini API está operativa")
    else:
        print("❌ Gemini API NO funciona - Revisa la API key o la configuración")
    print("=" * 60)
