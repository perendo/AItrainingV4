# scripts/import_lichess_pgns.py
import sys
import re
import argparse
from pathlib import Path

# Ajustar sys.path para incluir la raíz del proyecto
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import chess
import chess.pgn

import app.db.base  # noqa: F401  (registra todos los modelos)
from app.db.session import SessionLocal
from app.models.endgame import EndgameLesson, LessonCategory

PGN_DIR = PROJECT_ROOT / "data" / "pgn"

LESSON_NUMBER_RE = re.compile(r"Final\s*(\d+)", re.IGNORECASE)


def _read_pgn_text(path: Path) -> str:
    """Lee un PGN exportado de Lichess respetando su codificación.

    Los estudios de Lichess se exportan en **UTF-8** (formato Export del
    estándar PGN). Se intenta UTF-8 estricto y solo se recurre a cp1252 si el
    archivo no es UTF-8 válido (p. ej. PGN guardados desde editores Windows).
    Decodificar UTF-8 como cp1252 producía mojibake ("PeÃ³n" en vez de
    "Peón") que se almacenaba en la BD y rompía la síntesis de voz.
    """
    with open(path, "rb") as f:
        raw = f.read()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")


def infer_category(board: chess.Board) -> LessonCategory:
    """Infiere la categoría del final a partir del material de la posición FEN."""
    pieces = board.piece_map().values()
    has_queen = any(p.piece_type == chess.QUEEN for p in pieces)
    has_rook = any(p.piece_type == chess.ROOK for p in pieces)
    has_minor = any(p.piece_type in (chess.BISHOP, chess.KNIGHT) for p in pieces)
    has_pawn = any(p.piece_type == chess.PAWN for p in pieces)
    if has_queen:
        return LessonCategory.DAMAS
    if has_rook:
        return LessonCategory.TORRES
    if has_minor:
        return LessonCategory.PIEZAS_MENORES
    if has_pawn:
        return LessonCategory.PEONES
    return LessonCategory.PEONES


def build_main_line(game: chess.pgn.Game) -> list:
    """Recorre la variante principal (gamebook) y devuelve la lista de SAN."""
    board = game.board()
    san_list = []
    for move in game.mainline_moves():
        san_list.append(board.san(move))
        board.push(move)
    return san_list


def _walk_variation(node: chess.pgn.ChildNode, board: chess.Board) -> list:
    """Recorre una línea de variación (y sus subvariantes) de forma recursiva.

    Para cada jugada se registra: SAN, UCI, ply, lado que mueve, el comentario
    teórico (`node.comment`), las valoraciones NAG (`node.nags`) y las variantes
    alternativas (`node.parent.variations[1:]`).
    """
    moves = []
    cur = node
    b = board.copy()
    while cur is not None:
        try:
            san = b.san(cur.move)
        except Exception:
            san = cur.move.uci()

        entry = {
            "san": san,
            "uci": cur.move.uci(),
            "ply": b.ply() + 1,
            "turn": "w" if b.turn == chess.WHITE else "b",
            "comment": cur.comment or "",
            "nags": sorted(cur.nags),
            "variations": [],
        }

        # Variantes alternativas: sólo los hermanos posteriores al nodo actual
        # (evita ciclos y no re-incluye la línea principal ni el propio nodo).
        siblings = cur.parent.variations
        for sib in siblings[siblings.index(cur) + 1:]:
            entry["variations"].append(_walk_variation(sib, b))

        moves.append(entry)
        b.push(cur.move)
        cur = cur.next()

    return moves


def build_theory_tree(game: chess.pgn.Game):
    """Devuelve (initial_comment, theory_tree, final_comment, main_line_san)."""
    initial_comment = game.comment or ""
    board = game.board()
    mainline = (
        _walk_variation(game.variations[0], board)
        if game.variations
        else []
    )
    final_comment = mainline[-1]["comment"] if mainline else ""
    main_line = [m["san"] for m in mainline]
    return initial_comment, mainline, final_comment, main_line


def parse_pgn_files(pgn_dir: Path):
    """Procesa todos los .pgn y devuelve una lista de dicts listos para upsert."""
    pgn_files = sorted(pgn_dir.glob("*.pgn"))
    if not pgn_files:
        print(f"[WARN] No se encontraron archivos .pgn en {pgn_dir}")
        return []

    records = []
    # Contador de diagramas por número de final para generar slugs únicos.
    diag_counts: dict[int, int] = {}

    for path in pgn_files:
        print(f"[INFO] Procesando {path.name} ...")
        text = _read_pgn_text(path)
        # chess.pgn acepta un stream de texto.
        import io

        stream = io.StringIO(text)
        while True:
            game = chess.pgn.read_game(stream)
            if game is None:
                break

            white = game.headers.get("White", "") or ""
            fen = game.headers.get("FEN")
            black = game.headers.get("Black", "") or ""
            chapter_name = game.headers.get("ChapterName", "") or ""

            m = LESSON_NUMBER_RE.search(white)
            # Solo son lecciones los capítulos con número de final y FEN propia.
            if not m or not fen:
                continue

            lesson_number = int(m.group(1))

            try:
                board = chess.Board(fen)
            except ValueError:
                print(f"  [WARN] FEN inválido en '{chapter_name}': {fen}")
                continue

            diag_counts[lesson_number] = diag_counts.get(lesson_number, 0) + 1
            if diag_counts[lesson_number] == 1:
                slug = f"final-{lesson_number}"
            else:
                slug = f"final-{lesson_number}-diag-{diag_counts[lesson_number] - 1}"

            title = chapter_name or f"Final {lesson_number} - {black}"
            concept = black
            category = infer_category(board)
            main_line = build_main_line(game)
            (
                initial_comment,
                theory_tree,
                final_comment,
                theory_main_line,
            ) = build_theory_tree(game)

            exporter = chess.pgn.StringExporter(
                headers=True, variations=True, comments=True
            )
            pgn_content = game.accept(exporter)

            records.append(
                {
                    "slug": slug,
                    "lesson_number": lesson_number,
                    "chapter_name": chapter_name,
                    "concept": concept,
                    "title": title,
                    "category": category,
                    "difficulty": "intermedio",
                    "target_result": "win",
                    "initial_fen": fen,
                    "pgn_content": pgn_content,
                    "main_line": main_line,
                    "initial_comment": initial_comment,
                    "theory_tree": theory_tree,
                    "final_comment": final_comment,
                }
            )

    return records


def upsert_lessons(records, dry_run: bool = False):
    db = SessionLocal()
    inserted = 0
    updated = 0
    try:
        for rec in records:
            existing = (
                db.query(EndgameLesson)
                .filter(EndgameLesson.slug == rec["slug"])
                .first()
            )
            if existing:
                for key, value in rec.items():
                    setattr(existing, key, value)
                updated += 1
            else:
                lesson = EndgameLesson(**rec)
                db.add(lesson)
                inserted += 1
            if not dry_run:
                db.commit()
        if dry_run:
            db.rollback()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print("\nResumen de importación de finales de Lichess:")
    print(f"   - Total de registros parseados: {len(records)}")
    print(f"   - Insertados nuevos: {inserted}")
    print(f"   - Actualizados: {updated}")
    if dry_run:
        print("   - MODO DRY-RUN: no se escribió nada en la base de datos.")


def main():
    parser = argparse.ArgumentParser(
        description="Importa los 100 finales de Jesús de la Villa desde los PGN de Lichess."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo parsea y valida, sin hacer commit en la base de datos.",
    )
    args = parser.parse_args()

    records = parse_pgn_files(PGN_DIR)
    if not records:
        return
    upsert_lessons(records, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
