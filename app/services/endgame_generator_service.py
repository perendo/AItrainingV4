# app/services/endgame_generator_service.py
import logging
from typing import List, Literal
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models.endgame import EndgameLesson, EndgameTimelineEvent
from app.services.gemini_client import gemini_client

logger = logging.getLogger("EndgameGeneratorService")


class TimelineEventSchema(BaseModel):
    timestamp_seconds: float = Field(
        ..., description="Segundo exacto en el audio del podcast donde ocurre la acción visual."
    )
    action_type: Literal["move_piece", "highlight_square", "draw_arrow", "pause_for_quiz"] = Field(
        ..., description="Tipo de acción a realizar en el tablero."
    )
    payload: dict = Field(
        ..., description="Datos asociados a la acción (ej: {'san': 'Re8+'}, {'squares': ['e4', 'e5']}, {'from': 'e1', 'to': 'e2'}, {'question': '...'})"
    )


class LessonContentSchema(BaseModel):
    podcast_script: str = Field(
        ..., description="Guión explicativo ameno y detallado estilo podcast (300-400 palabras) en español sobre la posición teórica."
    )
    timeline_events: List[TimelineEventSchema] = Field(
        ..., description="Lista de eventos cronológicos sincronizados con el audio para mostrar en el tablero."
    )


class EndgameGeneratorService:
    """Servicio para generar el contenido educativo (guión de podcast y eventos de tablero) usando Gemini."""

    async def generate_lesson_content(self, lesson_id: int, db: Session) -> EndgameLesson:
        """Obtiene la lección, solicita el contenido estructurado a Gemini y lo guarda en la base de datos."""
        lesson = db.query(EndgameLesson).filter(EndgameLesson.id == lesson_id).first()
        if not lesson:
            raise ValueError(f"Lección de final con ID {lesson_id} no encontrada.")

        system_prompt = (
            "Eres un Gran Maestro Internacional de Ajedrez experto en finales teóricos y un locutor de podcast "
            "carismático, ameno y didáctico. Tu objetivo es explicar la posición teórica de forma magistral y "
            "estructurar una serie de eventos visuales sincronizados para un tablero interactivo. "
            "Devuelve estrictamente un objeto JSON válido que contenga 'podcast_script' y 'timeline_events'."
        )

        user_prompt = f"""
Genera el contenido educativo completo para la siguiente lección de final teórico de ajedrez:
- Título de la lección: {lesson.title}
- Categoría: {lesson.category.value if hasattr(lesson.category, 'value') else lesson.category}
- Dificultad: {lesson.difficulty}
- Resultado objetivo: {lesson.target_result}
- Posición inicial (FEN): {lesson.initial_fen}

Instrucciones estrictas:
1. podcast_script: Redacta un guión explicativo ameno y fluido estilo podcast de entre 300 y 400 palabras en español. Explica la posición teórica, las ideas estratégicas clave, el plan ganador (o de defensa si es tablas), y posibles trampas o sutilezas a evitar.
2. timeline_events: Crea una lista cronológica de eventos para sincronizar con el audio del podcast. Cada evento debe incluir:
   - timestamp_seconds: Tiempo flotante en segundos (ej. 0.0, 15.5, 32.0, etc.) desde el inicio.
   - action_type: Uno de ["move_piece", "highlight_square", "draw_arrow", "pause_for_quiz"].
   - payload: Objeto JSON con los detalles (ej. para move_piece: {{"san": "Re8+"}}; para highlight_square: {{"squares": ["e4", "e5"]}}; para draw_arrow: {{"from": "e1", "to": "e2"}}; para pause_for_quiz: {{"question": "...", "correct_move": "..."}}).
"""

        logger.info(f"Solicitando contenido a Gemini para la lección #{lesson.id} ({lesson.title})...")

        try:
            # Generar y validar JSON con gemini_client utilizando el esquema Pydantic
            result: LessonContentSchema = gemini_client.generate_json(
                user_prompt,
                system_prompt=system_prompt,
                schema=LessonContentSchema,
                response_schema=False,
                temperature=0.4,
                max_output_tokens=8192,
            )

            # Actualizar lección
            lesson.podcast_script = result.podcast_script

            # Limpiar eventos anteriores si los hubiera (idempotencia en re-generación)
            db.query(EndgameTimelineEvent).filter(EndgameTimelineEvent.lesson_id == lesson.id).delete()

            # Insertar nuevos eventos del timeline
            for event_item in result.timeline_events:
                timeline_event = EndgameTimelineEvent(
                    lesson_id=lesson.id,
                    timestamp_seconds=event_item.timestamp_seconds,
                    action_type=event_item.action_type,
                    payload=event_item.payload,
                )
                db.add(timeline_event)

            db.commit()
            db.refresh(lesson)
            logger.info(f"Contenido generado y guardado con éxito para la lección #{lesson.id}.")
            return lesson

        except Exception as e:
            db.rollback()
            logger.error(f"Error generando contenido para la lección #{lesson_id}: {e}", exc_info=True)
            raise


# Instancia única del servicio
endgame_generator_service = EndgameGeneratorService()


async def generate_lesson_content(lesson_id: int, db: Session) -> EndgameLesson:
    """Función de ayuda expuesta directamente para cumplir especificaciones de importación."""
    return await endgame_generator_service.generate_lesson_content(lesson_id, db)
