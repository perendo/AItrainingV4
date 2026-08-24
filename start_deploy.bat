@echo off
REM ============================================================
REM  start_deploy.bat  -  Ejecutar como ADMINISTRADOR
REM  (clic derecho -> Ejecutar como administrador)
REM  Mantiene Windows despierto y levanta el backend (WSL)
REM  + tunel Tailscale Funnel.
REM ============================================================
SETLOCAL

echo [1/3] Configurando energia (sin suspender al cerrar la tapa)...
powercfg /change lidcloseaction 0
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0

echo [2/3] Levantando backend + Tailscale Funnel en WSL (start_backend.sh)...
wsl -u pedro -- bash -lc "~/chess-backend/start_backend.sh"

echo.
echo Backend local : http://localhost:8000
echo Backend publico: https://rendo-portatil.taila5fcb.ts.net
echo.
echo Revisa los logs dentro de WSL si hay fallos:
echo   /tmp/uvicorn.log
echo   /tmp/funnel.log
echo.
pause
ENDLOCAL
