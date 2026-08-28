import io
import logging
import os
from typing import Dict, List, Optional

import chess
import chess.pgn
import chess.polyglot

logger = logging.getLogger("EntrenadorIA")

BOOK_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "Perfect2023.bin")


class TheoryService:
    """Consulta el libro de aperturas PolyGlot y detecta el fin de la teoría."""

    def __init__(self, book_path: str = BOOK_PATH):
        self.book_path = book_path

    # ------------------------------------------------------------------ #
    # Lectura del libro
    # ------------------------------------------------------------------ #

    def get_main_moves(
        self, board: chess.Board, max_moves: int = 5
    ) -> List[Dict]:
        """Devuelve las jugadas teóricas para la posición actual según PolyGlot."""
        if not os.path.exists(self.book_path):
            return []
        moves: List[Dict] = []
        try:
            with chess.polyglot.open_reader(self.book_path) as reader:
                entries = list(reader.find_all(board))
                entries.sort(key=lambda e: e.weight, reverse=True)
                for entry in entries[:max_moves]:
                    moves.append(
                        {
                            "san": board.san(entry.move),
                            "uci": entry.move.uci(),
                            "weight": entry.weight,
                        }
                    )
        except Exception:
            return []
        return moves

    def is_in_theory(
        self, board: chess.Board, min_weight: int = 1
    ) -> bool:
        """Comprueba si la posición tiene entradas en el libro con peso suficiente."""
        moves = self.get_main_moves(board)
        return len(moves) > 0 and moves[0]["weight"] >= min_weight

    # ------------------------------------------------------------------ #
    # Detección del fin de la teoría
    # ------------------------------------------------------------------ #

    def find_end_of_theory(self, pgn_moves: List[str]) -> Dict:
        """Recorre una secuencia de jugadas SAN y devuelve el FEN exacto
        y la jugada donde se rompe la teoría del libro.

        Si toda la partida está en el libro o es demasiado corta, devuelve
        ``{"end_ply": None, "message": "..."}``.
        """
        board = chess.Board()
        last_theory_fen = board.fen()

        for ply, move_san in enumerate(pgn_moves):
            was_in_theory = self.is_in_theory(board)
            move = board.parse_san(move_san)
            board.push(move)

            if was_in_theory and not self.is_in_theory(board):
                return {
                    "end_ply": ply + 1,
                    "move_number": (ply // 2) + 1,
                    "deviation_move": move_san,
                    "last_theory_fen": last_theory_fen,
                    "out_of_theory_fen": board.fen(),
                }
            last_theory_fen = board.fen()

        return {
            "end_ply": None,
            "message": "Toda la partida está en el libro o es demasiado corta",
        }

    # ------------------------------------------------------------------ #
    # Helpers PGN → lista de jugadas SAN
    # ------------------------------------------------------------------ #

    @staticmethod
    def extract_san_moves(pgn_text: str) -> List[str]:
        """Extrae la lista ordenada de jugadas en notación SAN de un PGN."""
        if not pgn_text or not pgn_text.strip():
            return []
        cleaned = pgn_text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        game = chess.pgn.read_game(io.StringIO(cleaned))
        if game is None:
            return []

        moves: List[str] = []
        board = game.board()
        for move in game.mainline_moves():
            moves.append(board.san(move))
            board.push(move)
        return moves

    @staticmethod
    def extract_move_numbers(pgn_text: str) -> List[str]:
        """Devuelve las jugadas con número de jugada (ej. '1. e4 e5 2. Nf3 ...')."""
        moves = TheoryService.extract_san_moves(pgn_text)
        if not moves:
            return []
        pairs: List[str] = []
        for i in range(0, len(moves), 2):
            move_num = (i // 2) + 1
            parts = [f"{move_num}. {moves[i]}"]
            if i + 1 < len(moves):
                parts.append(moves[i + 1])
            pairs.append(" ".join(parts))
        return pairs


theory_service = TheoryService()
