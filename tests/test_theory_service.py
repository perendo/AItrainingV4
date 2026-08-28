# tests/test_theory_service.py
import chess
import pytest
from unittest.mock import patch

from app.services.theory_service import (
    TheoryService,
    BOOK_PATH,
)


# --- PGNs de prueba ------------------------------------------------------- #

PGN_RUY_LOPEZ_SALE_DE_LIBRO = """
[Event "Test"]
[White "Alumno"]
[Black "Rival"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7
6. Re1 b5 7. Bb3 O-O 8. c3 d6 9. h3 Nb8 10. d4 Nbd7
11. c4 bxc4 12. Bxc4 *
"""

# Línea de Marshall: 1.e4 e5 2.Nf3 Nc6 3.Bb5 Nf6 4.O-O Nxe4 ...
# Toda la secuencia mostrada sigue dentro del libro (no hay desvío).
PGN_TODO_EN_LIBRO = """
1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4 5. d4 Nd6
6. Bxc6 dxc6 7. dxe5 Nf5 8. Qxd8+ Kxd8
"""

# Apertura no teórica desde la primera jugada
PGN_DESDE_EL_INICIO_FUERA = """
1. a4 h5 2. a5 h4
"""

PGN_BARBAS = """
```
1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5
```
"""


class TestTheoryServiceLibro:
    def setup_method(self):
        # Creo una instancia apuntando al libro real del repo
        self.svc = TheoryService(book_path=BOOK_PATH)

    def test_get_main_moves_posicion_inicial(self):
        board = chess.Board()
        moves = self.svc.get_main_moves(board)
        assert len(moves) > 0
        assert all({"san", "uci", "weight"} <= set(m.keys()) for m in moves)
        # Las jugadas vienen ordenadas por peso (mayor primero)
        assert moves[0]["weight"] >= moves[-1]["weight"]
        assert moves[0]["san"] in {"e4", "d4", "c4", "Nf3", "g3", "b3", "Nc3", "e3"}

    def test_get_main_moves_posicion_canonica_ruy_lopez(self):
        board = chess.Board()
        for mv in ["e4", "e5", "Nf3", "Nc6", "Bb5"]:
            board.push_san(mv)
        moves = self.svc.get_main_moves(board)
        assert moves[0]["san"] == "a6"

    def test_is_in_theory_posicion_inicial(self):
        assert self.svc.is_in_theory(chess.Board()) is True

    def test_is_in_theory_posicion_no_libro(self):
        board = chess.Board()
        board.push_san("a4")  # a4 no está en el libro
        assert self.svc.is_in_theory(board) is False

    def test_find_end_of_theory_detecta_salida(self):
        moves = TheoryService.extract_san_moves(PGN_RUY_LOPEZ_SALE_DE_LIBRO)
        result = self.svc.find_end_of_theory(moves)
        assert result["end_ply"] is not None
        assert result["end_ply"] > 0
        # El FEN de salida debe ser legal: se reconstruye hasta el ply previo
        board = chess.Board()
        for i, san in enumerate(moves):
            if i + 1 >= result["end_ply"]:
                break
            board.push_san(san)
        assert result["last_theory_fen"] == board.fen()
        board.push_san(result["deviation_move"])
        assert result["out_of_theory_fen"] == board.fen()

    def test_find_end_of_theory_salida_tras_salir(self):
        moves = TheoryService.extract_san_moves(PGN_RUY_LOPEZ_SALE_DE_LIBRO)
        result = self.svc.find_end_of_theory(moves)
        # La posición de salida ya NO está en el libro
        board = chess.Board(result["out_of_theory_fen"])
        assert self.svc.is_in_theory(board) is False

    def test_find_end_of_theory_toda_partida_en_libro(self):
        moves = TheoryService.extract_san_moves(PGN_TODO_EN_LIBRO)
        result = self.svc.find_end_of_theory(moves)
        assert result["end_ply"] is None
        assert "libro" in result["message"].lower()

    def test_find_end_of_theory_vacia(self):
        result = self.svc.find_end_of_theory([])
        assert result["end_ply"] is None
        assert "demasiado corta" in result["message"].lower()

    def test_find_end_of_theory_fuera_desde_inicio(self):
        moves = TheoryService.extract_san_moves(PGN_DESDE_EL_INICIO_FUERA)
        result = self.svc.find_end_of_theory(moves)
        # 1.a4 saca la partida del libro en el ply 1
        assert result["end_ply"] == 1
        assert result["deviation_move"] == "a4"


class TestTheoryServiceSinLibro:
    def test_get_main_moves_ruta_inexistente(self):
        svc = TheoryService(book_path="ruta/que/no/existe.bin")
        assert svc.get_main_moves(chess.Board()) == []

    def test_is_in_theory_ruta_inexistente(self):
        svc = TheoryService(book_path="ruta/que/no/existe.bin")
        assert svc.is_in_theory(chess.Board()) is False


class TestExtractSanMoves:
    def test_pgn_con_headers(self):
        moves = TheoryService.extract_san_moves(PGN_RUY_LOPEZ_SALE_DE_LIBRO)
        assert moves
        assert moves[0] == "e4"
        assert "Bxc4" in moves

    def test_pgn_con_fences_markdown(self):
        moves = TheoryService.extract_san_moves(PGN_BARBAS)
        assert moves[0] == "e4"
        assert moves[-1] == "b5"

    def test_pgn_vacio(self):
        assert TheoryService.extract_san_moves("") == []
        assert TheoryService.extract_san_moves(None) == []
        assert TheoryService.extract_san_moves("   \n  ") == []

    def test_pgn_invalido(self):
        assert TheoryService.extract_san_moves("esto no es un pgn") == []

    def test_extract_move_numbers(self):
        nums = TheoryService.extract_move_numbers(PGN_BARBAS)
        assert nums[0] == "1. e4 e5"
        assert nums[5] == "6. Re1 b5"


class TestSchemasPartidaGuiada:
    def test_audit_game_analysis_response_valido(self):
        from app.schemas.analysis import AuditGameAnalysisResponse

        payload = {
            "eco_code": "C89",
            "opening_name": "Ruy López: Ataque Marshall",
            "is_user_analysis_sufficient": False,
            "tutor_feedback": {
                "user_summary": "El alumno cree que ganó un peón en la apertura.",
                "conceptual_error": (
                    "En realidad 8...cxd4? dejó su caballo colgado; el peón se "
                    "recupera con 9.Nxd4 y las negras pierden el centro."
                ),
                "takeaway_lesson": (
                    "Antes de capturar material, comprueba siempre la defensa de "
                    "tu pieza más valiosa."
                ),
            },
            "general_ai_analysis": {
                "summary": "Partida equilibrada con una imprecisión negra en c5.",
                "critical_moments": [
                    {
                        "ply": 16,
                        "san_move": "d6",
                        "eval_change": -0.5,
                        "explanation": "El peón pasado de blancas limita el juego negro.",
                    }
                ],
                "strategic_plans": [
                    "Abrir el centro con d4-d5 en el momento oportuno.",
                    "Activar el alfil de casillas oscuras.",
                ],
            },
        }
        parsed = AuditGameAnalysisResponse(**payload)
        assert parsed.eco_code == "C89"
        assert parsed.tutor_feedback.conceptual_error
        assert parsed.general_ai_analysis.critical_moments[0].san_move == "d6"
        assert parsed.general_ai_analysis.critical_moments[0].eval_change == -0.5
        assert len(parsed.general_ai_analysis.strategic_plans) == 2

    def test_audit_game_analysis_response_falta_campo(self):
        from pydantic import ValidationError
        from app.schemas.analysis import AuditGameAnalysisResponse

        payload = {
            "eco_code": "C89",
            "opening_name": "Ruy López",
            "is_user_analysis_sufficient": True,
            "tutor_feedback": {
                "user_summary": "ok",
                "conceptual_error": "ninguno",
                "takeaway_lesson": "repasar",
            },
            "general_ai_analysis": {
                "summary": "resumen",
                "critical_moments": [],
            },
        }
        with pytest.raises(ValidationError):
            AuditGameAnalysisResponse(**payload)

    def test_analysis_mode_acepta_guided_opening(self):
        from app.schemas.analysis import (
            GameAnalysisCreate,
            FasesAnalisis,
            MomentosCriticos,
            FactoresPosicionales,
            ConclusionesPlan,
        )

        data = GameAnalysisCreate(
            game_type="USER",
            analysis_mode="guided_opening",
            pgn=PGN_RUY_LOPEZ_SALE_DE_LIBRO,
            fases_analisis=FasesAnalisis(apertura="a", medio_juego="m", final="f"),
            momentos_criticos=MomentosCriticos(pieza_a_mejorar="x", amenaza_rival="y"),
            factores_posicionales=FactoresPosicionales(material="1", seguridad_rey="2", espacio="3"),
            conclusiones_plan=ConclusionesPlan(plan_estrategico="p", error_conceptual_grave="c", idea_a_repasar="i"),
        )
        assert data.analysis_mode == "guided_opening"

    def test_analysis_mode_invalido_cae_a_auto(self):
        from app.schemas.analysis import (
            GameAnalysisCreate,
            FasesAnalisis,
            MomentosCriticos,
            FactoresPosicionales,
            ConclusionesPlan,
        )

        data = GameAnalysisCreate(
            game_type="USER",
            analysis_mode="modo_inventado",
            pgn=PGN_RUY_LOPEZ_SALE_DE_LIBRO,
            fases_analisis=FasesAnalisis(apertura="a", medio_juego="m", final="f"),
            momentos_criticos=MomentosCriticos(pieza_a_mejorar="x", amenaza_rival="y"),
            factores_posicionales=FactoresPosicionales(material="1", seguridad_rey="2", espacio="3"),
            conclusiones_plan=ConclusionesPlan(plan_estrategico="p", error_conceptual_grave="c", idea_a_repasar="i"),
        )
        assert data.analysis_mode == "auto"


class TestTutorServiceIntegracion:
    def _make_data(self, mode="guided_opening"):
        from app.schemas.analysis import (
            GameAnalysisCreate,
            FasesAnalisis,
            MomentosCriticos,
            FactoresPosicionales,
            ConclusionesPlan,
        )

        return GameAnalysisCreate(
            game_type="USER",
            analysis_mode=mode,
            pgn=PGN_RUY_LOPEZ_SALE_DE_LIBRO,
            white_player="Alumno",
            black_player="Rival",
            player_username="alumno1",
            user_side="White",
            fases_analisis=FasesAnalisis(apertura="Abrí bien con la Ruy López", medio_juego="Domino el centro", final="No llegué"),
            momentos_criticos=MomentosCriticos(pieza_a_mejorar="C4", amenaza_rival="El alfil"),
            factores_posicionales=FactoresPosicionales(material="Igual", seguridad_rey="Segura", espacio="Más espacio"),
            conclusiones_plan=ConclusionesPlan(
                plan_estrategico="Atacar por el flanco de rey",
                error_conceptual_grave="Ninguno",
                idea_a_repasar="Ataque Marshall",
            ),
        )

    @patch("app.services.tutor_service.tutor_gemini_service._evaluate_position", return_value=None)
    def test_build_prompts_guided_opening_incluye_teoria(self, mock_eval):
        from app.services.tutor_service import tutor_gemini_service

        data = self._make_data("guided_opening")
        system_prompt, user_prompt = tutor_gemini_service._build_prompts(
            data.pgn, data.white_player, data.black_player,
            data, data.player_username, data.user_side, "guided_opening",
        )
        assert "Punto de Pausa Principal" in user_prompt
        assert "eco_code" in system_prompt
        assert "tutor_feedback" in system_prompt
        assert "general_ai_analysis" in system_prompt
        assert "FEN" in user_prompt
        # El modo guiado se audita con la contestación ÚNICA del alumno
        # sobre la jugada de salida (no con el formulario de 4 bloques).
        assert "CONTESTACIÓN DEL ALUMNO" in user_prompt
        assert "Atacar por el flanco de rey" in user_prompt
        assert "=== FASES ===" not in user_prompt
        assert "=== MOMENTOS CRÍTICOS ===" not in user_prompt

    def test_resolve_mode_guided_opening(self):
        from app.services.tutor_service import tutor_gemini_service

        data = self._make_data("guided_opening")
        assert tutor_gemini_service._resolve_mode(data) == "guided_opening"

    def test_get_feedback_schema_segun_modo(self):
        from app.schemas.analysis import GeminiFeedback, AuditGameAnalysisResponse
        from app.services.tutor_service import tutor_gemini_service

        assert tutor_gemini_service._get_feedback_schema("guided_opening") is AuditGameAnalysisResponse
        assert tutor_gemini_service._get_feedback_schema("self_audit") is GeminiFeedback
        assert tutor_gemini_service._get_feedback_schema("ai") is GeminiFeedback

    def test_get_theory_context_sin_eval_stockfish(self):
        from app.services.tutor_service import tutor_gemini_service

        with patch.object(tutor_gemini_service, "_evaluate_position", return_value=None):
            context = tutor_gemini_service._get_theory_context(PGN_RUY_LOPEZ_SALE_DE_LIBRO)
            assert context["end_of_theory"]["end_ply"] is not None
            assert context["out_of_theory_fen"]
            assert context["stockfish"] is None

    def test_evaluate_position_no_disponible(self):
        from app.core.config import settings
        from app.services.tutor_service import tutor_gemini_service

        original = settings.STOCKFISH_PATH
        settings.STOCKFISH_PATH = "ruta/que/no/existe.exe"
        try:
            assert tutor_gemini_service._evaluate_position(chess.STARTING_FEN) is None
        finally:
            settings.STOCKFISH_PATH = original