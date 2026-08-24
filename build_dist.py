"""
Orquestador de build para empaquetar EntrenadorIA en ./dist/.

Pasos:
  1. Compila el frontend Next.js con salida standalone (output: 'standalone').
   2. Compila backend + lanzador con PyInstaller (entrenador.spec) -> entrenador.exe.
   3. Ensambla ./dist/:
        - entrenador.exe            (lanzador + backend congelado)
       - frontend/                 (servidor standalone + Node embebido)
       - .env                      (config, con SECRET_KEY garantizada)
       - entrenador_ia.db          (BD de trabajo, si existe)
       - stockfish/stockfish.exe   (motor de ajedrez)

Uso:
    .venv\\Scripts\\python.exe build_dist.py              # build completo
    .venv\\Scripts\\python.exe build_dist.py --skip-db    # sin copiar la BD

Opciones de entorno (opcionales):
    ENTRENADORIA_API_URL          URL del backend para el frontend (por defecto http://127.0.0.1:8000)
    ENTRENADORIA_BACKEND_PORT     puerto del backend (por defecto 8000)
    ENTRENADORIA_FRONTEND_PORT    puerto del frontend (por defecto 3000)
"""

import argparse
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV_PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
FRONTEND_DIR = ROOT / "frontend"
DIST_DIR = ROOT / "dist"
STOCKFISH_SRC = ROOT / "stockfish" / "stockfish.exe"
DB_SRC = ROOT / "entrenador_ia.db"

BACKEND_PORT = int(os.environ.get("ENTRENADORIA_BACKEND_PORT", "8000"))
FRONTEND_PORT = int(os.environ.get("ENTRENADORIA_FRONTEND_PORT", "3000"))
API_URL = os.environ.get("ENTRENADORIA_API_URL", f"http://127.0.0.1:{BACKEND_PORT}")


def _log(msg: str) -> None:
    print(f"[build_dist] {msg}")


def _find_node() -> Path | None:
    """Localiza un node.exe instalado para embeberlo como runtime del frontend."""
    where = shutil.which("node")
    if where:
        return Path(where)
    candidates = [
        Path(os.environ.get("ProgramFiles", "C:\\Program Files")) / "nodejs" / "node.exe",
        Path(os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")) / "nodejs" / "node.exe",
    ]
    for cand in candidates:
        if cand.is_file():
            return cand
    return None


def _run(cmd: list, cwd: Path, env: dict | None = None, check: bool = True) -> None:
    _log(f"Ejecutando: {' '.join(str(c) for c in cmd)} (en {cwd.name})")
    result = subprocess.run(cmd, cwd=str(cwd), env=env)
    if check and result.returncode != 0:
        raise SystemExit(f"[build_dist] Fallo con código {result.returncode}: {cmd}")
    return result


def _check_prereqs() -> None:
    if not VENV_PYTHON.is_file():
        raise SystemExit("No se encontró .venv\\Scripts\\python.exe. Crea el entorno virtual primero.")
    if not (ROOT / "EntrenadorIA.spec").is_file():
        raise SystemExit("No se encontró EntrenadorIA.spec (imprescindible para PyInstaller).")
    if not (ROOT / "entrenador.spec").is_file():
        raise SystemExit("No se encontró entrenador.spec (el usado por PyInstaller para compilar el backend).")
    if not (ROOT / "server_launcher.py").is_file():
        raise SystemExit(
            "No se encontró server_launcher.py (entrypoint congelado que usa entrenador.spec). "
            "Sin él PyInstaller no produce dist/entrenador.exe."
        )
    if not (FRONTEND_DIR / "package.json").is_file():
        raise SystemExit("No se encontró frontend/package.json.")
    if not STOCKFISH_SRC.is_file():
        raise SystemExit("No se encontró stockfish/stockfish.exe. Es obligatorio para el análisis.")
    _log("Prerrequisitos OK.")


def _build_frontend() -> None:
    _log("Compilando frontend Next.js (standalone)...")
    env = dict(os.environ)
    env["NEXT_PUBLIC_API_URL"] = API_URL
    env["NEXT_STANDALONE"] = "1"  # activa output:'standalone' en next.config.mjs (solo build de escritorio)
    # npm.cmd evita el shim .ps1 que PowerShell bloquea por política de ejecución.
    _run(["cmd", "/c", "npm.cmd", "run", "build"], FRONTEND_DIR, env=env)
    standalone = FRONTEND_DIR / ".next" / "standalone"
    if not (standalone / "server.js").is_file():
        raise SystemExit("El build no generó .next/standalone/server.js (¿output:'standalone' en next.config.mjs?).")
    _log("Frontend compilado OK.")


def _build_backend() -> None:
    _log("Compilando backend + lanzador con PyInstaller...")
    _run([str(VENV_PYTHON), "-m", "PyInstaller", "--noconfirm", "--clean", "entrenador.spec"], ROOT)
    exe = DIST_DIR / "entrenador.exe"
    if not exe.is_file():
        raise SystemExit("PyInstaller no produjo dist/entrenador.exe.")
    _log("Backend + lanzador compilado OK.")


def _assemble_frontend() -> None:
    _log("Ensamblando frontend/ en dist/...")
    standalone = FRONTEND_DIR / ".next" / "standalone"
    target = DIST_DIR / "frontend"
    if target.exists():
        shutil.rmtree(target)
    # 1) Contenido standalone (server.js + node_modules + .next/server)
    shutil.copytree(standalone, target)
    # 2) Activos estáticos y carpeta public
    static_src = FRONTEND_DIR / ".next" / "static"
    if static_src.is_dir():
        shutil.copytree(static_src, target / ".next" / "static", dirs_exist_ok=True)
    public_src = FRONTEND_DIR / "public"
    if public_src.is_dir() and any(public_src.iterdir()):
        shutil.copytree(public_src, target / "public", dirs_exist_ok=True)
    # 3) Runtime de Node embebido (permite ejecutar sin Node instalado en la máquina tester)
    node_bin = _find_node()
    if node_bin is None:
        raise SystemExit("No se encontró node.exe para embeber. Instala Node.js o añádelo al PATH.")
    shutil.copy2(node_bin, target / "node.exe")
    _log(f"Frontend empaquetado en {target} (node.exe embebido de {node_bin}).")


def _write_env() -> None:
    _log("Generando dist/.env...")
    src_env = ROOT / ".env"
    lines: list[str] = []
    seen: set[str] = set()
    if src_env.is_file():
        for raw in src_env.read_text(encoding="utf-8", errors="replace").splitlines():
            stripped = raw.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                lines.append(raw)
                continue
            key = stripped.partition("=")[0].strip()
            seen.add(key)
            lines.append(f"{key}={stripped.partition('=')[2].strip()}")
    else:
        lines.append("# Configuración generada por build_dist.py")

    if "SECRET_KEY" not in seen:
        lines.append(f"SECRET_KEY={secrets.token_urlsafe(48)}")
    if "CORS_ORIGINS" not in seen:
        lines.append(
            f"CORS_ORIGINS=http://localhost:{FRONTEND_PORT},http://127.0.0.1:{FRONTEND_PORT}"
        )
    if "DATABASE_URL" not in seen:
        lines.append("DATABASE_URL=sqlite:///./entrenador_ia.db")
    if "STOCKFISH_PATH" not in seen:
        lines.append("STOCKFISH_PATH=stockfish/stockfish.exe")
    lines.append("")  # fin de fichero

    (DIST_DIR / ".env").write_text("\n".join(lines), encoding="utf-8")


def _copy_db() -> None:
    if (DIST_DIR / "entrenador_ia.db").is_file():
        _log("entrenador_ia.db ya presente en dist/ (se respeta la versión manual).")
        return
    if DB_SRC.is_file():
        _log("Copiando entrenador_ia.db (base de datos de trabajo)...")
        shutil.copy2(DB_SRC, DIST_DIR / "entrenador_ia.db")
    else:
        _log("Aviso: no existe entrenador_ia.db en la raíz; la BD se creará vacía al primer arranque.")


def _copy_stockfish() -> None:
    target = DIST_DIR / "stockfish"
    if (target / "stockfish.exe").is_file():
        _log("stockfish/ ya presente en dist/ (se respeta la versión manual).")
        return
    _log("Copiando stockfish/...")
    target.mkdir(parents=True, exist_ok=True)
    shutil.copy2(STOCKFISH_SRC, target / "stockfish.exe")


def _copy_launchers() -> None:
    """Genera los scripts de arranque de doble clic en dist/ (apuntan al exe congelado)."""
    # Windows: lanza el ejecutable congelado, que ya reproduce el comportamiento
    # de start_servers.py (backend + frontend + navegador en modo app).
    bat = DIST_DIR / "start.bat"
    bat.write_text(
        "@echo off\r\n"
        "echo Iniciando EntrenadorIA (backend + frontend + navegador)...\r\n"
        'start "" "%~dp0entrenador.exe"\r\n',
        encoding="utf-8",
    )
    _log("Generado dist/start.bat (arranque Windows).")

    # Unix/Mac: lanza el ejecutable congelado (sin extensión).
    sh = DIST_DIR / "start.sh"
    sh.write_text(
        "#!/usr/bin/env bash\n"
        'HERE="$(cd "$(dirname "$0")" && pwd)"\n'
        'exec "$HERE/entrenador" "$@"\n',
        encoding="utf-8",
    )
    try:
        sh.chmod(0o755)
    except Exception:
        pass
    _log("Generado dist/start.sh (arranque Unix/Mac).")

    # Documentación para los tester.
    readme = ROOT / "Leeme.md"
    if readme.is_file():
        shutil.copy2(readme, DIST_DIR / "Leeme.md")
        _log("Copiado Leeme.md a dist/.")


def _summary() -> None:
    _log("=" * 62)
    _log("Build completado. Estructura de ./dist/:")
    for path in sorted(DIST_DIR.rglob("*")):
        if path.is_file():
            size_mb = path.stat().st_size / (1024 * 1024)
            _log(f"  {path.relative_to(ROOT)}  ({size_mb:.1f} MB)")
    _log("=" * 62)
    _log(f"  Doble clic en dist/start.bat (Windows) o start.sh (Unix/Mac) para arrancar todo.")
    _log(f"  Backend -> http://127.0.0.1:{BACKEND_PORT}")
    _log(f"  Frontend -> http://localhost:{FRONTEND_PORT}/login")


def _clean_dist() -> None:
    """Limpia artefactos de build previos en dist/ pero RESPETA los archivos
    que el tester haya colocado manualmente (stockfish/ y la base de datos)."""
    if not DIST_DIR.exists():
        DIST_DIR.mkdir(parents=True)
        return
    preserve = {"stockfish", "entrenador_ia.db", "entrenador_ia.db-shm", "entrenador_ia.db-wal"}
    for item in DIST_DIR.iterdir():
        if item.name in preserve:
            continue
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(description="Empaqueta EntrenadorIA en ./dist/")
    parser.add_argument("--skip-db", action="store_true", help="No copiar entrenador_ia.db")
    parser.add_argument("--skip-frontend", action="store_true", help="No recompilar el frontend")
    parser.add_argument("--skip-backend", action="store_true", help="No recompilar el backend con PyInstaller")
    args = parser.parse_args()

    _check_prereqs()

    _clean_dist()

    if not args.skip_frontend:
        _build_frontend()
    if not args.skip_backend:
        _build_backend()

    _assemble_frontend()
    _write_env()
    if not args.skip_db:
        _copy_db()
    _copy_stockfish()
    _copy_launchers()

    _summary()
    return 0


if __name__ == "__main__":
    sys.exit(main())
