import logging
import time
from datetime import datetime
from typing import Any, Optional
from sqlalchemy.orm import Session

from app.core.config import settings
from app.repositories.gm_game_repo import gm_game_repo
from app.models.user_game_analysis import UserGameAnalysis
from app.models.user_analyzed_gm_game import UserAnalyzedGMGame
from app.models.user import User
from app.schemas.analysis import (
    FasesAnalisis, MomentosCriticos, FactoresPosicionales,
    ConclusionesPlan, GeminiFeedback, GameAnalysisCreate,
    GameAnalysisDraftCreate,
)
from app.services.gemini_client import gemini_client

logger = logging.getLogger("EntrenadorIA")


class TutorGeminiService:
    """Autodiagnóstico auditado por el Gran Maestro. La generación con IA delega en ``gemini_client``."""

    @property
    def model(self) -> Any:
        # Mantenido por compatibilidad (tests lo parchean); la lógica real usa gemini_client.
        return gemini_client.model

    def analyze_user_diagnosis(
        self,
        db: Session,
        user_id: int,
        analysis_data: GameAnalysisCreate,
    ) -> UserGameAnalysis:
        game_type, game_id, pgn, white_player, black_player, player_username, user_side = self._resolve_source(
            db, analysis_data
        )

        system_prompt = self._get_system_prompt()
        user_prompt = self._build_user_prompt(pgn, white_player, black_player, analysis_data, player_username, user_side)

        try:
            logger.info("Enviando autodiagnóstico a Gemini para auditoría...")

            feedback_data = gemini_client.generate_json(
                user_prompt,
                system_prompt=system_prompt,
                schema=GeminiFeedback,
                temperature=0.3,
                max_output_tokens=4096,
            )

            fases_json = analysis_data.fases_analisis.model_dump_json()
            momentos_json = analysis_data.momentos_criticos.model_dump_json()
            factores_json = analysis_data.factores_posicionales.model_dump_json()
            conclusiones_json = analysis_data.conclusiones_plan.model_dump_json()
            gemini_json = feedback_data.model_dump_json()

            new_analysis = self._get_or_create_for_user(
                db, user_id, analysis_data.analysis_id
            )
            new_analysis.game_id = game_id
            new_analysis.game_type = game_type
            new_analysis.white_player = white_player
            new_analysis.black_player = black_player
            new_analysis.pgn = pgn
            new_analysis.fases_analisis = fases_json
            new_analysis.momentos_criticos = momentos_json
            new_analysis.factores_posicionales = factores_json
            new_analysis.conclusiones_plan = conclusiones_json
            new_analysis.gemini_feedback = gemini_json
            if not new_analysis.created_at:
                new_analysis.created_at = datetime.utcnow().isoformat()

            db.add(new_analysis)
            db.commit()
            db.refresh(new_analysis)

            if game_type == "GM" and game_id:
                # Marcar la partida como analizada para que no se recomiende de nuevo
                already_analyzed = db.query(UserAnalyzedGMGame).filter(
                    UserAnalyzedGMGame.user_id == user_id,
                    UserAnalyzedGMGame.gm_game_id == str(game_id),
                ).first()
                if not already_analyzed:
                    db.add(UserAnalyzedGMGame(user_id=user_id, gm_game_id=str(game_id)))

                # Limpiar la asignación actual del usuario para que se asigne una nueva en la siguiente ronda
                user_record = db.query(User).filter(User.id == user_id).first()
                if user_record:
                    user_record.current_assigned_gm_game_id = None

            db.commit()

            logger.info(f"Autodiagnóstico #{new_analysis.id} guardado con auditoría de Gemini")
            return new_analysis

        except ValueError as e:
            db.rollback()
            logger.error(f"Error de validación/parseo en respuesta de Gemini: {e}")
            raise ValueError(f"La respuesta del tutor no tuvo el formato JSON esperado: {e}")
        except Exception as e:
            db.rollback()
            logger.error(f"Error inesperado en auditoría Gemini: {e}")
            raise

    # ------------------------------------------------------------------ #
    # Flujo asíncrono (BackgroundTasks): el envío NO bloquea la interfaz.
    # ------------------------------------------------------------------ #
    def create_pending_analysis(
        self,
        db: Session,
        user_id: int,
        analysis_data: GameAnalysisCreate,
    ) -> UserGameAnalysis:
        """Persiste el formulario SIN auditar (estado "processing") y devuelve el id.

        Falla rápido (400) si la partida GM no existe o falta el PGN propio.
        """
        game_type, game_id, pgn, white_player, black_player, _, _ = self._resolve_source(
            db, analysis_data
        )
        analysis = self._get_or_create_for_user(db, user_id, analysis_data.analysis_id)
        analysis.game_type = game_type
        analysis.game_id = game_id
        analysis.white_player = white_player
        analysis.black_player = black_player
        analysis.pgn = pgn
        analysis.fases_analisis = analysis_data.fases_analisis.model_dump_json()
        analysis.momentos_criticos = analysis_data.momentos_criticos.model_dump_json()
        analysis.factores_posicionales = analysis_data.factores_posicionales.model_dump_json()
        analysis.conclusiones_plan = analysis_data.conclusiones_plan.model_dump_json()
        if not analysis.created_at:
            analysis.created_at = datetime.utcnow().isoformat()
        analysis.status = "processing"
        # Snapshot del envío: permite relanzar la auditoría tras un reinicio
        # del servidor sin perder el contexto (nick, bando, PGN, formularios).
        analysis.audit_payload = analysis_data.model_dump_json()
        db.add(analysis)
        db.commit()
        db.refresh(analysis)
        logger.info(f"Autodiagnóstico #{analysis.id} creado (pendiente de auditoría)")
        return analysis

    def _mark_analysis_failed(
        self, db: Session, analysis_id: int, message: str, attempts: int = 0
    ) -> None:
        """Marca un autodiagnóstico como fallido almacenando el error para el frontend."""
        try:
            analysis = (
                db.query(UserGameAnalysis)
                .filter(UserGameAnalysis.id == analysis_id)
                .first()
            )
            if analysis:
                analysis.status = "failed"
                analysis.error_message = message
                analysis.audit_attempts = attempts
                db.commit()
        except Exception:
            db.rollback()

    def audit_existing_analysis(
        self,
        analysis_id: int,
        user_id: int,
        analysis_data: GameAnalysisCreate,
    ) -> None:
        """Tarea de fondo: ejecuta la auditoría de Gemini y guarda el feedback.

        Ante fallo transitorio de la IA (saturación/timeout) reintenta hasta
        ``settings.GEMINI_TASK_RETRIES`` veces esperando
        ``settings.GEMINI_TASK_RETRY_WAIT_SECONDS`` entre intentos; el borrador
        y los datos del formulario ya están persistidos, así que solo se repite
        la llamada a Gemini. Agotados los intentos queda "failed" con mensaje
        claro para reenviar manualmente desde el histórico.

        Abre su propia sesión de BD para poder ser monkeypatcheada en tests y no
        depender del request original.
        """
        from app.core.database import background_session

        with background_session() as db:
            try:
                analysis = (
                    db.query(UserGameAnalysis)
                    .filter(
                        UserGameAnalysis.id == analysis_id,
                        UserGameAnalysis.user_id == user_id,
                    )
                    .first()
                )
                if not analysis:
                    logger.warning(f"Autodiagnóstico #{analysis_id} no encontrado en background.")
                    return

                game_type, game_id, pgn, white_player, black_player, player_username, user_side = self._resolve_source(
                    db, analysis_data
                )
                system_prompt = self._get_system_prompt()
                user_prompt = self._build_user_prompt(
                    pgn, white_player, black_player, analysis_data, player_username, user_side
                )

                max_intentos = max(1, settings.GEMINI_TASK_RETRIES)
                espera = settings.GEMINI_TASK_RETRY_WAIT_SECONDS
                feedback_data = None
                for intento in range(1, max_intentos + 1):
                    logger.info(
                        f"Auditoría en segundo plano para autodiagnóstico "
                        f"#{analysis_id} (intento {intento}/{max_intentos})..."
                    )
                    try:
                        feedback_data = gemini_client.generate_json(
                            user_prompt,
                            system_prompt=system_prompt,
                            schema=GeminiFeedback,
                            temperature=0.3,
                            max_output_tokens=4096,
                        )
                        break
                    except Exception as e:
                        logger.error(
                            f"Intento {intento}/{max_intentos} de auditoría "
                            f"#{analysis_id} falló: {e}"
                        )
                        if intento >= max_intentos:
                            self._mark_analysis_failed(
                                db, analysis_id,
                                "El Gran Maestro no pudo completar la auditoría: "
                                f"la IA no respondió tras {max_intentos} intentos. "
                                "Vuelve a enviar el análisis cuando quieras.",
                                attempts=intento,
                            )
                            return
                        # El borrador sigue a salvo; anotamos el reintento y esperamos.
                        analysis.audit_attempts = intento
                        analysis.error_message = (
                            f"La IA está saturada (intento {intento}/{max_intentos}). "
                            "Reintentando automáticamente..."
                        )
                        db.commit()
                        time.sleep(espera)

                gemini_json = feedback_data.model_dump_json()

                analysis.gemini_feedback = gemini_json
                analysis.status = "completed"
                analysis.audit_attempts = 0
                analysis.error_message = None
                analysis.game_type = game_type
                analysis.game_id = game_id
                analysis.white_player = white_player
                analysis.black_player = black_player
                analysis.pgn = pgn
                db.add(analysis)
                db.commit()

                if game_type == "GM" and game_id:
                    already_analyzed = db.query(UserAnalyzedGMGame).filter(
                        UserAnalyzedGMGame.user_id == user_id,
                        UserAnalyzedGMGame.gm_game_id == str(game_id),
                    ).first()
                    if not already_analyzed:
                        db.add(UserAnalyzedGMGame(user_id=user_id, gm_game_id=str(game_id)))
                    user_record = db.query(User).filter(User.id == user_id).first()
                    if user_record:
                        user_record.current_assigned_gm_game_id = None
                    db.commit()

                logger.info(f"Autodiagnóstico #{analysis_id} auditado correctamente en background.")
            except ValueError as e:
                db.rollback()
                logger.error(f"Error de validación/parseo (background) para #{analysis_id}: {e}")
                self._mark_analysis_failed(
                    db, analysis_id,
                    f"La respuesta del tutor no tuvo el formato esperado: {e}",
                )
            except Exception as e:
                db.rollback()
                logger.error(f"Error inesperado en auditoría background para #{analysis_id}: {e}")
                self._mark_analysis_failed(
                    db, analysis_id,
                    f"Error inesperado durante la auditoría del Gran Maestro: {e}",
                )

    def save_draft(
        self,
        db: Session,
        user_id: int,
        draft_data: GameAnalysisDraftCreate,
    ) -> UserGameAnalysis:
        """Guarda/actualiza el autodiagnóstico SIN consultar a Gemini.

        Se usa para registrar una partida propia recién capturada (modo 1v1) o
        para persistir el formulario a medio rellenar, dejándolo 'Pendiente de Análisis'.
        """
        game_type, game_id, pgn, white_player, black_player, _, _ = self._resolve_source(
            db, draft_data
        )

        try:
            analysis = self._get_or_create_for_user(db, user_id, draft_data.analysis_id)
            analysis.game_id = game_id
            analysis.game_type = game_type
            analysis.white_player = white_player
            analysis.black_player = black_player
            analysis.pgn = pgn

            if draft_data.fases_analisis is not None:
                analysis.fases_analisis = draft_data.fases_analisis.model_dump_json()
            if draft_data.momentos_criticos is not None:
                analysis.momentos_criticos = draft_data.momentos_criticos.model_dump_json()
            if draft_data.factores_posicionales is not None:
                analysis.factores_posicionales = draft_data.factores_posicionales.model_dump_json()
            if draft_data.conclusiones_plan is not None:
                analysis.conclusiones_plan = draft_data.conclusiones_plan.model_dump_json()

            if not analysis.created_at:
                analysis.created_at = datetime.utcnow().isoformat()

            db.add(analysis)
            db.commit()
            db.refresh(analysis)

            logger.info(f"Borrador de autodiagnóstico #{analysis.id} guardado (pendiente de análisis)")
            return analysis

        except Exception as e:
            db.rollback()
            logger.error(f"Error al guardar borrador de autodiagnóstico: {e}")
            raise

    def _normalize_pgn(self, pgn: str) -> str:
        """Normaliza el texto del PGN eliminando bloques markdown accidentales y normalizando saltos de línea."""
        if not pgn:
            return ""
        cleaned = pgn.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            if lines:
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()
        cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
        return cleaned

    def _resolve_source(self, db: Session, data: Any):
        """Devuelve (game_type, game_id, pgn, white_player, black_player, player_username, user_side).

        - GM: obtiene el PGN y jugadores desde la tabla gm_games.
        - USER: usa el PGN y los nombres enviados en el payload (game_id = None).
        """
        game_type = (getattr(data, "game_type", None) or "GM").strip().upper()
        gm_game_id = getattr(data, "gm_game_id", None)
        player_username = getattr(data, "player_username", None)
        user_side = getattr(data, "user_side", None)

        if game_type == "GM":
            if not gm_game_id:
                raise ValueError("Debes indicar gm_game_id para una partida de GM.")
            gm_game = gm_game_repo.get_by_id(db, str(gm_game_id))
            if not gm_game:
                raise ValueError(f"Partida GM con ID {gm_game_id} no encontrada")
            return "GM", gm_game.id, gm_game.pgn, gm_game.white, gm_game.black, player_username, user_side

        pgn = self._normalize_pgn(getattr(data, "pgn", None) or "")
        if not pgn:
            raise ValueError("Debes proporcionar el PGN de la partida propia (campo 'pgn').")
        white = (getattr(data, "white_player", None) or "Blancas").strip() or "Blancas"
        black = (getattr(data, "black_player", None) or "Negras").strip() or "Negras"
        return "USER", None, pgn, white, black, player_username, user_side

    def _get_or_create_for_user(
        self, db: Session, user_id: int, analysis_id: Optional[int]
    ) -> UserGameAnalysis:
        if analysis_id is not None:
            existing = (
                db.query(UserGameAnalysis)
                .filter(
                    UserGameAnalysis.id == analysis_id,
                    UserGameAnalysis.user_id == user_id,
                )
                .first()
            )
            if not existing:
                raise ValueError(f"Autodiagnóstico {analysis_id} no encontrado o no pertenece al usuario.")
            return existing
        return UserGameAnalysis(user_id=user_id)

    def _get_system_prompt(self) -> str:
        return """
ACTÚA COMO UN GRAN MAESTRO DE AJEDREZ Y TUTOR PEDAGÓGICO DE LA ESCUELA SOVIÉTICA.
Tu método: Análisis concreto, exigencia de precisión, enfoque en conceptos fundamentales.
No des elogios vacíos. Señala el error conceptual grave. Exige claridad en el plan.

RECIBIRÁS:
1. La partida completa en PGN (de un GM o de la propia partida del alumno).
2. El autodiagnóstico del alumno estructurado en 4 bloques:
   - Fases: apertura, medio_juego, final
   - Momentos críticos: pieza_a_mejorar, amenaza_rival
   - Factores posicionales: material, seguridad_rey, espacio
   - Conclusiones: plan_estrategico, error_conceptual_grave, idea_a_repasar

TAREA:
Audita el autodiagnóstico del alumno comparándolo con la realidad de la partida.
Genera EXCLUSIVAMENTE un JSON válido con este esquema exacto. Este esquema es un
CONTRATO OBLIGATORIO de estructura: usa ÚNICAMENTE estas claves y sus nombres tal
cual, sin añadir ni omitir ninguna. Está PROHIBIDO agregar claves extra (resumen_partida,
comentarios, markdown u otros campos). Todos los bloques y claves deben estar presentes:

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

CONCISIÓN OBLIGATORIA:
- Cada campo de texto debe tener MÁXIMO 2-3 frases cortas y directas, al grano.
- Prohibido rodearse con preámbulos, rellenos, lugares comunes o párrafos extensos.
- El JSON completo debe caber holgadamente en la ventana de tokens de salida.
- Nunca dejes el JSON a medias: la respuesta DEBE ser un JSON completo y cerrado.

Sé severo pero constructivo. Responde SOLO el JSON, con exactamente los 4 bloques y todas las claves descritas, y nada más.
"""

    def _build_user_prompt(
        self,
        pgn: str,
        white_player: str,
        black_player: str,
        analysis_data: GameAnalysisCreate,
        player_username: Optional[str] = None,
        user_side: Optional[str] = None,
    ) -> str:
        fases = analysis_data.fases_analisis
        momentos = analysis_data.momentos_criticos
        factores = analysis_data.factores_posicionales
        conclusiones = analysis_data.conclusiones_plan

        user_context_line = ""
        if player_username or user_side:
            side_str = f"las {user_side}" if user_side else "el bando correspondiente"
            nick_str = f" con nick/usuario '{player_username}'" if player_username else ""
            user_context_line = f"\nIMPORTANTE: El usuario a evaluar es el jugador de {side_str}{nick_str}.\n"

        return f"""
PARTIDA (PGN):
{pgn}

JUGADORES:
- Blancas: {white_player}
- Negras: {black_player}
{user_context_line}
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

tutor_gemini_service = TutorGeminiService()
