# scripts/seed_endgames.py
import sys
from pathlib import Path

# Ajustar sys.path para incluir la raíz del proyecto
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import app.db.base  # noqa: F401
from app.db.session import SessionLocal
from app.models.endgame import EndgameLesson, LessonCategory


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


def seed_lessons():
    """Pobla el catálogo inicial de lecciones en el Módulo de Finales Teóricos."""
    print("Iniciando siembra de lecciones de finales teóricos...")
    db = SessionLocal()
    inserted_count = 0
    skipped_count = 0

    try:
        for data in BASE_LESSONS:
            slug = data["slug"]
            existing = db.query(EndgameLesson).filter(EndgameLesson.slug == slug).first()

            if existing:
                print(f"  [INFO] La leccion '{data['title']}' (slug: {slug}) ya existe. Omitiendo.")
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
                print(f"  [OK] Leccion insertada: '{data['title']}' ({slug})")
                inserted_count += 1

        print(f"\nSiembra de finales completada con éxito.")
        print(f"   - Insertadas nuevas: {inserted_count}")
        print(f"   - Omitidas (existentes): {skipped_count}")

    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Error durante la siembra de finales: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_lessons()
