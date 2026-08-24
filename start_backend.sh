#!/usr/bin/env bash
# start_backend.sh - Arranca uvicorn + Tailscale Funnel de forma persistente (Debian/WSL)
# Uso: ./start_backend.sh
set -euo pipefail

APP_DIR="$HOME/chess-backend"
VENV="$APP_DIR/venv/bin/activate"
LOG_DIR="/tmp"
UVICORN_LOG="$LOG_DIR/uvicorn.log"
FUNNEL_LOG="$LOG_DIR/funnel.log"
PORT=8000

# 1) Asegurar Tailscale conectado
if ! tailscale status >/dev/null 2>&1; then
  echo "Conectando Tailscale..."
  tailscale up
fi

# 2) Arrancar uvicorn completamente desacoplado (sobrevive al cerrar la terminal)
if pgrep -f "uvicorn app.main:app" >/dev/null; then
  echo "uvicorn ya esta corriendo."
else
  echo "Arrancando uvicorn en :$PORT ..."
  setsid bash -c "source '$VENV'; cd '$APP_DIR'; exec uvicorn app.main:app --host 0.0.0.0 --port $PORT" >>"$UVICORN_LOG" 2>&1 </dev/null &
  echo "uvicorn -> $UVICORN_LOG"
fi

# 3) Arrancar Tailscale Funnel desacoplado
if pgrep -f "tailscale funnel" >/dev/null; then
  echo "Tailscale funnel ya esta corriendo."
else
  echo "Arrancando Tailscale Funnel en :$PORT ..."
  setsid bash -c "exec tailscale funnel $PORT" >>"$FUNNEL_LOG" 2>&1 </dev/null &
  echo "funnel -> $FUNNEL_LOG"
fi

sleep 2
echo
echo "Backend local  : http://localhost:$PORT"
echo "Backend publico: https://rendo-portatil.taila5fcb.ts.net"
echo "Comprobacion   : curl -s -o /dev/null -w '%{http_code}' https://rendo-portatil.taila5fcb.ts.net/api/v1/docs"
