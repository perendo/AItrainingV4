# EntrenadorIA — Coach de Ajedrez con Inteligencia Artificial

Plataforma integral de entrenamiento de ajedrez que combina **análisis de partidas con Stockfish**, **informes pedagógicos y reportes generados con Gemini**, **puzles de Lichess**, **Academia de Finales Teóricos con audio** y **autodiagnóstico auditado para partidas de GM y propias**, con backend en FastAPI y frontend en Next.js (App Router).

---

## ✨ Funcionalidades y Módulos

### 🧠 Backend (FastAPI)
- **Autenticación JWT** con bcrypt (registro, login, perfil, control de versión legal RGPD).
- **Análisis de partidas PGN** en segundo plano (`background_session`): filtrado, limpieza y análisis jugada a jugada con Stockfish.
- **Informes de coaching con IA**: Gemini analiza el historial de errores y genera diagnósticos estructurados.
- **Partidas de Grandes Maestros y Autodiagnóstico**: buscador de partidas de GM (caché local en SQLite con generación por Gemini ante fallos) y envío de autodiagnósticos de partidas de GM o propias, auditados de forma asíncrona por Gemini con reintentos automáticos ante saturación de la API.
- **Dos modos de análisis de partida**: `Análisis por IA` (análisis maestro completo de la partida sin comentarios del alumno, disponible en partidas propias) y `Auditoría de Autodiagnóstico` (evalúa los comentarios del alumno). El feedback de apertura cita siempre el **código ECO y el nombre en español**, y cuando el diagnóstico es incorrecto se explica con claridad el motivo (campo `razon_insuficiente`).
- **Academia de Finales Teóricos**: lecciones con posición inicial FEN, eventos de cronología, generación de guiones de podcast e infraestructura de audio mediante TTS (`edge-tts` / `gTTS`).
- **Planes de entrenamiento semanales**: tareas de Táctica, Estrategia y Finales con puzles reales de Lichess adaptados por ELO.
- **Módulo Legal / RGPD**: exportación completa de datos de usuario (10 tablas dependientes) y borrado explícito tabla por tabla.
- **Middleware e infraestructura**: `RequestLogMiddleware` (registro de peticiones) y `GlobalExceptionMiddleware` (errores normalizados), CORS configurable y endpoint raíz de estado. Migraciones Alembic aplicadas automáticamente al arrancar (`alembic upgrade head`).

### 🖥️ Frontend (Next.js 14 App Router)
- **Autenticación y Registro**: validación con Zod, campo de visibilidad de contraseña y checkbox obligatorio de términos legales (`acceptedTerms`).
- **Gestión de partidas e Histórico**: subida de PGN con progreso en vivo, importación de partidas públicas desde **Lichess** por usuario (encoladas en análisis de fondo), estados robustos (`processing`, `completed`, `failed` con reenvío manual) y visor interactivo.
- **Jugar 1 contra 1** (`/jugar`, `LiveGameBoard`): partida local 1v1 en el mismo dispositivo con PGN en vivo, pegado de PGN desde portapapeles (Ctrl+V), selector manual de resultado (1-0/0-1/1/2-1/2/*) y comentarios por jugada (sintaxis PGN `{comentario}`).
- **Tutorial Guiado Interactivo ("Cómo analizar una partida")**: walkthrough paso a paso sobre partida real (Carlsen-Anand) con síntesis de voz en español (`speechSynthesis`) y panel interactivo en modo demo.
- **Visor PgnStudyViewer y Práctica de Finales (`EndgamePracticeBoard`)**: reproducción automática con audio TTS y sonido de jugada, conectada a validación de movimientos con Stockfish.
- **Modo oscuro** (`next-themes`) con toggle, **efectos de sonido** (Web Audio en `useChessSounds`) e **indicador de actividad del GM**.
- **Perfil de usuario**: gestión de datos, exportación de datos RGPD y borrado de cuenta en dos pasos.

---

## 📌 Novedades Recientes y Corrección de Bugs

- **Partida Guiada de Apertura (`/estudio-aperturas`) & Mejoras de Consultas al GM / PDF:**
  - Módulo interactivo de Partidas Guiadas contra el libro de aperturas (PolyGlot) con pausa automática al salir de la teórica, consulta automática al GM y contestación única auditada por Gemini con prompts pedagógicos estrictos (exigiendo explicaciones con el *porqué*, casillas clave y maniobras).
  - Exportación a PDF en Partida Guiada, `/analisis` (capturando dinámicamente el formulario del usuario) e histórico, solucionando el renderizado de la posición final mediante `parsePgnMoves` y evitando omisiones de impresión en bloques largos.
  - Reestructuración de Consultas al GM (`/consulta-gm`) con histórico agrupado por días ("Hoy", "Ayer", "Anteriores"), visualización de conversaciones completas, botón de exportar conversación a PDF y pantalla limpia para realizar nuevas consultas sin sobrecargar el flujo.
  - **Importación de partidas desde Lichess** (`LichessImport.tsx` + `src/lib/lichess.ts`): descarga de partidas públicas de un usuario de Lichess y encolado de su análisis en background con progreso en vivo.
- **Módulo de Finales Teóricos:** incorporación de modelos `EndgameLesson`, `EndgameTimelineEvent`, `UserEndgameProgress`, CLI de población/audio, endpoints REST y visor con audio TTS adaptado a voz masculina en español (`selectSpanishMaleVoice`).
- **Módulo Legal / RGPD:** integración del texto maestro (`Docs/legal.md`), migración de aceptación de términos en usuarios, endpoints de exportación y borrado de cuenta robusto para SQLite.
- **Robustez de IA y Reintentos:** reintentos automáticos en tareas en segundo plano (`audit_existing_analysis`, `process_consultation`) ante fallos transitorios de Gemini (hasta 3 intentos con espera configurable), con recuperación de tareas colgadas al arrancar (`cleanup_stuck_background_tasks`).
- **Correcciones Críticas de UI y Frontend:**
  - **Componente `Tabs` personalizado:** eliminado el `<div>` envolvente de `TabsList` para permitir que `cloneElement` pase correctamente `setActiveTab` a los `TabsTrigger` (resolviendo regresiones en la Academia de Finales).
  - **Sidebar adaptable:** soporte de drawer móvil con overlay y cierre por gestos/Escape, evitando solapamientos en pantallas pequeñas.
  - **Modelos de Base de Datos:** eliminación del modelo duplicado `app/models/training.py` que colisionaba con `app/models/exercise.py` (modelo canónico).
  - **Uso de `logging`:** sustitución general de llamadas a `print()` por logging estructurado con `logging.getLogger(__name__)`.
   - **Singleton de Gemini:** centralización en `gemini_client` (modelos primario `gemini-3.7-flash` y reserva `gemini-3.1-flash-lite`), usando `response_schema=False` en esquemas con diccionarios libres para evitar errores de propiedades adicionales.

- **Análisis de partidas — modos IA y autodiagnóstico (mejora de claridad):**
  - **Prompt bifurcado en `tutor_service`**: `_get_ai_system_prompt` (análisis maestro completo de la partida) y `_get_audit_system_prompt` (auditoría del autodiagnóstico del alumno), seleccionados por `analysis_mode` (`auto`/`ai`/`self_audit`) persistido en `UserGameAnalysis`.
  - **Claridad en el error**: nuevo campo `razon_insuficiente` en `GeminiFeedback` (3-5 frases) que explica por qué un diagnóstico es incorrecto, mostrado en rojo en `GeminiFeedbackDisplay`.
  - **Apertura con ECO**: la respuesta del GM cita siempre el código ECO y el nombre de la apertura en español (en el análisis y en las correcciones), sin pedírselo al alumno.
  - **UI**: el botón "Análisis por IA (sin comentarios)" solo aparece en partidas propias (`USER`); en partidas de GM se oculta para priorizar el autodiagnóstico. Migración Alembic `f0a1b2c3d4e5` añade la columna `analysis_mode`.

- **Últimas correcciones (ago 2026) — detección de tablas y persistencia de historial:**
  - **Práctica de finales (`EndgamePracticeBoard`):** `onDrop` no comprobaba `stalemate` en la condición de progreso, así que lecciones con objetivo `draw` que terminaban en ahogado no se marcaban `mastered`. Se añadió `result === "stalemate"` al igualar con `lesson.target_result === "draw"` (también en `fetchStockfishMove`).
  - **Triple repetición no detectada:** `status`/`resultFor`/`detectGameResult` reconstruían la partida con `new Chess(fen)`, perdiendo el historial de posiciones de `chess.js` (`_positionCount`) y dejando sin efecto la regla de triple repetición (la regla de 50 movimientos sí funcionaba porque viene en el FEN). Corregido usando la instancia persistente `gameRef.current` en `LiveGameBoard.tsx` y `EndgamePracticeBoard.tsx`. Cubierto por `EndgamePracticeBoard.test.tsx` (triple repetición R vs R, 4 ciclos; regla de 50 con halfmove clock 99 + 1 jugada).
  - **Jugar 1 contra 1 (`LiveGameBoard`):** `pgnPreview`, `moves` y `groupedMoves` se derivaban de `new Chess(fen)` perdiendo el historial de jugadas (mostraba solo headers o vacío). Ahora se derivan de `gameRef.current.history()`. Se añadió Ctrl+V para pegar PGN desde portapapeles (extrae headers White/Black), selector de resultado manual (1-0/0-1/1/2-1/2/*) y campo de comentarios por jugada (sintaxis PGN `{comentario}`). El guardado usa `upload-pgn` (Stockfish + historial) en vez de `save-draft`.
  - **Exportar a PDF del histórico (`historico/[analysisId]` → `window.print()`):** la evaluación del Gran Maestro no aparecía en el PDF. Causa: la sección "Comentarios y Evaluación del Gran Maestro" en `PrintAnalysisReport` llevaba `print-block` (`break-inside: avoid`); al ser más alta que una página, Chromium omitía todo el bloque en la impresión. Se eliminó `print-block` de esa sección para que fluya y nunca se descarte. Además, en modo `ai` se oculta el bloque "Comentarios del Usuario" (el análisis IA va sin comentarios del alumno) y el export usa el `feedback` en vivo (igual que en pantalla). Test de regresión: `PrintAnalysisReport.print.test.tsx`.

- **Estudio Activo de Aperturas — continuar contra Stockfish y guardado automático (ago 2026):**
  - Catálogo de **10 aperturas verificadas** contra el libro PolyGlot (`GUIDED_OPENINGS` en `openings.ts`), cada una con código ECO, descripción y línea SAN de posiciones teóricas confirmadas (Italiana, Ruy López Morphy, Escocesa, Siciliana Abierta/Najdorf/Ataque Torre, Francesa Avance, Caro-Kann Avance, Gambito de Dama, India de Rey).
  - Tras enviar el plan al GM, el alumno elige **"Finalizar Estudio"** (ver el informe) o **"Continuar Jugando contra Stockfish"** desde el `out_of_theory_fen` (**`OpeningStockfishBoard.tsx`**) mientras la auditoría corre en segundo plano; un banner avisa cuando el informe queda listo.
  - **La partida SIEMPRE se guarda en el histórico al salir del tablero Stockfish.** Tres caminos:
    - *Guardar partida y ver informe*: persiste el PGN completo (apertura + medio juego) con su resultado real y sale.
    - *Abandonar partida (gana el motor) y guardar*: registra el PGN con derrota forzada del usuario (`0-1`/`1-0` según color) antes de salir.
    - *Fin natural* (mate/ahogado/50 jugadas/triple repetición): se auto-guarda una sola vez con el resultado real, incluyendo la jugada final.
  - **Histórico desdoblado** (`AnalysisHistoryList.tsx`): selector segmentado **"Todos / Estudio de Aperturas / Otras partidas"** con contadores que separa los análisis `guided_opening` del resto (mantienen el badge "PARTIDA GUIADA").
  - **Dificultad de Stockfish**: el endpoint `POST /endgames/stockfish-move` acepta `depth` (1-15) que tiene prioridad sobre `time_limit`; el tablero ofrece niveles 3/8/13/18.

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

### 4. Empaquetado de escritorio (PyInstaller)
```bash
python build_dist.py           # frontend standalone + backend .exe → ./dist/entrenador.exe
python build_dist.py --skip-frontend   # recompila solo el backend si ya hay dist/frontend
```
Genera `dist/entrenador.exe` (vía `entrenador.spec`) con el frontend embebido (`output: "standalone"` en `next.config.mjs`), el binario de Stockfish y la base de datos, más los lanzadores `dist/start.bat` / `dist/start.sh`. Los testers lanzan `dist/start.bat`. La aplicación de escritorio incluye **modo kiosk** con salida rápida a escritorio (`exitToDesktop` → control local `127.0.0.1:18999`).

---

## ☁️ Despliegue en Producción (Vercel + WSL / Tailscale Funnel)

- **Frontend:** Desplegado en **Vercel** (`frontend/`), conectado a la API de producción.
- **Backend:** Corriendo en WSL2 (Linux Debian) sobre Windows 11, expuesto a Internet de forma segura y estable mediante **Tailscale Funnel** (URL pública fija y gratuita sin restricciones de ngrok).
- **Mantenimiento del sistema:** Scripts de arranque persistente (`start_backend.sh`, `start_deploy.bat`) y servicios systemd en `deploy/`.

---

## 📄 Licencia

Proyecto privado. Todos los derechos reservados.
