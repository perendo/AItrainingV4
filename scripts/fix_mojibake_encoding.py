# scripts/fix_mojibake_encoding.py
"""Repara el mojibake almacenado en la BD de finales teóricos.

Las lecciones se importaron decodificando PGNs UTF-8 como cp1252, por lo que
textos como "Peón" quedaron guardados como "PeÃ³n" (UTF-8 leído como Latin-1).
La reparación invierte exactamente esa transformación:
    texto_malo.encode("cp1252") -> bytes_utf8_originales -> .decode("utf-8")

Es **idempotente**: un texto ya limpio no contiene los bytes leading de la
doble codificación (Ã/Â/â) o su re-codificación no produce UTF-8 válido, y se
deja intacto. Por defecto solo informa (dry-run); usar --apply para escribir.
"""
import argparse
import json
import sqlite3
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = PROJECT_ROOT / "entrenador_ia.db"

# Columnas de texto plano y JSON por tabla.
TEXT_COLUMNS = {
    "endgame_lessons": [
        "title",
        "chapter_name",
        "concept",
        "pgn_content",
        "initial_comment",
        "final_comment",
        "podcast_script",
    ],
}
JSON_COLUMNS = {
    "endgame_lessons": ["main_line", "theory_tree"],
    "endgame_timeline_events": ["payload"],
}

# Bytes leading del UTF-8 mal decodificado como cp1252/latin-1:
#   C3 -> "Ã" (tildes/ñ), C2 -> "Â" (¿¡ símbolos), E2 -> "â" (— – → …)
MOJIBAKE_MARKERS = ("Ã", "Â", "â")


def fix_text(value: str) -> str:
    """Repara una cadena con doble codificación. Idempotente."""
    if not value or not any(m in value for m in MOJIBAKE_MARKERS):
        return value
    try:
        repaired = value.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        # No es reversible (texto ya limpio con caracteres especiales o
        # contenido mixto): se deja tal cual.
        return value
    return repaired


def fix_json(value):
    """Repara recursivamente strings dentro de estructuras JSON."""
    if isinstance(value, str):
        return fix_text(value)
    if isinstance(value, list):
        return [fix_json(v) for v in value]
    if isinstance(value, dict):
        return {k: fix_json(v) for k, v in value.items()}
    return value


def fix_column(value, is_json: bool):
    if value is None:
        return None, False
    if is_json:
        try:
            parsed = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value, False
        fixed = fix_json(parsed)
        if fixed != parsed:
            return json.dumps(fixed, ensure_ascii=False), True
        return value, False
    fixed = fix_text(value)
    return fixed, fixed != value


def repair_db(db_path: Path, apply: bool) -> None:
    print(f"BD: {db_path}  ({'APLICANDO' if apply else 'DRY-RUN'})")
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    total_fixed = 0

    for table, columns in TEXT_COLUMNS.items():
        for col in columns:
            rows = cur.execute(
                f"SELECT rowid, {col} FROM {table} WHERE {col} IS NOT NULL"
            ).fetchall()
            fixed_rows = []
            for rowid, value in rows:
                new_value, changed = fix_column(value, is_json=False)
                if changed:
                    fixed_rows.append((new_value, rowid))
            if fixed_rows and apply:
                cur.executemany(
                    f"UPDATE {table} SET {col} = ? WHERE rowid = ?",
                    fixed_rows,
                )
            print(f"  {table}.{col}: {len(fixed_rows)} valores a reparar")
            total_fixed += len(fixed_rows)

    for table, columns in JSON_COLUMNS.items():
        for col in columns:
            rows = cur.execute(
                f"SELECT rowid, {col} FROM {table} WHERE {col} IS NOT NULL"
            ).fetchall()
            fixed_rows = []
            for rowid, value in rows:
                new_value, changed = fix_column(value, is_json=True)
                if changed:
                    fixed_rows.append((new_value, rowid))
            if fixed_rows and apply:
                cur.executemany(
                    f"UPDATE {table} SET {col} = ? WHERE rowid = ?",
                    fixed_rows,
                )
            print(f"  {table}.{col} (JSON): {len(fixed_rows)} valores a reparar")
            total_fixed += len(fixed_rows)

    if apply:
        con.commit()
    con.close()
    print(f"Total: {total_fixed} valores {'reparados' if apply else 'detectados'}\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB,
        help="Ruta de la BD (por defecto: entrenador_ia.db del proyecto)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Escribir los cambios (sin este flag solo informa)",
    )
    args = parser.parse_args()
    if not args.db.exists():
        print(f"No existe la BD: {args.db}")
        return 1
    repair_db(args.db, args.apply)
    return 0


if __name__ == "__main__":
    sys.exit(main())
