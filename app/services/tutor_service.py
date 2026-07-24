import logging
import json
from datetime import datetime
from typing import Any
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.repositories.gm_game_repo import gm_game_repo
from app.models.user_game_analysis import UserGameAnalysis
from app.schemas.analysis import (
    FasesAnalisis, MomentosCriticos, FactoresPosicionales,
    ConclusionesPlan, GeminiFeedback, GameAnalysisCreate,
)

logger = logging.getLogger("EntrenadorIA")


class TutorGeminiService:
    _model = None

    def __init__(self):
        self.model_name = "gemini-1.5-flash"

    @property
    def model(self) -> Any:
        if self._model is None:
            import google.generativeai as genai
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self._model = genai.GenerativeModel(self.model_name)
        return self._model

    def analyze_user_diagnosis(
        self,
        db: Session,
        user_id: int,
        analysis_data: GameAnalysisCreate,
    ) -> UserGameAnalysis:
        gm_game = gm_game_repo.get_by_id(db, analysis_data.gm_game_id)
        if not gm_game:
            raise ValueError(f"Partida GM con ID {analysis_data.gm_game_id} no encontrada")

        system_prompt = self._get_system_prompt()
        user_prompt = self._build_user_prompt(gm_game, analysis_data)

        try:
            logger.info(f"Enviando autodiagnóstico a Gemini ({self.model_name}) para auditoría...")

            model_with_system = self.model
            model_with_system.system_instruction = system_prompt

            response = model_with_system.generate_content(
                user_prompt,
                generation_config={
                    "response_mime_type": "application/json",
                    "temperature": 0.3,
                },
            )

            feedback_data = self._parse_and_validate_response(response)

            fases_json = analysis_data.fases_analisis.model_dump_json()
            momentos_json = analysis_data.momentos_criticos.model_dump_json()
            factores_json = analysis_data.factores_posicionales.model_dump_json()
            conclusiones_json = analysis_data.conclusiones_plan.model_dump_json()
            gemini_json = feedback_data.model_dump_json()

            new_analysis = UserGameAnalysis(
                user_id=user_id,
                game_id=gm_game.id,
                game_type="GM",
                fases_analisis=fases_json,
                momentos_criticos=momentos_json,
                factores_posicionales=factores_json,
                conclusiones_plan=conclusiones_json,
                gemini_feedback=gemini_json,
                created_at=datetime.utcnow().isoformat(),
            )

            db.add(new_analysis)
            db.commit()
            db.refresh(new_analysis)

            logger.info(f"Autodiagnóstico #{new_analysis.id} guardado con auditoría de Gemini")
            return new_analysis

        except (ValidationError, json.JSONDecodeError) as e:
            db.rollback()
            logger.error(f"Error de validación/parseo en respuesta de Gemini: {e}")
            raise ValueError(f"La respuesta del tutor no tuvo el formato JSON esperado: {e}")
        except Exception as e:
            db.rollback()
            logger.error(f"Error inesperado en auditoría Gemini: {e}")
            raise

    def _get_system_prompt(self) -> str:
        return """
ACTÚA COMO UN GRAN MAESTRO DE AJEDREZ Y TUTOR PEDAGÓGICO DE LA ESCUELA SOVIÉTICA.
Tu método: Análisis concreto, exigencia de precisión, enfoque en conceptos fundamentales.
No des elogios vacíos. Señala el error conceptual grave. Exige claridad en el plan.

RECIBIRÁS:
1. La partida completa en PGN (de un GM).
2. El autodiagnóstico del alumno estructurado en 4 bloques:
   - Fases: apertura, medio_juego, final
   - Momentos críticos: pieza_a_mejorar, amenaza_rival
   - Factores posicionales: material, seguridad_rey, espacio
   - Conclusiones: plan_estrategico, error_conceptual_grave, idea_a_repasar

TAREA:
Audita el autodiagnóstico del alumno comparándolo con la realidad de la partida.
Genera EXCLUSIVAMENTE un JSON válido con este esquema exacto:

{
  "feedback_fases": {
    "apertura": "string",
    "medio_juego": "string",
    "final": "string"
  },
  "respuestas_preguntas_criticas": {
    "mejora_piezas": "string",
    "amenaza_real": "string"
  },
  "matriz_posicional": {
    "material": "string",
    "rey": "string",
    "espacio": "string"
  },
  "auditoria_conclusiones": {
    "plan_correcto": boolean,
    "evaluacion_error": "string",
    "concepto_reforzar": "string"
  }
}

CRITERIOS DE AUDITORÍA (Escuela Soviética):
- ¿Identifica correctamente el plan en cada fase o se queda en generalidades?
- ¿La "pieza a mejorar" es realmente la peor situada o es una excusa?
- ¿La "amenaza rival" es real o imaginaria? Cita jugadas concretas.
- ¿Evalúa material/rey/espacio con precisión o repite lugares comunes?
- ¿El "plan estratégico" es realizable y nace de la posición?
- ¿El "error conceptual grave" es VERDADERAMENTE conceptual (no táctico)?
- ¿La "idea a repasar" es estudiable (ej: "finales de torres Vancura", "estructura Carlsbad")?

Sé severo pero constructivo. Responde SOLO el JSON.
"""

    def _build_user_prompt(self, gm_game: Any, analysis_data: GameAnalysisCreate) -> str:
        fases = analysis_data.fases_analisis
        momentos = analysis_data.momentos_criticos
        factores = analysis_data.factores_posicionales
        conclusiones = analysis_data.conclusiones_plan

        return f"""
PARTIDA GM (PGN):
{gm_game.pgn}

AUTODIAGNÓSTICO DEL ALUMNO:

=== FASES ===
Apertura: {fases.apertura}
Medio juego: {fases.medio_juego}
Final: {fases.final}

=== MOMENTOS CRÍTICOS ===
Pieza a mejorar: {momentos.pieza_a_mejorar}
Amenaza rival: {momentos.amenaza_rival}

=== FACTORES POSICIONALES ===
Material: {factores.material}
Seguridad del Rey: {factores.seguridad_rey}
Espacio: {factores.espacio}

=== CONCLUSIONES Y PLAN ===
Plan estratégico: {conclusiones.plan_estrategico}
Error conceptual grave: {conclusiones.error_conceptual_grave}
Idea a repasar: {conclusiones.idea_a_repasar}

---
Genera tu auditoría en el JSON estricto solicitado.
"""

    def _parse_and_validate_response(self, response: Any) -> GeminiFeedback:
        response_text = response.text
        if not response_text:
            raise ValueError("La API de Gemini devolvió una respuesta vacía.")

        cleaned_text = response_text.strip()
        if cleaned_text.startswith("```json"):
            cleaned_text = cleaned_text[7:]
        if cleaned_text.startswith("```"):
            cleaned_text = cleaned_text[3:]
        if cleaned_text.endswith("```"):
            cleaned_text = cleaned_text[:-3]
        cleaned_text = cleaned_text.strip()

        data = json.loads(cleaned_text)
        return GeminiFeedback(**data)


tutor_gemini_service = TutorGeminiService()
