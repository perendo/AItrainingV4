# app/cli.py
"""CLI de administración del backend (tareas de mantenimiento/población).

Uso:
    python -m app.cli seed-endgames
    python -m app.cli import-pgns [--dry-run]
    python -m app.cli gen-content
    python -m app.cli gen-audio [--force] [--voice es-ES-AlvaroNeural]
"""
import argparse
import asyncio
import logging
from pathlib import Path

import app.db.base  # noqa: F401  (registra todos los modelos)
from app.db.session import SessionLocal
from app.services import endgame_admin_service as svc

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _seed(args) -> None:
    db = SessionLocal()
    try:
        svc.seed_lessons(db)
    finally:
        db.close()


def _import_pgns(args) -> None:
    db = SessionLocal()
    try:
        records = svc.parse_pgn_files(PROJECT_ROOT / "data" / "pgn")
        if records:
            svc.upsert_lessons(records, db, dry_run=args.dry_run)
        else:
            logger.info("No se encontraron archivos .pgn en data/pgn.")
    finally:
        db.close()


def _gen_content(args) -> None:
    db = SessionLocal()
    try:
        asyncio.run(svc.generate_content_for_all(db))
    finally:
        db.close()


def _gen_audio(args) -> None:
    db = SessionLocal()
    try:
        svc.generate_audio_for_all(db, force=args.force, voice=args.voice)
    finally:
        db.close()


_COMMANDS = {
    "seed-endgames": _seed,
    "import-pgns": _import_pgns,
    "gen-content": _gen_content,
    "gen-audio": _gen_audio,
}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    parser = argparse.ArgumentParser(
        prog="python -m app.cli",
        description="Tareas de administración del Módulo de Finales Teóricos.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("seed-endgames", help="Siembra las 7 lecciones base de finales.")
    p_imp = sub.add_parser("import-pgns", help="Importa finales desde data/pgn.")
    p_imp.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo parsea y valida, sin escribir en la base de datos.",
    )
    sub.add_parser("gen-content", help="Genera guiones y eventos de tablero con Gemini.")
    p_aud = sub.add_parser("gen-audio", help="Genera los MP3 de audio con edge-tts.")
    p_aud.add_argument(
        "--force",
        "-f",
        action="store_true",
        help="Regenerar audios aunque la lección ya tenga audio_path.",
    )
    p_aud.add_argument(
        "--voice",
        "-v",
        type=str,
        default=svc.VOZ_GM_MASCULINA,
        help=f"Voz neuronal a utilizar (por defecto: {svc.VOZ_GM_MASCULINA}).",
    )

    args = parser.parse_args()
    _COMMANDS[args.command](args)


if __name__ == "__main__":
    main()
