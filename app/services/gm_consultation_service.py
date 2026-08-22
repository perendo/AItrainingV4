# app/services/gm_consultation_service.py
import logging
from typing import Any, Optional

from app.core.database import SessionLocal
from app.models.gm_consultation import GMConsultation
from app.services.gemini_client import gemini_client

logger = logging.getLogger("GMConsultationService")


class GMConsultationService:
    """Gestiona las consultas (dudas) enviadas al Gran Maestro de forma asíncrona."""

    @property
    def model(self) -> Any:
        # Mantenido por compatibilidad (tests lo parchean); la lógica real usa gemini_client.
        return gemini_client.model

    # ------------------------------------------------------------------ #
    # Operaciones síncronas (HTTP)
    # ------------------------------------------------------------------ #
    def create_consultation(
        self, db, user_id: int, question: str
    ) -> GMConsultation:
        consultation = GMConsultation(
            user_id=user_id,
            question=question,
            status="processing",
        )
        db.add(consultation)
        db.commit()
        db.refresh(consultation)
        return consultation

    def get_consultation(
        self, db, consultation_id: int, user_id: int
    ) -> Optional[GMConsultation]:
        return (
            db.query(GMConsultation)
            .filter(
                GMConsultation.id == consultation_id,
                GMConsultation.user_id == user_id,
            )
            .first()
        )

    def list_consultations(self, db, user_id: int):
        return (
            db.query(GMConsultation)
            .filter(GMConsultation.user_id == user_id)
            .order_by(GMConsultation.created_at.desc(), GMConsultation.id.desc())
            .all()
        )

    # ------------------------------------------------------------------ #
    # Procesamiento en segundo plano (BackgroundTasks)
    # ------------------------------------------------------------------ #
    def process_consultation(
        self, consultation_id: int, user_id: int, question: str
    ) -> None:
        """
        Tarea de fondo: consulta a Gemini y guarda la respuesta.
        Abre su propia sesión de BD para poder ser monkeypatcheada en tests y no
        depender del request original.
        """
        from app.core.database import background_session

        with background_session() as db:
            try:
                consultation = (
                    db.query(GMConsultation)
                    .filter(GMConsultation.id == consultation_id)
                    .first()
                )
                if not consultation:
                    logger.warning(
                        f"Consulta GM #{consultation_id} no encontrada en background."
                    )
                    return

                answer = self._ask_grandmaster(question)

                consultation.answer = answer
                consultation.status = "completed"
                db.commit()
                logger.info(f"Consulta GM #{consultation_id} completada.")
            except Exception as e:
                logger.error(
                    f"Error procesando consulta GM #{consultation_id}: {e}", exc_info=True
                )
                db.rollback()
                try:
                    consultation = (
                        db.query(GMConsultation)
                        .filter(GMConsultation.id == consultation_id)
                        .first()
                    )
                    if consultation:
                        consultation.status = "failed"
                        consultation.error_message = (
                            f"Error al procesar la consulta con el Gran Maestro: {e}"
                        )
                        db.commit()
                except Exception:
                    db.rollback()

    def _ask_grandmaster(self, question: str) -> str:
        system_prompt = (
            "Eres un Gran Maestro de Ajedrez de nivel internacional y un profesor "
            "paciente y cercano. Responde a la duda del alumno de forma clara, "
            "didáctica y motivadora, en español, usando Markdown cuando ayude "
            "(títulos, listas, negritas, y bloques de notación si es relevante). "
            "Sé preciso y explica el razonamiento detrás de cada consejo."
        )
        return gemini_client.generate_text(
            question,
            system_prompt=system_prompt,
            temperature=0.5,
            max_output_tokens=2048,
        )


gm_consultation_service = GMConsultationService()
