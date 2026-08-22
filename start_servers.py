"""
Script para iniciar los servidores usando el entorno virtual de forma automática.
Uso:
    python start_servers.py

El backend corre en http://127.0.0.1:8000 y el frontend en http://localhost:3000.
Pulsa Ctrl+C para detener ambos procesos.
"""

import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
import http.server
import os
from pathlib import Path


# Puerto del servidor de control local para "Salir al escritorio" (cierra el kiosk).
KIOSK_CONTROL_PORT = 18999
# Proceso del navegador en modo kiosk (lo usamos para cerrarlo a petición).
_browser_proc = None


def _wait_for_frontend(url: str, timeout: int = 60) -> bool:
    """Espera a que el frontend responda antes de abrir el navegador."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except Exception:
            time.sleep(1)
    return False


def _find_browser() -> str | None:
    """Devuelve la ruta de UN único navegador compatible con modo kiosk.

    Se detiene en el primero que encuentre (Edge → Chrome → Brave) para no
    lanzar más de un navegador a la vez.
    """
    if sys.platform.startswith("win"):
        candidates = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
            r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe",
        ]
    elif sys.platform == "darwin":  # macOS
        candidates = [
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ]
    else:  # Linux
        candidates = [
            "microsoft-edge",
            "google-chrome",
            "chromium",
            "chromium-browser",
            "brave-browser",
        ]
    for path in candidates:
        if Path(path).exists() if "/" in path or "\\" in path else _which(path):
            return path
    return None


def _which(name: str) -> bool:
    """Comprueba si un ejecutable está en el PATH (Linux/macOS)."""
    from shutil import which

    return which(name) is not None


def _open_app_window(url: str) -> None:
    """Abre la URL en modo App nativo de Chromium (ventana limpia e independiente).

    Usa --app=URL junto con --start-fullscreen: abre una ventana sin barra de
    navegación ni pestañas, totalmente separada de las sesiones y ventanas que
    el usuario ya tenga abiertas en Chrome/Edge (no las cierra ni las toca).
    """
    browser = _find_browser()
    global _browser_proc
    global _browser_proc, _browser_name
    try:
        if browser:
            # Modo App: ventana propia sin chrome (UI del navegador).
            _browser_proc = subprocess.Popen(
                [browser, f"--app={url}", "--start-fullscreen"]
            )
            _browser_name = Path(browser).name
        elif sys.platform == "darwin":
            _browser_proc = subprocess.Popen(
                [
                    "open",
                    "-a",
                    "Google Chrome",
                    "--args",
                    f"--app={url}",
                    "--start-fullscreen",
                ]
            )
            _browser_name = "Google Chrome"
        elif sys.platform.startswith("win"):
            subprocess.Popen(
                f'start msedge --app="{url}" --start-fullscreen', shell=True
            )
            _browser_name = "msedge.exe"
        elif _which("google-chrome"):
            _browser_proc = subprocess.Popen(
                ["google-chrome", f"--app={url}", "--start-fullscreen"]
            )
            _browser_name = "chrome"
        else:
            # Fallback: navegador por defecto del sistema.
            webbrowser.open(url)
    except Exception as e:
        print(f"Error al abrir en modo app, usando navegador por defecto: {e}")
        webbrowser.open(url)


_backend_proc = None
_frontend_proc = None
# Nombre del ejecutable del navegador lanzado (para matarlo al salir del kiosk).
_browser_name = None


class _ControlHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/exit"):
            self._respond()
            _request_exit()
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path.startswith("/exit"):
            self._respond()
            _request_exit()
        else:
            self.send_response(404)
            self.end_headers()

    def _respond(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args):
        pass


def _kill_browser() -> None:
    """Mata el proceso del navegador aunque sea una instancia singleton.

    En modo app (--app) el navegador reusó su proceso singleton: el handle
    que lanzamos ya terminó, así que hay que matarlo por nombre para cerrar
    realmente la ventana del kiosk.
    """
    name = _browser_name
    if not name:
        return
    if sys.platform.startswith("win"):
        subprocess.run(
            ["taskkill", "/F", "/IM", name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    elif sys.platform == "darwin":
        subprocess.run(
            ["pkill", "-f", name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["osascript", "-e", f'quit app "{name}"'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        subprocess.run(
            ["pkill", "-f", name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def _request_exit() -> None:
    """Cierra el navegador kiosk y los servidores (Salir al escritorio)."""
    global _browser_proc, _backend_proc, _frontend_proc
    for proc in (_backend_proc, _frontend_proc):
        if proc and proc.poll() is None:
            try:
                proc.terminate()
            except Exception:
                pass
    # El navegador puede ser una instancia singleton: lo matamos por nombre.
    _kill_browser()
    # Cierre inmediato del proceso launcher.
    os._exit(0)


def _start_control_server() -> None:
    server = http.server.ThreadingHTTPServer(
        ("127.0.0.1", KIOSK_CONTROL_PORT), _ControlHandler
    )
    threading.Thread(target=server.serve_forever, daemon=True).start()


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
    global _backend_proc, _frontend_proc
    _backend_proc = backend

    # El frontend usa npm. Mantenemos cmd /c que es la forma más estable en Windows
    frontend = subprocess.Popen(
        ["cmd", "/c", "cd frontend && npm run dev"],
        cwd=".",
    )
    _frontend_proc = frontend

    # Servidor de control local para "Salir al escritorio" desde el frontend.
    _start_control_server()

    print("\n=======================================================")
    print("Backend  → http://127.0.0.1:8000  (Swagger: /api/v1/docs)")
    print("Frontend → http://localhost:3000  (redirige a /login)")
    print("=======================================================")
    print("Pulsa Ctrl+C para detener ambos servidores.")

    # Esperamos a que el frontend esté listo y abrimos el navegador en modo kiosk
    frontend_url = "http://localhost:3000/login"
    print("Esperando a que el frontend esté disponible para abrir el navegador...")
    if _wait_for_frontend(frontend_url):
        print(f"Abriendo navegador en modo pantalla completa: {frontend_url}")
        _open_app_window(frontend_url)
    else:
        print("No se pudo detectar el frontend a tiempo; abriendo de todos modos.")
        _open_app_window(frontend_url)

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
