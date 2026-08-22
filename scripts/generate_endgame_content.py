# scripts/generate_endgame_content.py
import asyncio
import sys
from pathlib import Path

# Ajustar sys.path para incluir la raíz del proyecto
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import app.db.base  # noqa: F401
from app.db.session import SessionLocal
from app.models.endgame import EndgameLesson
from app.services.endgame_generator_service import generate_lesson_content


async def main():
    """Recorre todas las lecciones existentes que no tengan guión y genera su contenido con Gemini."""
    print("Iniciando proceso de generacion de contenido para finales teóricos...")
    db = SessionLocal()

    try:
        # Buscar lecciones sin guión de podcast
        lessons = (
            db.query(EndgameLesson)
            .filter(
                (EndgameLesson.podcast_script == None) | (EndgameLesson.podcast_script == "")
            )
            .all()
        )

        if not lessons:
            print("[INFO] Todas las lecciones ya cuentan con contenido generado.")
            return

        print(f"Se encontraron {len(lessons)} leccion(es) sin contenido. Procesando...")

        success_count = 0
        error_count = 0

        for lesson in lessons:
            print(f"\n[PROCESANDO] Lección ID {lesson.id}: '{lesson.title}' (slug: {lesson.slug})")
            try:
                await generate_lesson_content(lesson.id, db)
                print(f"  [OK] Contenido generado y eventos de tablero guardados para '{lesson.title}'.")
                success_count += 1
            except Exception as e:
                print(f"  [ERROR] No se pudo generar contenido para '{lesson.title}': {e}")
                error_count += 1

        print("\n========================================")
        print("Resumen de generación de finales:")
        print(f"   - Exitosas: {success_count}")
        print(f"   - Con error: {error_count}")
        print("========================================")

    except Exception as e:
        print(f"\n[ERROR CRITICO] Ocurrión un error inesperado en el script de generación: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
