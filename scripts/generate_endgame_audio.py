# scripts/generate_endgame_audio.py
import argparse
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

# Directorio donde se guardan los audios (ruta relativa a la carpeta `app/`)
AUDIO_DIR = PROJECT_ROOT / "app" / "static" / "audio" / "endgames"
# Prefijo relativo que se guarda en la columna `audio_path` (se sirve vía /static)
AUDIO_PATH_PREFIX = "audio/endgames"

# Voz masculina neuronal para el Gran Maestro (estilo podcast fluido y natural)
VOZ_GM_MASCULINA = "es-ES-AlvaroNeural"


def _generar_con_edge_tts(texto: str, ruta_salida: Path, voz: str = VOZ_GM_MASCULINA) -> bool:
    """Genera el MP3 usando edge-tts con voz neuronal masculina de alta fidelidad."""
    try:
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
        print(f"  [ERROR] edge-tts falló: {e}")
        return False


def _generar_con_gtts(texto: str, ruta_salida: Path) -> bool:
    """Genera el MP3 usando gTTS (fallback si edge-tts no está disponible)."""
    try:
        from gtts import gTTS

        tts = gTTS(text=texto, lang="es", slow=False)
        tts.save(str(ruta_salida))
        return True
    except Exception as e:
        print(f"  [ERROR] gTTS falló: {e}")
        return False


def generate_audio_for_lesson(lesson: EndgameLesson, voz: str = VOZ_GM_MASCULINA) -> bool:
    """Genera el audio para una lección y actualiza su columna audio_path.

    Prioriza edge-tts (voz neuronal masculina de Microsoft, fluida tipo podcast) y usa gTTS como fallback.
    """
    if not lesson.podcast_script:
        print(f"  [OMITIDO] La lección '{lesson.slug}' no tiene podcast_script.")
        return False

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    output_path = AUDIO_DIR / f"{lesson.slug}.mp3"

    print(f"  [AUDIO] Generando MP3 masculino fluido para '{lesson.slug}'...")
    exito = False

    # Motor principal: edge-tts (voz neuronal masculina fluida)
    if _edge_tts_disponible():
        print(f"  [INFO] Usando edge-tts (voz {voz})...")
        exito = _generar_con_edge_tts(lesson.podcast_script, output_path, voz=voz)

    # Fallback: gTTS (Google Translate TTS)
    if not exito:
        print("  [INFO] Reintentando con gTTS (fallback)...")
        exito = _generar_con_gtts(lesson.podcast_script, output_path)

    if not exito or not output_path.exists():
        print(f"  [ERROR] No se pudo generar el audio para '{lesson.slug}'.")
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


def main():
    parser = argparse.ArgumentParser(description="Generar audios de lecciones de finales con voz de GM.")
    parser.add_argument(
        "--force", "-f",
        action="store_true",
        help="Regenerar audios incluso si la lección ya tiene audio_path asignado.",
    )
    parser.add_argument(
        "--voice", "-v",
        type=str,
        default=VOZ_GM_MASCULINA,
        help=f"Voz neuronal a utilizar (por defecto: {VOZ_GM_MASCULINA}).",
    )
    args = parser.parse_args()

    print("Iniciando generación de audios para finales teóricos...")
    print(f"Configuración: Voz={args.voice} | Forzar={args.force}")
    db = SessionLocal()
    try:
        query = db.query(EndgameLesson).filter(
            EndgameLesson.podcast_script != None,
            EndgameLesson.podcast_script != "",
        )

        if not args.force:
            query = query.filter(
                (EndgameLesson.audio_path == None) | (EndgameLesson.audio_path == "")
            )

        lessons = query.all()

        if not lessons:
            print("[INFO] No hay lecciones pendientes de generar audio. Usa --force para regenerar todas.")
            return

        print(f"Se encontraron {len(lessons)} lección(es) para procesar.")

        success_count = 0
        error_count = 0

        for lesson in lessons:
            print(f"\n[PROCESANDO] Lección ID {lesson.id}: '{lesson.title}' (slug: {lesson.slug})")
            try:
                if generate_audio_for_lesson(lesson, voz=args.voice):
                    db.commit()
                    print(f"  [OK] Audio guardado y columna actualizada para '{lesson.slug}'.")
                    success_count += 1
                else:
                    error_count += 1
            except Exception as e:
                db.rollback()
                print(f"  [ERROR] Fallo al procesar '{lesson.slug}': {e}")
                error_count += 1

        print("\n========================================")
        print("Resumen de generación de audios:")
        print(f"   - Exitosos: {success_count}")
        print(f"   - Con error: {error_count}")
        print("========================================")

    except Exception as e:
        print(f"\n[ERROR CRITICO] {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
