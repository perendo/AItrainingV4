@echo off
echo Activando entorno virtual...
if exist .venv\Scripts\activate.bat (
    call .venv\Scripts\activate.bat
) else (
    echo Advertencia: No se encontro el entorno virtual en .venv\Scripts\activate.bat
)

echo Lanzando servidores...
echo (El navegador se abre en modo pantalla completa desde start_servers.py)
python start_servers.py
