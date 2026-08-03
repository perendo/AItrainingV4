import logging
import json
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from pydantic import ValidationError

from app.core.config import settings
from app.repositories.user_repo import user_repo
from app.repositories.game_repo import game_repo
from app.models.game import CoachReport
from app.schemas.coach import CoachReportJSON # Esquema Pydantic para validar el JSON

logger = logging.getLogger("EntrenadorIA")

class LLMCoachService:
    _model = None

    def __init__(self):
        # Inicialización del cliente de Google GenAI
        self.model_name = "gemini-2.5-flash"

    @property
    def model(self) -> Any:
        if self._model is None:
            import google.generativeai as genai
            genai.configure(api_key=settings.GEMINI_API_KEY)
            # System prompt is now part of the model configuration
            self._model = genai.GenerativeModel(self.model_name)
        return self._model
        
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
            logger.info(f"Enviando {len(data_summary)} partidas a Gemini ({self.model_name}) para diagnóstico técnico FIDE...")

            model_with_system_prompt = self.model
            model_with_system_prompt.system_instruction = system_prompt

            response = model_with_system_prompt.generate_content(
                user_prompt,
                generation_config={
                    "response_mime_type": "application/json",
                    "temperature": 0.3, # Mayor rigor analítico y precisión técnica
                },
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
Actúa como un Gran Maestro de Ajedrez y Entrenador de Élite de nivel internacional. Tu objetivo es generar un Informe Técnico y Estratégico de Desempeño exhaustivo, profesional y personalizado para el jugador {user_name} (ELO FIDE/Registrado: {user_elo}).

ESCALA OFICIAL DE CLASIFICACIÓN FIDE:
- Principiante (< 1400 ELO): Errores tácticos de 1 jugada, deslices materiales groseros.
- Aficionado / Jugador de Club (1400 - 1800 ELO): Nociones de apertura y táctica elemental. Rara vez regala piezas, pero carece de comprensión estratégica profunda.
- Avanzado (1800 - 2000 ELO): Conocimiento amplio posicional y táctico. Jugador habitual de torneos.
- Maestro (2000 - 2400 ELO): Dominio técnico muy elevado (Incluye Candidato a Maestro CM ~2200, Maestro FIDE FM ~2300, Maestro Internacional MI ~2400).
- Gran Maestro - GM (> 2500 ELO): Comprensión profunda de élite.

DIRECTRICES DEL PLAN DE ACCIÓN TÉCNICO:
- LIBERTAD TEMÁTICA TOTAL: No estás restringido a porcentajes fijos predefinidos. Analiza libremente los patrones de error específicos del jugador y determina cuáles son los **TEMAS Y ÁREAS CLAVE** que necesita ejercitar (táctica específica, finales, juego posicional, estructura de peones, cálculo de capturas, etc.).
- ENFOQUE EN EJERCICIOS TEMÁTICOS: Para cada área o tema recomendado, especifica los temas o conceptos concretos a buscar en la base de datos de entrenamiento (ej: "Finales de Torres", "Ataque al Rey Enrocado", "Eliminación del Defensor", "Estructuras de Peón Colgante", "Destrucción de la Estructura de Peones").
- MODELOS Y REFERENTES: Recomienda maestros clásicos o modernos relevantes para esos temas específicos.
- FORMATO MARKDOWN LIMPIO: Separa CADA título/subtítulo de su contenido con un SALTO DE LÍNEA DOBLE (\\n\\n).

Tu salida DEBE ser EXCLUSIVAMENTE un objeto JSON válido con este esquema:
{{
  "estimated_level": "string",
  "strengths": ["string", "string"],
  "weaknesses": ["string", "string"],
  "report_markdown": "string"
}}

Estructura sugerida para el campo "report_markdown":

# Informe Técnico de Desempeño
**Jugador:** {user_name}  
**Nivel / Categoría FIDE:** [Categoría FIDE e intervalo de ELO]

## 1. Evaluación General del Rendimiento

[Análisis cuantitativo de la pérdida de centipeones y estabilidad bajo presión adecuada a su categoría FIDE]

## 2. Patrones de Error Identificados

### 2.1 [Primer Patrón de Error / Posicional / Táctico]

[Cita jugadas concretas, partidas y pérdida exacta de cp]

### 2.2 [Segundo Patrón de Error / Finales / Apertura]

[Análisis de errores e imprecisiones específicas con pérdidas de cp]

## 3. Plan de Acción Técnico y Módulos de Entrenamiento

Determina libremente de 2 a 4 secciones temáticas prioritarias a trabajar según los errores detectados:

### 3.1 [Tema / Área Prioritaria 1]

- **Motivo técnico:** [Razón basada en sus errores reales]
- **Temas de ejercicios recomendados:** [Específica qué tipo de puzzles/posiciones debe buscar en la base de datos]
- **Estudio y modelos recomendados:** [Jugadores o partidas clave a estudiar]

### 3.2 [Tema / Área Prioritaria 2]

- **Motivo técnico:** [Razón basada en sus errores reales]
- **Temas de ejercicios recomendados:** [Específica qué tipo de puzzles/posiciones debe buscar en la base de datos]
- **Estudio y modelos recomendados:** [Jugadores o partidas clave a estudiar]

[Añadir 3.3 o 3.4 si es necesario según el análisis]

## 4. Conclusión Técnica

[Texto de conclusión]
"""

    def _parse_and_validate_response(self, response: Any) -> CoachReportJSON:
        try:
            response_text = response.text
            if not response_text:
                raise ValueError("La API de Gemini devolvió una respuesta vacía.")

            # Log the raw response for debugging
            logger.debug(f"Raw Gemini response (first 2000 chars): {response_text[:2000]}")

            # Limpieza de bloques markdown (```json ... ```) si el modelo los añade por error
            cleaned_text = response_text.strip()
            if cleaned_text.startswith("```json"):
                cleaned_text = cleaned_text[7:]
            if cleaned_text.startswith("```"):
                cleaned_text = cleaned_text[3:]
            if cleaned_text.endswith("```"):
                cleaned_text = cleaned_text[:-3]
            cleaned_text = cleaned_text.strip()

            # Parseamos el string JSON limpiado
            data = json.loads(cleaned_text)
            
            # Validamos con el esquema Pydantic
            validated_data = CoachReportJSON(**data)
            return validated_data
        except json.JSONDecodeError as e:
            logger.error(f"Fallo al decodificar JSON de Gemini. Respuesta completa: '{response_text}'. Error: {e}")
            raise
        except ValidationError as e:
            logger.error(f"El JSON de Gemini no cumple con el esquema Pydantic. Respuesta: '{response_text}'. Errores: {e.json()}")
            raise


llm_coach_service = LLMCoachService()