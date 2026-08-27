# EntrenadorIA — Coach de Ajedrez con Inteligencia Artificial

Plataforma integral de entrenamiento de ajedrez que combina **análisis de partidas con Stockfish**, **informes pedagógicos y reportes generados con Gemini**, **puzles de Lichess**, **Academia de Finales Teóricos con audio** y **autodiagnóstico auditado para partidas de GM y propias**, con backend en FastAPI y frontend en Next.js (App Router).

---

## ✨ Funcionalidades y Módulos

### 🧠 Backend (FastAPI)
- **Autenticación JWT** con bcrypt (registro, login, perfil, control de versión legal RGPD).
- **Análisis de partidas PGN** en segundo plano (`background_session`): filtrado, limpieza y análisis jugada a jugada con Stockfish.
- **Informes de coaching con IA**: Gemini analiza el historial de errores y genera diagnósticos estructurados.
- **Partidas de Grandes Maestros y Autodiagnóstico**: envío de autodiagnósticos de partidas de GM o propias, auditados de forma asíncrona por Gemini con reintentos automáticos ante saturación de la API.
- **Academia de Finales Teóricos**: lecciones con posición inicial FEN, eventos de cronología, generación de guiones de podcast e infraestructura de audio mediante TTS (`edge-tts` / `gTTS`).
- **Planes de entrenamiento semanales**: tareas de Táctica, Estrategia y Finales con puzles reales de Lichess adaptados por ELO.
- **Módulo Legal / RGPD**: exportación completa de datos de usuario (10 tablas dependientes) y borrado explícito tabla por tabla.

### 🖥️ Frontend (Next.js 14 App Router)
- **Autenticación y Registro**: validación con Zod y checkbox obligatorio de términos legales (`acceptedTerms`).
- **Gestión de partidas e Histórico**: subida de PGN con progreso en vivo, estados robustos (`processing`, `completed`, `failed` con reenvío manual) y visor interactivo.
- **Tutorial Guiado Interactivo ("Cómo analizar una partida")**: walkthrough paso a paso sobre partida real (Carlsen-Anand) con síntesis de voz en español (`speechSynthesis`) y panel interactivo en modo demo.
- **Visor PgnStudyViewer y Práctica de Finales (`EndgamePracticeBoard`)**: reproducción automática con audio TTS y sonido de jugada, conectada a validación de movimientos con Stockfish.
- **Perfil de usuario**: gestión de datos, exportación de datos RGPD y borrado de cuenta en dos pasos.

---

## 📌 Novedades Recientes y Corrección de Bugs

- **Módulo de Finales Teóricos:** incorporación de modelos `EndgameLesson`, `EndgameTimelineEvent`, `UserEndgameProgress`, CLI de población/audio, endpoints REST y visor con audio TTS adaptado a voz masculina en español (`selectSpanishMaleVoice`).
- **Módulo Legal / RGPD:** integración del texto maestro (`Docs/legal.md`), migración de aceptación de términos en usuarios, endpoints de exportación y borrado de cuenta robusto para SQLite.
- **Robustez de IA y Reintentos:** reintentos automáticos en tareas en segundo plano (`audit_existing_analysis`, `process_consultation`) ante fallos transitorios de Gemini (hasta 3 intentos con espera configurable), con recuperación de tareas colgadas al arrancar (`cleanup_stuck_background_tasks`).
- **Correcciones Críticas de UI y Frontend:**
  - **Componente `Tabs` personalizado:** eliminado el `<div>` envolvente de `TabsList` para permitir que `cloneElement` pase correctamente `setActiveTab` a los `TabsTrigger` (resolviendo regresiones en la Academia de Finales).
  - **Sidebar adaptable:** soporte de drawer móvil con overlay y cierre por gestos/Escape, evitando solapamientos en pantallas pequeñas.
  - **Modelos de Base de Datos:** eliminación del modelo duplicado `app/models/training.py` que colisionaba con `app/models/exercise.py` (modelo canónico).
  - **Uso de `logging`:** sustitución general de llamadas a `print()` por logging estructurado con `logging.getLogger(__name__)`.
   - **Singleton de Gemini:** centralización en `gemini_client` (modelos primario `gemini-3.7-flash` y reserva `gemini-3.1-flash-lite`), usando `response_schema=False` en esquemas con diccionarios libres para evitar errores de propiedades adicionales.

- **Últimas correcciones (ago 2026) — detección de tablas y persistencia de historial:**
  - **Práctica de finales (`EndgamePracticeBoard`):** `onDrop` no comprobaba `stalemate` en la condición de progreso, así que lecciones con objetivo `draw` que terminaban en ahogado no se marcaban `mastered`. Se añadió `result === "stalemate"` al igualar con `lesson.target_result === "draw"` (también en `fetchStockfishMove`).
  - **Triple repetición no detectada:** `status`/`resultFor`/`detectGameResult` reconstruían la partida con `new Chess(fen)`, perdiendo el historial de posiciones de `chess.js` (`_positionCount`) y dejando sin efecto la regla de triple repetición (la regla de 50 movimientos sí funcionaba porque viene en el FEN). Corregido usando la instancia persistente `gameRef.current` en `LiveGameBoard.tsx` y `EndgamePracticeBoard.tsx`. Cubierto por `EndgamePracticeBoard.test.tsx` (triple repetición R vs R, 4 ciclos; regla de 50 con halfmove clock 99 + 1 jugada).
  - **Jugar 1 contra 1 (`LiveGameBoard`):** `pgnPreview`, `moves` y `groupedMoves` se derivaban de `new Chess(fen)` perdiendo el historial de jugadas (mostraba solo headers o vacío). Ahora se derivan de `gameRef.current.history()`. Se añadió Ctrl+V para pegar PGN desde portapapeles (extrae headers White/Black), selector de resultado manual (1-0/0-1/1/2-1/2/*) y campo de comentarios por jugada (sintaxis PGN `{comentario}`). El guardado usa `upload-pgn` (Stockfish + historial) en vez de `save-draft`.

---

## 🧱 Stack Tecnológico

### Backend
- **Framework:** FastAPI 0.111
- **ORM:** SQLAlchemy 2.0 (Alembic para migraciones con `render_as_batch=True`)
- **Base de datos:** SQLite (desarrollo/producción local)
- **Motor de ajedrez:** Stockfish (binario local v17)
- **IA / LLM:** Google Gemini (`gemini-3.7-flash` / `gemini-3.1-flash-lite`)
- **Autenticación:** PyJWT + bcrypt

### Frontend
- **Framework:** Next.js 14.2 (App Router)
- **Lenguaje:** TypeScript 5
- **Estilos:** Tailwind CSS 3 + shadcn/ui
- **Formularios:** React Hook Form + Zod
- **Tablero:** react-chessboard + chess.js

---

## 🚀 Puesta en marcha

### Requisitos previos
- Python 3.12+ (recomendado usar el entorno `.venv` del repo)
- Node.js 18+
- [Stockfish](https://stockfishchess.org/download/) (binario en `stockfish/stockfish.exe` en Windows o `/usr/games/stockfish` en Linux/WSL)
- API key de [Google AI Studio](https://aistudio.google.com/apikey)

### 1. Backend
```bash
python -m venv .venv
# Activación:
# Windows: .venv\Scripts\activate
# Linux/Mac: source .venv/bin/activate

pip install -r requirements.txt
```

Crea el archivo `.env` en la raíz con las siguientes variables:
```env
DATABASE_URL="sqlite:///./entrenador_ia.db"
STOCKFISH_PATH="stockfish/stockfish.exe"
GEMINI_API_KEY="tu-api-key-de-gemini"
SECRET_KEY="clave-secreta-para-jwt-de-al-menos-32-bytes"
```

Arranca el servidor de desarrollo:
```bash
uvicorn app.main:app --reload
```
- API: `http://127.0.0.1:8000` · Swagger: `http://127.0.0.1:8000/api/v1/docs`

### 2. Frontend
```cmd
cd frontend
npm install
```
Crea `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL="http://127.0.0.1:8000"
```
```cmd
npm run dev
```
Aplicación disponible en `http://localhost:3000`.

### 3. Arranque Conjunto
```bash
python start_servers.py        # backend :8000 + frontend :3000 en paralelo
# O en Windows:
start.bat
```

---

## ☁️ Despliegue en Producción (Vercel + WSL / Tailscale Funnel)

- **Frontend:** Desplegado en **Vercel** (`frontend/`), conectado a la API de producción.
- **Backend:** Corriendo en WSL2 (Linux Debian) sobre Windows 11, expuesto a Internet de forma segura y estable mediante **Tailscale Funnel** (URL pública fija y gratuita sin restricciones de ngrok).
- **Mantenimiento del sistema:** Scripts de arranque persistente (`start_backend.sh`, `start_deploy.bat`) y servicios systemd en `deploy/`.

---

## 📄 Licencia

Proyecto privado. Todos los derechos reservados.
