# app/api/v1/endpoints_openings.py
import chess
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.theory_service import theory_service

router = APIRouter()


class BookMoveRequest(BaseModel):
    """Consulta al libro de aperturas (PolyGlot) para una posición dada."""
    fen: str
    min_weight: int = Field(default=1, ge=0, description="Peso mínimo de la jugada principal para contar como 'en teoría'")
    max_moves: int = Field(default=5, ge=1, le=10, description="Número máximo de jugadas teóricas a devolver")


class BookMoveItem(BaseModel):
    san: str
    uci: str
    weight: int


class BookMoveResponse(BaseModel):
    """Jugadas teóricas de la posición, la mejor jugada y si la posición está en teoría."""
    in_theory: bool
    moves: List[BookMoveItem]
    best_move: Optional[BookMoveItem] = None
    fen_after: Optional[str] = None


@router.post(
    "/book-move",
    response_model=BookMoveResponse,
    summary="Jugadas del libro de aperturas para un FEN (Partidas Guiadas de Apertura)"
)
def book_move(req: BookMoveRequest):
    try:
        board = chess.Board(req.fen)
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"FEN inválido: {e}")

    moves = theory_service.get_main_moves(board, max_moves=req.max_moves)

    in_theory = theory_service.is_in_theory(board, min_weight=req.min_weight)

    best_move: Optional[BookMoveItem] = None
    fen_after: Optional[str] = None
    if moves:
        best = moves[0]
        best_move = BookMoveItem(san=best["san"], uci=best["uci"], weight=best["weight"])
        try:
            board.push_uci(best["uci"])
            fen_after = board.fen()
        except (ValueError, TypeError):
            fen_after = None

    return BookMoveResponse(
        in_theory=in_theory,
        moves=[BookMoveItem(san=m["san"], uci=m["uci"], weight=m["weight"]) for m in moves],
        best_move=best_move,
        fen_after=fen_after,
    )