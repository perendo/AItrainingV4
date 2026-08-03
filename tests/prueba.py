import os
from google import genai

api_key = os.getenv("GEMINI_API_KEY", "AQ.Ab8RN6LyOo1zjAAuCYCEnCgmmCEE_H8-mk3268j0wK1uNL1hOg")
client = genai.Client(api_key=api_key)

try:
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents="Responde únicamente: ¡El Entrenador IA está listo!",
    )
    print("Respuesta de Gemini:", response.text)
except Exception as e:
    print("Error al conectar:", e)