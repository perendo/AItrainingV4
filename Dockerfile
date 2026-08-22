FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Stockfish (binario de Linux) y herramientas mínimas.
# En Debian el binario queda en /usr/games/stockfish.
RUN apt-get update && apt-get install -y --no-install-recommends \
    stockfish \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY . .

# Ruta de Stockfish en Linux (la imagen Debian lo instala ahí).
ENV STOCKFISH_PATH=/usr/games/stockfish

EXPOSE 8080

# Fly inyecta PORT; usamos 8080 por defecto.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
