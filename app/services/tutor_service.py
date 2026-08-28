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
    ConclusionesPlan, GeminiFeedback, AuditGameAnalysisResponse,
    GameAnalysisCreate, GameAnalysisDraftCreate,
)
from app.services.gemini_client import gemini_client
from app.services.theory_service import theory_service

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

        mode = self._resolve_mode(analysis_data)
        system_prompt, user_prompt = self._build_prompts(
            pgn, white_player, black_player, analysis_data, player_username, user_side, mode
        )
        schema = self._get_feedback_schema(mode)

        try:
            logger.info("Enviando autodiagnóstico a Gemini para auditoría...")

            feedback_data = gemini_client.generate_json(
                user_prompt,
                system_prompt=system_prompt,
                schema=schema,
                response_schema=False if mode == "guided_opening" else None,
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
            new_analysis.analysis_mode = mode
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
                mode = self._resolve_mode(analysis_data)
                system_prompt, user_prompt = self._build_prompts(
                    pgn, white_player, black_player, analysis_data, player_username, user_side, mode
                )
                schema = self._get_feedback_schema(mode)

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
                            schema=schema,
                            response_schema=False if mode == "guided_opening" else None,
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
                analysis.analysis_mode = mode
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

    def _get_system_prompt(self, mode: str = "audit") -> str:
        if mode == "ai":
            return self._get_ai_system_prompt()
        if mode == "guided_opening":
            return self._get_guided_opening_system_prompt()
        return self._get_audit_system_prompt()

    def _build_prompts(
        self,
        pgn: str,
        white_player: str,
        black_player: str,
        analysis_data: GameAnalysisCreate,
        player_username: Optional[str] = None,
        user_side: Optional[str] = None,
        mode: str = "audit",
    ) -> tuple:
        """Devuelve (system_prompt, user_prompt) según el modo de análisis.

        El modo 'guided_opening' añade el contexto de la teórica detectado por
        ``theory_service`` (Punto de Pausa Principal, FEN de salida del libro, etc.).
        """
        if mode == "guided_opening":
            theory_context = self._get_theory_context(pgn)
            return (
                self._get_guided_opening_system_prompt(),
                self._build_guided_opening_user_prompt(
                    pgn, white_player, black_player, analysis_data,
                    player_username, user_side, theory_context,
                ),
            )
        return (
            self._get_system_prompt(mode),
            self._build_user_prompt(
                pgn, white_player, black_player, analysis_data,
                player_username, user_side, mode,
            ),
        )

    @staticmethod
    def _get_feedback_schema(mode: str):
        """Esquema Pydantic que valida la respuesta de Gemini según el modo."""
        if mode == "guided_opening":
            return AuditGameAnalysisResponse
        return GeminiFeedback

    # ------------------------------------------------------------------ #
    # Partida Guiada de Apertura: contexto de la teórica y prompts
    # ------------------------------------------------------------------ #

    def _get_theory_context(self, pgn: str) -> dict:
        """Detecta el fin de la teórica con ``theory_service`` y prepara el contexto.

        Devuelve un dict con las jugadas SAN, la salida del libro (Punto de
        Pausa Principal FEN) y, si está disponible, la evaluación de Stockfish
        de la posición de salida.
        """
        san_moves = theory_service.extract_san_moves(pgn)
        end = theory_service.find_end_of_theory(san_moves)
        context: dict = {
            "san_moves": san_moves,
            "end_of_theory": end,
        }
        if end.get("end_ply") is not None:
            context["last_theory_fen"] = end["last_theory_fen"]
            context["out_of_theory_fen"] = end["out_of_theory_fen"]
            context["deviation_move"] = end["deviation_move"]
            context["move_number"] = end["move_number"]
            context["end_ply"] = end["end_ply"]
            context["stockfish"] = self._evaluate_position(end["out_of_theory_fen"])
        return context

    def _evaluate_position(self, fen: str) -> Optional[dict]:
        """Evalúa una posición con Stockfish (0.1s/move) para respaldar los
        momentos críticos. Devuelve {"cp": int, "best_move": str} o None si el
        motor no está disponible. Nunca lanza: la teórica guiada depende solo del libro."""
        try:
            import chess
            import chess.engine

            engine = chess.engine.SimpleEngine.popen_uci(settings.STOCKFISH_PATH)
            try:
                board = chess.Board(fen)
                info = engine.analyse(board, chess.engine.Limit(time=0.1))
                score = info["score"].white()
                if score.is_mate():
                    cp = 10000 if score.mate() > 0 else -10000
                else:
                    cp = score.score()
                best_move = None
                pv = info.get("pv")
                if pv:
                    best_move = board.san(pv[0])
                return {"cp": int(cp), "best_move": best_move}
            finally:
                engine.quit()
        except Exception as e:
            logger.debug(f"No se pudo evaluar con Stockfish ({fen}): {e}")
            return None

    def _get_guided_opening_system_prompt(self) -> str:
        return """
ACTÚAS COMO UN GRAN MAESTRO Y ENTRENADOR PEDAGÓGICO DE AJEDREZ.
Tu tarea es analizar el PGN adjunto, explicar qué se pretende con la jugada
que sacó al alumno del libro de aperturas y auditar la contestación que el
alumno redacta sobre sus intenciones con esa jugada.

RECIBIRÁS:
1. La partida completa en PGN.
2. El Punto de Pausa Principal: el FEN exacto y la jugada donde el alumno
   salió de la teórica (detectado con el libro de aperturas PolyGlot).
3. La evaluación de Stockfish de la posición de salida de la teórica
   (si el motor estuvo disponible) y las mejores alternativas.
4. La CONTESTACIÓN del alumno (un ÚNICO texto) a la pregunta:
   "¿Qué pretendías conseguir con la jugada de salida de la teoría?".

ESTILO PEDAGÓGICO (OBLIGATORIO):
- Explica SIEMPRE el PORQUÉ de cada afirmación, mencionando las piezas, casillas
  y amenazas concretas de ESA posición. Evita frases telegráficas o imperativos
  sueltos sin justificación.
- tutor_feedback.conceptual_error: 2-4 frases detalladas que citen la jugada
  de salida, las casillas clave (p. ej. la debilidad de f2, la diagonal del alfil)
  y por qué el razonamiento del alumno es insuficiente.
- tutor_feedback.takeaway_lesson: expresa el PRINCIPIO subyacente de la jugada
  (qué ventaja busca, qué debilidad cuida y por qué) en una regla de oro memorable
  aplicable a futuras partidas (no una lista de jugadas).
- general_ai_analysis.strategic_plans: cada plan de la lista debe constar de
  2-3 frases explicando: (1) el objetivo estratégico, (2) la maniobra concreta
  de piezas con sus casillas, y (3) el porqué / qué amenaza o defiende. Nunca
  apuntes ítems sueltos o telegráficos.

PROCEDIMIENTO (clave):
a) Determina TÚ primero qué se pretende realmente con la jugada de salida
   de la teórica: razona la idea/temática de esa jugada con el PGN, los FEN
   y la evaluación de Stockfish. NO te limites a lo que escriba el alumno.
b) Audita después la contestación del alumno comparándola con esa idea real.
c) Si la contestación es vaga, imprecisa, errónea o está vacía, considera
   is_user_analysis_sufficient=false y explica con claridad el fallo.
   Si está vacía, sustituye su respuesta por la explicación correcta del
   propósito de la jugada.

ESTRUCTURA OBLIGATORIA DE SALIDA:
Genera EXCLUSIVAMENTE un JSON válido con este esquema exacto (es un CONTRATO
de estructura: usa ÚNICAMENTE estas claves y sus nombres tal cual, sin añadir
ni omitir ninguna):

{
  "eco_code": "String (ej: C89)",
  "opening_name": "String (Nombre de la apertura y variante)",
  "is_user_analysis_sufficient": boolean,
  "tutor_feedback": {
    "user_summary": "Resumen de la idea expresada por el alumno",
    "conceptual_error": "Explicación detallada y argumentada de por qué su razonamiento es erróneo o incompleto",
    "takeaway_lesson": "Principio estratégico claro y desarrollado que debe recordar"
  },
  "general_ai_analysis": {
    "summary": "Resumen técnico de la partida",
    "critical_moments": [
      {
        "ply": int,
        "san_move": "String",
        "eval_change": "Float",
        "explanation": "Explicación de la jugada crítica vinculada al motivo táctico o estratégico"
      }
    ],
    "strategic_plans": ["Lista de 2 a 3 planes estratégicos, cada uno desarrollado en 2-3 frases con objetivo, maniobra y porqué"]
  }
}

DOBLE CAPA DE ANÁLISIS (CLAVE):
- Capa A (tutor_feedback): feedback PEDAGÓGICO del tutor sobre la contestación
  del alumno (qué pretendía con la jugada de salida). Tiene 3 puntos obligatorios:
    a) user_summary: qué entendió el jugador: recoge la idea que expresó en su
       contestación (si está vacía, indícalo y resume la idea correcta).
    b) conceptual_error: error conceptual: explicación de la falla estratégica/táctica
       respaldada por el motor (cita la jugada de salida y jugadas concretas del PGN).
    c) takeaway_lesson: regla de oro / lección a recordar: principio pedagógico
       sobre el propósito de la jugada de salida para futuras partidas.
  Si la contestación del alumno es incorrecta, vaga o insuficiente, NO respondas
  con una negativa escueta: explica con claridad y concreción qué falló y por qué.
- Capa B (general_ai_analysis): análisis general de la IA, LIMPIO y técnico, con
  los momentos críticos de Stockfish y las mejores alternativas. No se mezcla con
  la corrección pedagógica del alumno.

IDENTIFICACIÓN TEÓRICA:
- eco_code: código ECO de la apertura (p. ej. "C89").
- opening_name: nombre oficial de la apertura y la variante en español
  (p. ej. "Ruy López: Ataque Marshall").
- En critical_moments, ply es el semicompás (ply) de la jugada en la partida,
  san_move su notación SAN, eval_change la variación de evaluación en centipawns
  respecto a la jugada anterior, y explanation una frase clara.

Sé severo pero constructivo y pedagógico. Responde SOLO el JSON, con exactamente la estructura
descrita, y nada más. Nunca dejes el JSON a medias.
"""

    def _build_guided_opening_user_prompt(
        self,
        pgn: str,
        white_player: str,
        black_player: str,
        analysis_data: GameAnalysisCreate,
        player_username: Optional[str] = None,
        user_side: Optional[str] = None,
        theory_context: Optional[dict] = None,
    ) -> str:
        conclusiones = analysis_data.conclusiones_plan

        user_context_line = ""
        if player_username or user_side:
            side_str = f"las {user_side}" if user_side else "el bando correspondiente"
            nick_str = f" con nick/usuario '{player_username}'" if player_username else ""
            user_context_line = f"\nIMPORTANTE: El usuario a evaluar es el jugador de {side_str}{nick_str}.\n"

        theory_lines = self._format_theory_context(theory_context)

        deviation = (theory_context or {}).get("deviation_move")
        contestacion_label = (
            f"¿Qué pretendías conseguir con la jugada {deviation} tras salir del "
            "libro de aperturas?"
            if deviation
            else "¿Qué pretendías conseguir con tu última jugada?"
        )

        return f"""
PARTIDA (PGN):
{pgn}

JUGADORES:
- Blancas: {white_player}
- Negras: {black_player}
{user_context_line}
CONTEXTO DE LA TEÓRICA (libro de aperturas PolyGlot):
{theory_lines}
CONTESTACIÓN DEL ALUMNO sobre la jugada de salida de la teoría
({contestacion_label}):
{conclusiones.plan_estrategico}

---
Procede en dos pasos: 1) explica qué se pretende realmente con la jugada de
salida de la teoría en esta posición; 2) audita la contestación del alumno
comparándola con esa idea. Genera tu respuesta en el JSON estricto solicitado
(eco_code, opening_name, is_user_analysis_sufficient, tutor_feedback y
general_ai_analysis).
"""

    def _format_theory_context(self, theory_context: Optional[dict]) -> str:
        """Formatea el contexto de la teórica para incluirlo en el prompt de Gemini."""
        if not theory_context:
            return "- No se pudo detectar el contexto de apertura (partida vacía o ilegible)."
        end = theory_context.get("end_of_theory") or {}
        san_moves = theory_context.get("san_moves") or []
        if end.get("end_ply") is None:
            msg = end.get("message", "Sin salida de teórica detectada")
            return (
                f"- Número de jugadas SAN: {len(san_moves)}\n"
                f"- {msg}"
            )
        stockfish_lines = "- Eval de Stockfish: no disponible."
        sf = theory_context.get("stockfish")
        if sf:
            stockfish_lines = (
                f"- Eval de Stockfish (centipawns, favor de blancas): {sf['cp']}\n"
                f"- Mejor jugada según Stockfish: {sf['best_move']}"
            )
        return (
            f"- Número de jugadas SAN: {len(san_moves)}\n"
            f"- Punto de Pausa Principal (fin de la teórica): jugada "
            f"{theory_context.get('move_number')} (ply {theory_context.get('end_ply')}, "
            f"jugada {theory_context.get('deviation_move')})\n"
            f"- Última posición dentro del libro (FEN): {theory_context.get('last_theory_fen')}\n"
            f"- Posición de salida de la teórica (FEN): {theory_context.get('out_of_theory_fen')}\n"
            f"{stockfish_lines}"
        )

    def _get_ai_system_prompt(self) -> str:
        return """
ACTÚA COMO UN GRAN MAESTRO DE AJEDREZ Y TUTOR PEDAGÓGICO DE LA ESCUELA SOVIÉTICA.
El alumno NO ha aportado autodiagnóstico: entrega un ANÁLISIS MAESTRO COMPLETO de la partida.
Tu método: análisis concreto, exigencia de precisión, enfoque en conceptos fundamentales.

RECIBIRÁS:
1. La partida completa en PGN (de un GM o de la propia partida del alumno).
2. Si aplica, el jugador concreto que debe evaluarse (nick/bando).

TAREA:
Genera EXCLUSIVAMENTE un JSON válido con este esquema exacto. CONTRATO OBLIGATORIO de
estructura: usa ÚNICAMENTE estas claves y sus nombres tal cual, sin añadir ni omitir ninguna.
Está PROHIBIDO agregar claves extra (resumen_partida, comentarios, markdown u otros campos).
Todos los bloques y claves deben estar presentes:

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
    "plan_correcto": true,
    "evaluacion_error": "string",
    "razon_insuficiente": "",
    "concepto_reforzar": "string"
  }
}

CÓMO RELLENAR (modo análisis de la partida, sin alumno que corregir):
- feedback_fases:
    * apertura: identifica PRIMERO el código ECO y el nombre de la apertura en español (p. ej. "ECO C65 – Ruy López"), y luego 1-2 frases de comentario pedagógico y concreto.
    * medio_juego / final: 2-3 frases directas con ideas, planes y errores de ambos bandos.
- respuestas_preguntas_criticas: la pieza que más se pudo mejorar en la partida y la amenaza real del rival en el momento crítico, citando jugadas concretas.
- matriz_posicional: tu evaluación de material/rey/espacio con precisión.
- auditoria_conclusiones:
    * plan_correcto: true (no hay diagnóstico del alumno que corregir).
    * evaluacion_error: tu valoración global de la partida (1-3 frases).
    * razon_insuficiente: "" (vacío en modo análisis).
    * concepto_reforzar: la idea o técnica clave que el alumno debe estudiar de esta partida (concreta y estudiable).

CONCISIÓN Y PEDAGOGÍA: cada campo 2-3 frases, directas, con jugadas concretas cuando sea posible; tono pedagógico, con la retórica justa y nada de relleno.
Nunca dejes el JSON a medias: la respuesta DEBE ser un JSON completo y cerrado.
Responde SOLO el JSON, con exactamente los 4 bloques y todas las claves descritas, y nada más.
"""

    def _get_audit_system_prompt(self) -> str:
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
    "razon_insuficiente": "string",
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

CLARIDAD EN EL ERROR (clave):
- Cuando el diagnóstico del alumno sea INCORRECTO o INSUFICIENTE, no te limites a decir
  "incorrecto": explica CLARAMENTE el motivo, con retórica pedagógica, concreta y concisa.
- En cada bloque que corrijas (feedback_fases, respuestas_preguntas_criticas, matriz_posicional),
  si la respuesta del alumno es errónea indica en 1-2 frases QUÉ dijo mal y CUÁL es el punto correcto,
  citando la jugada o el concepto concreto.
- En feedback_fases.apertura, cuando la respuesta del alumno sobre la apertura sea errónea o
  incompleta, corrige citando el código ECO y el nombre en español de la apertura (p. ej.
  "ECO C65 – Ruy López"). NO le pidas al alumno que identifique el ECO: es parte de tu corrección.
- En auditoria_conclusiones:
    * plan_correcto: true si el plan estratégico del alumno es acertado; false en caso contrario.
    * evaluacion_error: veredicto breve (1 frase) sobre el error conceptual.
    * razon_insuficiente: OBLIGATORIO y detallado SOLO cuando plan_correcto es false. Debe explicar
      el error con esta estructura: (a) qué afirmó el alumno, (b) qué ocurre realmente en la posición,
      (c) la jugada o el concepto concreto que lo demuestra, (d) por qué es insuficiente. Usa 3-5 frases.
      Si plan_correcto es true, déjalo como "".
    * concepto_reforzar: la idea o técnica concreta y estudiable que debe repasar el alumno.

CONCISIÓN:
- Los bloques feedback_fases / respuestas_preguntas_criticas / matriz_posicional: MÁXIMO 2-3 frases cada uno.
- razon_insuficiente (solo si hay error) es la EXCEPCIÓN y puede usar 3-5 frases para ser claro: no lo recortes.
- Prohibido rodearse con preámbulos, rellenos o párrafos extensos fuera de lo indicado.
- El JSON completo debe caber holgadamente en la ventana de tokens de salida.
- Nunca dejes el JSON a medias: la respuesta DEBE ser un JSON completo y cerrado.

Sé severo pero constructivo. Responde SOLO el JSON, con exactamente los 4 bloques y todas las claves descritas, y nada más.
"""

    def _is_form_empty(self, data: GameAnalysisCreate) -> bool:
        """Devuelve True si todos los campos de autodiagnóstico del alumno están vacíos."""
        campos = [
            data.fases_analisis.apertura,
            data.fases_analisis.medio_juego,
            data.fases_analisis.final,
            data.momentos_criticos.pieza_a_mejorar,
            data.momentos_criticos.amenaza_rival,
            data.factores_posicionales.material,
            data.factores_posicionales.seguridad_rey,
            data.factores_posicionales.espacio,
            data.conclusiones_plan.plan_estrategico,
            data.conclusiones_plan.error_conceptual_grave,
            data.conclusiones_plan.idea_a_repasar,
        ]
        return all((c or "").strip() == "" for c in campos)

    def _resolve_mode(self, data: GameAnalysisCreate) -> str:
        """Calcula el modo efectivo de análisis: 'ai', 'self_audit' o 'guided_opening'.

        - analysis_mode 'ai'             -> análisis de la partida por el GM (sin comentarios).
        - analysis_mode 'self_audit'     -> auditar el autodiagnóstico del alumno.
        - analysis_mode 'guided_opening' -> Partida Guiada de Apertura (auditoría tras salir de la teórica).
        - analysis_mode 'auto'           -> si el formulario está vacío -> 'ai'; si tiene contenido -> 'self_audit'.
        """
        modo = (getattr(data, "analysis_mode", None) or "auto").strip().lower()
        if modo == "ai":
            return "ai"
        if modo == "self_audit":
            return "self_audit"
        if modo == "guided_opening":
            return "guided_opening"
        # auto
        return "ai" if self._is_form_empty(data) else "self_audit"

    def _build_user_prompt(
        self,
        pgn: str,
        white_player: str,
        black_player: str,
        analysis_data: GameAnalysisCreate,
        player_username: Optional[str] = None,
        user_side: Optional[str] = None,
        mode: str = "audit",
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

        if mode == "ai":
            mode_line = (
                "MODO: ANÁLISIS DE LA PARTIDA por el Gran Maestro (el alumno no aporta "
                "autodiagnóstico; entrega tu análisis maestro completo de la partida).\n"
            )
        else:
            mode_line = (
                "MODO: AUDITORÍA del autodiagnóstico del alumno (compara su respuesta con la "
                "realidad de la partida y corrige con claridad cuando se equivoque).\n"
            )

        return f"""
PARTIDA (PGN):
{pgn}

JUGADORES:
- Blancas: {white_player}
- Negras: {black_player}
{user_context_line}
{mode_line}
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
