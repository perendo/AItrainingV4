"""
Script para iniciar los servidores usando el entorno virtual de forma automática.
Uso:
    python start_servers.py

El backend corre en http://127.0.0.1:8000 y el frontend en http://localhost:3000.
Pulsa Ctrl+C para detener ambos procesos.
"""

import subprocess
import sys
import time
from pathlib import Path


def main() -> int:
    # Localizamos la ruta del ejecutable de Python dentro de tu entorno virtual (.venv)
    venv_python = Path(".", ".venv", "Scripts", "python.exe")

    # Si por algún motivo no existe el entorno virtual, usamos el Python del sistema
    python_bin = str(venv_python) if venv_python.exists() else sys.executable

    # El backend se ejecuta forzando el uso del Python del entorno virtual
    backend = subprocess.Popen(
        [python_bin, "-m", "uvicorn", "app.main:app", "--reload"],
        cwd=".",
    )

    # El frontend usa npm. Mantenemos cmd /c que es la forma más estable en Windows
    frontend = subprocess.Popen(
        ["cmd", "/c", "cd frontend && npm run dev"],
        cwd=".",
    )

    print("\n=======================================================")
    print("Backend  → http://127.0.0.1:8000  (Swagger: /api/v1/docs)")
    print("Frontend → http://localhost:3000  (redirige a /login)")
    print("=======================================================")
    print("Pulsa Ctrl+C para detener ambos servidores.")

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
