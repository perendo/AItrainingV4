import sys
import os
import csv
from pathlib import Path

# 1. Ajuste de rutas
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.database import SessionLocal, engine, Base
import app.models  # noqa
from app.models.puzzle import Puzzle

BATCH_SIZE = 5000

def reset_puzzles_table():
    """Elimina la tabla 'puzzles' si existe mal creada y la vuelve a crear limpia."""
    print("🛠️ Recreando la tabla 'puzzles' para asegurar la estructura...")
    Puzzle.__table__.drop(bind=engine, checkfirst=True)
    Puzzle.__table__.create(bind=engine, checkfirst=True)

def import_puzzles_from_csv(csv_filename_or_path: str):
    csv_path = Path(csv_filename_or_path)
    if not csv_path.is_absolute():
        csv_path = SCRIPT_DIR / csv_filename_or_path

    if not csv_path.exists():
        print(f"❌ Error: El archivo '{csv_path}' no existe.")
        return

    # Limpiar e inicializar la tabla de forma segura
    reset_puzzles_table()

    print(f"📦 Iniciando la importación desde: {csv_path}")
    
    db = SessionLocal()
    try:
        with open(csv_path, mode="r", encoding="utf-8-sig") as f: # 'utf-8-sig' elimina el BOM invisible
            reader = csv.DictReader(f)
            
            puzzles_batch = []
            total_imported = 0
            
            for row_num, raw_row in enumerate(reader, start=1):
                # Normalizar las claves de la fila (quitar espacios y pasar a minúsculas)
                row = {k.strip().lower(): v.strip() for k, v in raw_row.items() if k}
                
                # Obtener el ID probando las posibles variaciones de nombre de columna
                puzzle_id = row.get("puzzleid") or row.get("id") or row.get("puzzle_id")
                
                # Ignorar filas vacías o inválidas sin ID
                if not puzzle_id:
                    continue

                fen = row.get("fen")
                moves = row.get("moves")
                
                if not fen or not moves:
                    continue

                # Parseo seguro de enteros
                def safe_int(val, default=None):
                    try:
                        return int(val) if val is not None and val != "" else default
                    except ValueError:
                        return default

                puzzle = Puzzle(
                    id=puzzle_id,
                    fen=fen,
                    moves=moves,
                    rating=safe_int(row.get("rating"), 1500),
                    rating_deviation=safe_int(row.get("ratingdeviation") or row.get("rating_deviation")),
                    popularity=safe_int(row.get("popularity")),
                    nb_plays=safe_int(row.get("nbplays") or row.get("nb_plays")),
                    themes=row.get("themes"),
                    game_url=row.get("gameurl") or row.get("game_url"),
                    opening_tags=row.get("openingtags") or row.get("opening_tags"),
                )
                
                puzzles_batch.append(puzzle)
                
                if len(puzzles_batch) >= BATCH_SIZE:
                    db.add_all(puzzles_batch)
                    db.commit()
                    total_imported += len(puzzles_batch)
                    print(f"  ⚡ {total_imported} ejercicios procesados...")
                    puzzles_batch.clear()
            
            # Guardar el último lote
            if puzzles_batch:
                db.add_all(puzzles_batch)
                db.commit()
                total_imported += len(puzzles_batch)
                
            print(f"\n✅ ¡Importación completada con éxito! Total de ejercicios cargados: {total_imported}")

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error durante la importación: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    CSV_NAME = "puzzles_50k.csv"  # Ajusta al nombre real si es diferente
    import_puzzles_from_csv(CSV_NAME)