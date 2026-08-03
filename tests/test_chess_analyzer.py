import pytest
import chess
import chess.pgn
import io
from unittest.mock import patch, MagicMock
from app.services.chess_analyzer import ChessAnalyzerService


class TestChessAnalyzer:
    def test_clean_string_normaliza(self):
        svc = ChessAnalyzerService()
        result = svc._clean_string("  PEDRO  ")
        assert result == "pedro"

    def test_clean_string_vacio(self):
        svc = ChessAnalyzerService()
        assert svc._clean_string("") == ""

    def test_clean_string_none(self):
        svc = ChessAnalyzerService()
        assert svc._clean_string(None) == ""

    def test_clean_string_quita_tildes(self):
        svc = ChessAnalyzerService()
        result = svc._clean_string("Rendo Quindós")
        assert result == "rendo quindos"

    def test_clean_string_lowercase(self):
        svc = ChessAnalyzerService()
        result = svc._clean_string("HELLO WORLD")
        assert result == "hello world"

    def test_analyze_moves_detecta_blunder(self):
        svc = ChessAnalyzerService()
        pgn_text = """[Event "Test"]
[White "Pedro"]
[Black "Rival"]
[Result "1-0"]

1. e4 e5 2. Nf3 Qxf2+?? 3. Kxf2 1-0
"""
        pgn_file = io.StringIO(pgn_text)
        game = chess.pgn.read_game(pgn_file)

        mock_engine = MagicMock()
        evals = [
            {"score": MagicMock(white=lambda: MagicMock(score=lambda **kw: 20, is_mate=lambda: False))},
            {"score": MagicMock(white=lambda: MagicMock(score=lambda **kw: 20, is_mate=lambda: False))},
            {"score": MagicMock(white=lambda: MagicMock(score=lambda **kw: -500, is_mate=lambda: False))},
        ]
        mock_engine.analyse.side_effect = evals

        errors = svc._analyze_moves(game, mock_engine, "white")
        assert len(errors) >= 1
        assert errors[0]["error_type"] == "Blunder"

    def test_init_engine(self):
        svc = ChessAnalyzerService()
        engine = svc._init_engine()
        assert engine is not None
        engine.quit()

    @patch("app.services.chess_analyzer.chess_analyzer_service._init_engine")
    def test_process_pgn_stream_partida_unica(self, mock_init, db_session):
        from app.models.user import User
        from app.core.security import hash_password

        user = User(
            username="analyst",
            full_name="Analyst User",
            hashed_password=hash_password("pass123"),
            current_elo=1700,
            target_elo=2000,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        mock_engine = MagicMock()
        evals = []
        for _ in range(20):
            evals.append({"score": MagicMock(white=lambda: MagicMock(score=lambda **kw: 20, is_mate=lambda: False))})
        mock_engine.analyse.side_effect = evals
        mock_init.return_value = mock_engine

        svc = ChessAnalyzerService()
        pgn = """[Event "Test"]
[White "Analyst User"]
[Black "Rival"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0
"""
        stats = svc.process_pgn_stream(db_session, pgn, user)
        assert stats["processed"] >= 1
        assert stats["skipped_not_user"] == 0
