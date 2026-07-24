# app/services/llm_coach.py
import logging
import json
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from pydantic import ValidationError

from google import genai
from google.genai import types

from app.core.config import settings
from app.repositories.user_repo import user_repo
from app.repositories.game_repo import game_repo
from app.models.game import CoachReport
from app.schemas.coach import CoachReportJSON # Esquema Pydantic para validar el JSON

logger = logging.getLogger("EntrenadorIA")

class LLMCoachService:
    def __init__(self):
        # Inicialización del nuevo cliente de Google GenAI
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self.model_name = "gemini-2.5-flash"

    def generate_diagnostic(self, db: Session, user_id: int) -> CoachReport:
        user = user_repo.get(db, id=user_id)
        if not user:
            raise ValueError("Usuario no encontrado.")

        games = game_repo.get_user_games_with_errors(db, user_id=user_id)
        if not games:
            raise ValueError("Aún no tienes partidas analizadas. Sube algunos archivos PGN para obtener tu diagnóstico.")

        data_summary = self._prepare_data_summary(games)
        system_prompt = self._get_system_prompt(user.full_name or "jugador")
        user_prompt = f"""Aquí está el registro de mis errores en partidas recientes:

{json.dumps(data_summary, indent=2)}

Por favor, genera mi diagnóstico de juego en el formato JSON solicitado."""

        try:
            logger.info(f"Enviando {len(data_summary)} partidas a Gemini ({self.model_name}) para diagnóstico JSON...")

            response = self.client.models.generate_content(
                model=self.model_name,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    response_mime_type="application/json",
                    temperature=0.4,
                ),
            )

            # Parsear y validar la respuesta JSON con Pydantic
            report_data = self._parse_and_validate_response(response)

            # Crear y guardar el informe en la base de datos
            nuevo_informe = CoachReport(
                user_id=user_id,
                estimated_level=report_data.estimated_level,
                strengths=report_data.strengths,
                weaknesses=report_data.weaknesses,
                report_markdown=report_data.report_markdown,
            )

            db.add(nuevo_informe)
            db.commit()
            db.refresh(nuevo_informe)

            logger.info(f"Informe estructurado #{nuevo_informe.id} guardado con éxito.")
            return nuevo_informe

        except (ValidationError, json.JSONDecodeError) as e:
            db.rollback()
            logger.error(f"Error de validación o parseo en la respuesta de Gemini: {e}")
            raise ValueError(f"La respuesta del entrenador no tuvo el formato JSON esperado. Detalles: {e}")
        except Exception as e:
            db.rollback()
            logger.error(f"Error inesperado al generar diagnóstico: {e}")
            raise e

    def _prepare_data_summary(self, games: list) -> List[Dict[str, Any]]:
        data_summary = []
        for idx, game in enumerate(games, start=1):
            if not game.errors:
                continue
            game_summary = {
                "id_partida": f"#{idx}",
                "fecha": str(game.game_date),
                "blancas": game.white_player,
                "negras": game.black_player,
                "resultado_usuario": "Ganó" if (game.result == "1-0" and game.player_color == "white") or (game.result == "0-1" and game.player_color == "black") else ("Tablas" if game.result == "1/2-1/2" else "Perdió"),
                "errores_criticos": [
                    {
                        "jugada": err.move_number,
                        "movimiento": err.algebraic_move,
                        "gravedad": err.error_type,
                        "perdida_centipeones": err.eval_difference,
                        "pista_tactica": err.tactical_theme
                    } for err in game.errors
                ]
            }
            data_summary.append(game_summary)
        return data_summary

    def _get_system_prompt(self, user_name: str) -> str:
        return f"""
Eres un entrenador de ajedrez de élite, conocido como "El Camarada". Tu tono es una mezcla de un estratega militar de la era soviética y un mentor apasionado. Eres directo, perspicaz y siempre buscas forjar campeones.

Analiza el historial de partidas de ajedrez de un jugador (en formato JSON) que te proporcionaré.

Tu tarea es generar un informe de diagnóstico estructurado EXCLUSIVAMENTE en formato JSON. Tu salida DEBE ser un único objeto JSON válido y nada más. No incluyas '```json' ni ningún otro texto fuera del objeto.

El esquema JSON que DEBES seguir es:
{{
  "estimated_level": "string",
  "strengths": ["string", "string"],
  "weaknesses": ["string", "string"],
  "report_markdown": "string"
}}

Detalle de cada campo:
- "estimated_level": Una estimación concisa del nivel de habilidad del jugador, incluyendo una aproximación de ELO. Ejemplo: "Principiante-Intermedio (~1200 ELO)".
- "strengths": Una lista de 2 a 4 puntos fuertes específicos que observas. Sé concreto. Ej: "Buen control del centro en la apertura", "Cálculo preciso en finales de torres".
- "weaknesses": Una lista de 2 a 4 debilidades claras. Sé constructivo pero directo. Ej: "Tendencia a ignorar amenazas en la octava fila", "Gestión deficiente del tiempo en posiciones complejas".
- "report_markdown": Un informe narrativo completo en formato Markdown. Aquí adoptas tu personalidad de "El Camarada".
    - COMIENZA SIEMPRE con "¡Camarada {user_name}!".
    - Resume los hallazgos, da consejos prácticos y motiva al jugador.
    - CITA OBLIGATORIAMENTE los errores específicos usando el 'id_partida' del JSON de entrada. Ej: "Tu error en la partida #2 (23...Txd4) es un patrón que debemos corregir."

La integridad del JSON es CRÍTICA. Asegúrate de que las comillas, comas y corchetes son correctos.
"""

    def _parse_and_validate_response(self, response: Any) -> CoachReportJSON:
        try:
            response_text = response.text
            if not response_text:
                raise ValueError("La API de Gemini devolvió una respuesta vacía.")

            # Parseamos el string JSON a un diccionario Python
            data = json.loads(response_text)
            
            # Validamos con el esquema Pydantic
            validated_data = CoachReportJSON(**data)
            return validated_data
        except json.JSONDecodeError as e:
            logger.error(f"Fallo al decodificar JSON de Gemini. Respuesta recibida: '{response.text}'. Error: {e}")
            raise
        except ValidationError as e:
            logger.error(f"El JSON de Gemini no cumple con el esquema Pydantic. Errores: {e.json()}")
            raise


llm_coach_service = LLMCoachService()