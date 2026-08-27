import io
from pathlib import Path

import chess
import chess.pgn

# El módulo de importación ahora vive en el paquete del backend.
from app.services import endgame_admin_service as import_lichess_pgns


SAMPLE_PGN = (
    '[White "Final 1"]\n'
    '[Black "El Cuadrado del Peon"]\n'
    '[ChapterName "Final 1 - El Cuadrado del Peon"]\n'
    '[FEN "6k1/8/8/8/8/8/P7/7K w - - 0 1"]\n'
    '\n'
    '{intro texto} 1. a4 $1 {despues de a4} (1. a3 {alternativa}) Kf7 '
    '2. a5 {final coment} 1-0\n'
)


def _parse_sample():
    game = chess.pgn.read_game(io.StringIO(SAMPLE_PGN))
    return game


def test_build_theory_tree_extracts_comments_nags_variations():
    game = _parse_sample()
    initial_comment, theory_tree, final_comment, main_line = (
        import_lichess_pgns.build_theory_tree(game)
    )

    assert initial_comment == "intro texto"
    assert main_line == ["a4", "Kf7", "a5"]
    assert final_comment == "final coment"

    assert isinstance(theory_tree, list)
    assert theory_tree[0]["san"] == "a4"
    assert theory_tree[0]["nags"] == [1]
    assert theory_tree[0]["comment"] == "despues de a4"
    # Variante alternativa como primer movimiento.
    assert theory_tree[0]["variations"][0][0]["san"] == "a3"
    assert theory_tree[0]["variations"][0][0]["comment"] == "alternativa"


def test_walk_variation_does_not_recurse_infinitely():
    game = _parse_sample()
    tree = import_lichess_pgns._walk_variation(
        game.variations[0], game.board()
    )
    # Debe terminar sin RecursionError y tener exactamente 3 jugadas.
    assert len(tree) == 3
    assert tree[-1]["san"] == "a5"


def test_infer_category_by_material():
    assert (
        import_lichess_pgns.infer_category(
            chess.Board("8/8/8/4q3/8/8/8/4K3 w - - 0 1")
        )
        == import_lichess_pgns.LessonCategory.DAMAS
    )
    assert (
        import_lichess_pgns.infer_category(
            chess.Board("8/8/8/4r3/8/8/8/4K3 w - - 0 1")
        )
        == import_lichess_pgns.LessonCategory.TORRES
    )
    assert (
        import_lichess_pgns.infer_category(
            chess.Board("8/8/8/4n3/8/8/8/4K3 w - - 0 1")
        )
        == import_lichess_pgns.LessonCategory.PIEZAS_MENORES
    )
    assert (
        import_lichess_pgns.infer_category(
            chess.Board("6k1/8/8/8/8/8/P7/7K w - - 0 1")
        )
        == import_lichess_pgns.LessonCategory.PEONES
    )

