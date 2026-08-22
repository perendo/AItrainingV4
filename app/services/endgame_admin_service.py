# app/services/endgame_admin_service.py
"""Tareas de administración del Módulo de Finales Teóricos.

Centraliza la lógica que antes vivía en scripts sueltos de ``scripts/``
(población y enriquecimiento de ``endgame_lessons``). Se invoca desde el
CLI ``python -m app.cli`` y es importable/testeable como parte del paquete.
"""
import logging
import re
from pathlib import Path

import chess
import chess.pgn

import app.db.base  # noqa: F401  (registra todos los modelos)
from app.db.session import SessionLocal
from app.models.endgame import EndgameLesson, LessonCategory
from app.services.endgame_generator_service import generate_lesson_content
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Directorio donde se guardan los audios (ruta relativa a la carpeta ``app/``)
AUDIO_DIR = Path(__file__).resolve().parent.parent / "static" / "audio" / "endgames"
# Prefijo relativo que se guarda en la columna ``audio_path`` (se sirve vía /static)
AUDIO_PATH_PREFIX = "audio/endgames"

# Voz masculina neuronal para el Gran Maestro (estilo podcast fluido y natural)
VOZ_GM_MASCULINA = "es-ES-AlvaroNeural"

PGN_DIR = Path(__file__).resolve().parent.parent / "data" / "pgn"

BASE_LESSONS = [
    # ── Peones (Jesús de la Villa — 100 finales que hay que saber) ──
    {
        "title": "Regla del Cuadrado",
        "slug": "regla-del-cuadrado",
        "category": LessonCategory.PEONES,
        "difficulty": "principiante",
        "initial_fen": "8/8/8/4k3/8/8/1P6/4K3 w - - 0 1",
        "target_result": "win",
    },
    {
        "title": "Oposición y Casillas Clave",
        "slug": "oposicion-y-casillas-clave",
        "category": LessonCategory.PEONES,
        "difficulty": "principiante",
        "initial_fen": "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1",
        "target_result": "win",
    },
    # ── Torres ──
    {
        "title": "Posición de Lucena (El Puente)",
        "slug": "posicion-lucena",
        "category": LessonCategory.TORRES,
        "difficulty": "intermedio",
        "initial_fen": "1R6/1P1k4/8/8/8/8/2r5/3K4 w - - 0 1",
        "target_result": "win",
    },
    {
        "title": "Posición de Philidor (3ª Fila)",
        "slug": "posicion-philidor",
        "category": LessonCategory.TORRES,
        "difficulty": "intermedio",
        "initial_fen": "7R/8/4k3/8/8/4r3/3R4/4K3 w - - 0 1",
        "target_result": "draw",
    },
    {
        "title": "Posición de Vancura",
        "slug": "posicion-vancura",
        "category": LessonCategory.TORRES,
        "difficulty": "avanzado",
        "initial_fen": "8/8/8/R7/8/p7/1r6/k1K5 w - - 0 1",
        "target_result": "draw",
    },
    # ── Damas ──
    {
        "title": "Dama contra Peón de 7ª (Alfil/Torre)",
        "slug": "dama-contra-peon-7a",
        "category": LessonCategory.DAMAS,
        "difficulty": "avanzado",
        "initial_fen": "8/8/8/8/8/k7/2p5/2K5 w - - 0 1",
        "target_result": "draw",
    },
    # ── Piezas Menores ──
    {
        "title": "Mate de Alfil y Caballo",
        "slug": "mate-alfil-caballo",
        "category": LessonCategory.PIEZAS_MENORES,
        "difficulty": "avanzado",
        "initial_fen": "8/8/8/4k3/8/8/2B5/N3K3 w - - 0 1",
        "target_result": "win",
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# Funciones puras de parseo PGN (importadas por tests/test_import_lichess_pgns)
# ─────────────────────────────────────────────────────────────────────────────

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
    teórico (``node.comment``), las valoraciones NAG (``node.nags``) y las
    variantes alternativas (``node.parent.variations[1:]``).
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
        logger.warning("No se encontraron archivos .pgn en %s", pgn_dir)
        return []

    records = []
    # Contador de diagramas por número de final para generar slugs únicos.
    diag_counts: dict[int, int] = {}

    for path in pgn_files:
        logger.info("Procesando %s ...", path.name)
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
                logger.warning("FEN inválido en '%s': %s", chapter_name, fen)
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


# ─────────────────────────────────────────────────────────────────────────────
# Operaciones sobre la base de datos
# ─────────────────────────────────────────────────────────────────────────────


def seed_lessons(db: Session) -> None:
    """Pobla el catálogo inicial de lecciones en el Módulo de Finales Teóricos."""
    logger.info("Iniciando siembra de lecciones de finales teóricos...")
    inserted_count = 0
    skipped_count = 0

    for data in BASE_LESSONS:
        slug = data["slug"]
        existing = db.query(EndgameLesson).filter(EndgameLesson.slug == slug).first()

        if existing:
            logger.info(
                "La leccion '%s' (slug: %s) ya existe. Omitiendo.", data["title"], slug
            )
            skipped_count += 1
        else:
            lesson = EndgameLesson(
                title=data["title"],
                slug=slug,
                category=data["category"],
                difficulty=data["difficulty"],
                initial_fen=data["initial_fen"],
                target_result=data["target_result"],
            )
            db.add(lesson)
            db.commit()
            logger.info("Leccion insertada: '%s' (%s)", data["title"], slug)
            inserted_count += 1

    logger.info(
        "Siembra de finales completada. Insertadas: %s | Omitidas: %s",
        inserted_count,
        skipped_count,
    )


def upsert_lessons(records, db: Session, dry_run: bool = False) -> None:
    """Inserta o actualiza las lecciones parseadas desde PGN."""
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

    logger.info("Resumen de importación de finales de Lichess:")
    logger.info("   - Total de registros parseados: %s", len(records))
    logger.info("   - Insertados nuevos: %s", inserted)
    logger.info("   - Actualizados: %s", updated)
    if dry_run:
        logger.info("   - MODO DRY-RUN: no se escribió nada en la base de datos.")


async def generate_content_for_all(db: Session) -> None:
    """Recorre las lecciones sin guión y genera su contenido con Gemini."""
    logger.info("Iniciando proceso de generacion de contenido para finales teóricos...")
    lessons = (
        db.query(EndgameLesson)
        .filter(
            (EndgameLesson.podcast_script == None) | (EndgameLesson.podcast_script == "")
        )
        .all()
    )

    if not lessons:
        logger.info("Todas las lecciones ya cuentan con contenido generado.")
        return

    logger.info("%s leccion(es) sin contenido. Procesando...", len(lessons))

    success_count = 0
    error_count = 0

    for lesson in lessons:
        logger.info(
            "Procesando lección ID %s: '%s' (slug: %s)",
            lesson.id,
            lesson.title,
            lesson.slug,
        )
        try:
            await generate_lesson_content(lesson.id, db)
            success_count += 1
        except Exception as e:
            logger.error(
                "No se pudo generar contenido para '%s': %s", lesson.title, e
            )
            error_count += 1

    logger.info("Resumen de generación de finales:")
    logger.info("   - Exitosas: %s", success_count)
    logger.info("   - Con error: %s", error_count)


# ─────────────────────────────────────────────────────────────────────────────
# Generación de audio (edge-tts con fallback gTTS)
# ─────────────────────────────────────────────────────────────────────────────


def _generar_con_edge_tts(texto: str, ruta_salida: Path, voz: str = VOZ_GM_MASCULINA) -> bool:
    """Genera el MP3 usando edge-tts con voz neuronal masculina de alta fidelidad."""
    try:
        import asyncio

        import edge_tts

        async def _run():
            communicate = edge_tts.Communicate(
                texto,
                voice=voz,
                rate="+0%",
                volume="+0%",
                pitch="+0Hz",
            )
            await communicate.save(str(ruta_salida))

        asyncio.run(_run())
        return True
    except Exception as e:
        logger.error("edge-tts falló: %s", e)
        return False


def _generar_con_gtts(texto: str, ruta_salida: Path) -> bool:
    """Genera el MP3 usando gTTS (fallback si edge-tts no está disponible)."""
    try:
        from gtts import gTTS

        tts = gTTS(text=texto, lang="es", slow=False)
        tts.save(str(ruta_salida))
        return True
    except Exception as e:
        logger.error("gTTS falló: %s", e)
        return False


def generate_audio_for_lesson(lesson: EndgameLesson, voz: str = VOZ_GM_MASCULINA) -> bool:
    """Genera el audio para una lección y actualiza su columna audio_path.

    Prioriza edge-tts (voz neuronal masculina de Microsoft, fluida tipo podcast) y
    usa gTTS como fallback.
    """
    if not lesson.podcast_script:
        logger.info("La lección '%s' no tiene podcast_script.", lesson.slug)
        return False

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    output_path = AUDIO_DIR / f"{lesson.slug}.mp3"

    logger.info("Generando MP3 para '%s'...", lesson.slug)
    exito = False

    # Motor principal: edge-tts (voz neuronal masculina fluida)
    if _edge_tts_disponible():
        exito = _generar_con_edge_tts(lesson.podcast_script, output_path, voz=voz)

    # Fallback: gTTS (Google Translate TTS)
    if not exito:
        exito = _generar_con_gtts(lesson.podcast_script, output_path)

    if not exito or not output_path.exists():
        logger.error("No se pudo generar el audio para '%s'.", lesson.slug)
        return False

    # Guardar ruta relativa (se sirve como /static/audio/endgames/{slug}.mp3)
    lesson.audio_path = f"{AUDIO_PATH_PREFIX}/{lesson.slug}.mp3"
    return True


def _edge_tts_disponible() -> bool:
    try:
        import edge_tts  # noqa: F401
        return True
    except ImportError:
        return False


def generate_audio_for_all(db: Session, force: bool = False, voice: str = VOZ_GM_MASCULINA) -> None:
    """Genera los MP3 de las lecciones que aún no tienen audio (o todas con --force)."""
    logger.info("Iniciando generación de audios para finales teóricos...")
    query = db.query(EndgameLesson).filter(
        EndgameLesson.podcast_script != None,
        EndgameLesson.podcast_script != "",
    )

    if not force:
        query = query.filter(
            (EndgameLesson.audio_path == None) | (EndgameLesson.audio_path == "")
        )

    lessons = query.all()

    if not lessons:
        logger.info(
            "No hay lecciones pendientes de generar audio. Usa --force para regenerar todas."
        )
        return

    logger.info("%s lección(es) para procesar.", len(lessons))

    success_count = 0
    error_count = 0

    for lesson in lessons:
        logger.info(
            "Procesando lección ID %s: '%s' (slug: %s)", lesson.id, lesson.title, lesson.slug
        )
        try:
            if generate_audio_for_lesson(lesson, voz=voice):
                db.commit()
                success_count += 1
            else:
                error_count += 1
        except Exception as e:
            db.rollback()
            logger.error("Fallo al procesar '%s': %s", lesson.slug, e)
            error_count += 1

    logger.info("Resumen de generación de audios:")
    logger.info("   - Exitosos: %s", success_count)
    logger.info("   - Con error: %s", error_count)
