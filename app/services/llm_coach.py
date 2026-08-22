import logging
import json
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.repositories.user_repo import user_repo
from app.repositories.game_repo import game_repo
from app.models.game import CoachReport
from app.schemas.coach import CoachReportJSON, CoachReportJSONSchema # Esquemas Pydantic para validar el JSON
from app.services.gemini_client import gemini_client

logger = logging.getLogger("EntrenadorIA")

class LLMCoachService:
    """Servicio de diagnóstico del entrenador. La generación con IA delega en ``gemini_client``."""

    @property
    def model(self) -> Any:
        # Mantenido por compatibilidad (tests lo parchean); la lógica real usa gemini_client.
        return gemini_client.model

    def generate_diagnostic(self, db: Session, user_id: int) -> CoachReport:
        user = user_repo.get(db, id=user_id)
        if not user:
            raise ValueError("Usuario no encontrado.")

        games = game_repo.get_user_games_with_errors(db, user_id=user_id)
        if not games:
            raise ValueError("Aún no tienes partidas analizadas. Sube algunos archivos PGN para obtener tu diagnóstico.")

        data_summary = self._prepare_data_summary(games)
        
        # Obtenemos el ELO o nivel del usuario si está registrado
        user_elo = getattr(user, "elo", None) or "No especificado"
        user_name = user.full_name or "Jugador"
        
        system_prompt = self._get_system_prompt(user_name, user_elo)
        
        user_prompt = f"""Aquí tienes los datos de las partidas analizadas y el registro detallado de errores con pérdidas de centipeones (cp):

Jugador: {user_name}
ELO Registrado / FIDE: {user_elo}

Datos de partidas y errores de Stockfish:
{json.dumps(data_summary, indent=2)}

Por favor, genera el Informe Técnico de Desempeño en el formato JSON solicitado."""

        try:
            logger.info(f"Enviando {len(data_summary)} partidas a Gemini para diagnóstico técnico FIDE...")

            # Generar y validar la respuesta JSON con el cliente unificado de Gemini
            report_data = gemini_client.generate_json(
                user_prompt,
                system_prompt=system_prompt,
                schema=CoachReportJSON,
                response_schema=CoachReportJSONSchema,
                temperature=0.3,
                max_output_tokens=8192,
            )

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

            logger.info(f"Informe de Gran Maestro #{nuevo_informe.id} guardado con éxito.")
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
                "color_usuario": getattr(game, "player_color", "desconocido"),
                "resultado_usuario": "Ganó" if (game.result == "1-0" and game.player_color == "white") or (game.result == "0-1" and game.player_color == "black") else ("Tablas" if game.result == "1/2-1/2" else "Perdió"),
                "errores_criticos": [
                    {
                        "jugada": err.move_number,
                        "movimiento": err.algebraic_move,
                        "gravedad": err.error_type,
                        "perdida_centipeones_cp": err.eval_difference,
                        "pista_tactica_o_posicional": err.tactical_theme
                    } for err in game.errors
                ]
            }
            data_summary.append(game_summary)
        return data_summary

    def _get_system_prompt(self, user_name: str, user_elo: Any) -> str:
        return f"""
Actúa como un Gran Maestro de Ajedrez y Entrenador de Élite de nivel internacional. Tu objetivo es redactar un informe completo, humano, motivador y fluido en español (usando Markdown) para el jugador {user_name} (ELO FIDE/Registrado: {user_elo}).

DIRECTRICES DEL INFORME:
- Analiza los momentos clave de las partidas de forma narrativa y profunda. Destaca con claridad los aciertos, los errores posicionales o tácticos cometidos y ofrece consejos prácticos muy útiles para el jugador.
- Mantén un tono profesional pero cercano, constructivo, analítico y motivador, digno de un entrenador personal de élite.
- Estructura el texto en Markdown limpio y ordenado (con títulos, subtítulos, viñetas y negritas donde sea oportuno).

DIRECTRICES DE FORMATO MARKDOWN (OBLIGATORIO):
- Separa SIEMPRE los encabezados, párrafos y elementos de lista con una línea en blanco (doble salto de línea, `\n\n`). Nunca juntes bloques consecutivos sin una línea en blanco entre ellos.
- Deja una línea en blanco después de cada encabezado antes de iniciar el bloque siguiente.
- Cada elemento de una lista debe ocupar su propia línea independiente: escríbelo como `\n* Elemento` (o `\n- Elemento`). Está PROHIBIDO concatenar varios puntos en la misma línea separados por asteriscos.
- Usa EXACTAMENTE un símbolo `#` por nivel de encabezado (`#`, `##`, `###`). Está PROHIBIDO duplicar símbolos (ej.: NUNCA escribas `## ## 3. DIAGNÓSTICO`; debes escribir `## 3. DIAGNÓSTICO`).
- No mezcles encabezados con negritas ni con contenido en la misma línea: el encabezado va solo en su línea y el contenido debajo.
- Mantén las negritas `**texto**` dentro del mismo párrafo, sin convertirlas en listas.

Tu salida DEBE ser EXCLUSIVAMENTE un objeto JSON válido con este único campo:
{{
  "report_markdown": "string con todo el informe narrativo completo en formato Markdown"
}}
"""

llm_coach_service = LLMCoachService()