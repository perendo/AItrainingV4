"""
Entrypoint congelado (entrenador.exe) para la distribución a testers.

Diseño de procesos (un único ejecutable one-file de PyInstaller):
  * Sin argumentos: orquesta todo. Lanza el backend y el frontend como
    subprocesos y abre el navegador en modo app (ventana limpia) apuntando
    a la URL del frontend. Expone un servidor de control local para que el
    botón "Salir al escritorio" cierre la aplicación completa.
  * Con --backend: ejecuta uvicorn (app.main:app). Se usa para lanzar el
    backend como un proceso hijo del propio ejecutable congelado, ya que en
    la distribución no existe un python del sistema ni un entorno virtual.

El frontend se sirve con el Node embebido en dist/frontend/node.exe y el
servidor standalone de Next.js (dist/frontend/server.js).
"""

import os
import subprocess
import sys
import threading
import time
from pathlib import Path

# Reutiliza la detección de navegador, la apertura en modo app y el servidor
# de control de "Salir al escritorio" ya probados en start_servers.py.
import start_servers as launcher

DIST_DIR = Path(sys.executable).resolve().parent
FRONTEND_DIR = DIST_DIR / "frontend"

BACKEND_PORT = int(os.environ.get("ENTRENADORIA_BACKEND_PORT", "8000"))
FRONTEND_PORT = int(os.environ.get("ENTRENADORIA_FRONTEND_PORT", "3000"))
FRONTEND_URL = f"http://localhost:{FRONTEND_PORT}/login"


def _wait_for_frontend(url: str, timeout: int = 60) -> bool:
    """Espera a que el frontend responda antes de abrir el navegador."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            import urllib.request

            urllib.request.urlopen(url, timeout=2)
            return True
        except Exception:
            time.sleep(1)
    return False


def _run_backend_child() -> None:
    """Proceso hijo: sirve la API FastAPI con uvicorn (modo congelado)."""
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=BACKEND_PORT,
        log_level="info",
    )


def _run_frontend() -> subprocess.Popen:
    """Lanza el servidor standalone de Next.js con el Node embebido."""
    node = FRONTEND_DIR / "node.exe"
    node_bin = str(node) if node.is_file() else "node"
    env = dict(os.environ)
    env["PORT"] = str(FRONTEND_PORT)
    env["HOSTNAME"] = "127.0.0.1"
    return subprocess.Popen(
        [node_bin, "server.js"],
        cwd=str(FRONTEND_DIR),
        env=env,
    )


def main() -> int:
    # Modo hijo: solo el backend.
    if "--backend" in sys.argv:
        _run_backend_child()
        return 0

    # Modo orquestador: backend + frontend + navegador en modo app.
    backend = subprocess.Popen([sys.executable, "--backend"])
    launcher._backend_proc = backend

    frontend = _run_frontend()
    launcher._frontend_proc = frontend

    # Servidor de control local para "Salir al escritorio".
    launcher._start_control_server()

    print("\n=======================================================")
    print(f"Backend  -> http://127.0.0.1:{BACKEND_PORT}")
    print(f"Frontend -> http://localhost:{FRONTEND_PORT}/login")
    print("=======================================================")
    print("Pulsa Ctrl+C para detener ambos servidores.")

    if _wait_for_frontend(FRONTEND_URL):
        print(f"Abriendo navegador en modo app: {FRONTEND_URL}")
    else:
        print("No se pudo detectar el frontend a tiempo; abriendo de todos modos.")
    launcher._open_app_window(FRONTEND_URL)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nDeteniendo servidores...")
        backend.terminate()
        frontend.terminate()
        backend.wait()
        frontend.wait()
        print("Servidores detenidos de forma segura.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
