# tests/test_endpoints_openings.py
"""Tests del endpoint POST /api/v1/openings/book-move (libro de aperturas).

No requiere autenticación (como /endgames/stockfish-move). El libro
Perfect2023.bin debe existir en app/data/ (los tests de teoría ya lo requieren).
"""
import chess

START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

# Posición tras 1. e4: las negras deben tener e5 como jugada principal.
AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"

# Posición tras 1. e4 e5: las blancas deben tener Nf3 como jugada principal.
AFTER_E4_E5_FEN = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 2 2"


def test_book_move_start_position(client):
    resp = client.post("/api/v1/openings/book-move", json={"fen": START_FEN})
    assert resp.status_code == 200
    data = resp.json()
    assert data["in_theory"] is True
    assert len(data["moves"]) >= 1
    assert data["moves"][0]["san"] == "e4"
    assert data["moves"][0]["uci"] == "e2e4"
    assert data["moves"][0]["weight"] > 0
    assert data["best_move"]["san"] == "e4"
    # fen_after debe ser la posición tras 1. e4
    board = chess.Board()
    board.push_uci("e2e4")
    assert data["fen_after"] == board.fen()
    assert data["fen_after"] == AFTER_E4_FEN


def test_book_move_main_line(client):
    resp = client.post("/api/v1/openings/book-move", json={"fen": AFTER_E4_FEN})
    assert resp.status_code == 200
    data = resp.json()
    assert data["in_theory"] is True
    assert data["best_move"]["san"] == "e5"


def test_book_move_max_moves_limits(client):
    resp = client.post(
        "/api/v1/openings/book-move", json={"fen": START_FEN, "max_moves": 2}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["moves"]) <= 2


def test_book_move_after_long_book_line(client):
    # Línea de la Ruy López (Morphy) verificada en el libro: 3. Bb5 a6
    fen = "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4"
    resp = client.post("/api/v1/openings/book-move", json={"fen": fen})
    assert resp.status_code == 200
    data = resp.json()
    assert data["in_theory"] is True
    assert data["best_move"]["san"] == "Ba4"


def test_book_move_out_of_theory(client):
    # Posición absurda sin jugadas teóricas: no debe ser "en teoría".
    fen = "k7/8/8/8/8/8/8/K7 w - - 0 1"
    resp = client.post("/api/v1/openings/book-move", json={"fen": fen})
    assert resp.status_code == 200
    data = resp.json()
    assert data["in_theory"] is False
    assert data["moves"] == []
    assert data["best_move"] is None
    assert data["fen_after"] is None


def test_book_move_min_weight_high_excludes(client):
    # Subir min_weight por encima del peso de la posición inicial debe
    # devolver in_theory False incluso habiendo entradas en el libro.
    resp = client.post(
        "/api/v1/openings/book-move",
        json={"fen": START_FEN, "min_weight": 999999},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["in_theory"] is False
    assert len(data["moves"]) >= 1  # Las entradas siguen ahí, solo cambia el umbral.


def test_book_move_invalid_fen_400(client):
    resp = client.post("/api/v1/openings/book-move", json={"fen": "no-fen"})
    assert resp.status_code == 400
    assert "FEN" in resp.json()["detail"]


def test_router_registered(client):
    # El endpoint debe estar registrado en el router con prefijo /api/v1/openings.
    resp = client.post("/api/v1/openings/book-move", json={"fen": START_FEN})
    assert resp.status_code == 200