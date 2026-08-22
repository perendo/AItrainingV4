# AGENTS.md

## What this is

FastAPI backend (AI chess coach: Stockfish PGN analysis + Gemini reports + Lichess puzzles, autodiagnóstico auditado por Gemini para partidas de GM y propias) **plus a Next.js 14 (App Router) frontend**. Backend code, comments, and API tags are in **Spanish** — keep new backend strings/comments Spanish.

---

## Backend — run & verify

```bash
uvicorn app.main:app --reload        # API at http://127.0.0.1:8000 · Swagger at /api/v1/docs
.venv\Scripts\python.exe -m pytest tests/ -v   # 14 test files (~114 tests), config in pytest.ini
```

**Python runs from the repo `.venv`** (Python 3.12) — plain `python` may not resolve. Run tests via `.venv\Scripts\python.exe -m pytest` or activate `.venv` first. `start_servers.py`, `server_launcher.py` and `build_dist.py` already pick up `.venv\Scripts\python.exe` automatically.

A working `.env` already exists at repo root. Required keys: `DATABASE_URL`, `STOCKFISH_PATH`, `GEMINI_API_KEY`, `SECRET_KEY`.

### Backend quirks (easy to miss)

- **Stockfish**: Windows binary at `stockfish/stockfish.exe`, path read from `STOCKFISH_PATH` in `.env`. 0.1s/move — fast but shallow.
- **Gemini model** is the automatic alias `gemini-flash-latest`, **centralizado en `app/services/gemini_client.py`** (`GeminiClient` + singleton `gemini_client`). Todos los servicios de IA (`llm_coach`, `tutor_service`, `gm_consultation_service`, `gm_service`) delegan en él vía `gemini_client.generate_json(...)` / `gemini_client.generate_text(...)`; el timeout y la limpieza/validación de JSON también van por ahí. **No inicialices `genai.GenerativeModel` ni duplicates la lógica de `genai.configure` en los servicios** — usa `gemini_client`.
- **JWT**: secret from `settings.SECRET_KEY` (`.env`), tokens expire in 7 days. Auth via `Depends(get_current_user_id)`.
- **CORS** in `main.py` reads `CORS_ORIGINS` from `settings` (`.env`, comma-separated). Defaults to `http://localhost:3000,http://127.0.0.1:3000`; use `*` for open dev (disables credentials).
- **Background tasks** must open their own session via `background_session()` (context manager en `app/core/database.py:background_session`). Centraliza el patrón previo `import app.core.database as database_module; db = database_module.SessionLocal()`. Como llama al `SessionLocal` del módulo, el monkey-patching de tests sigue funcionando (`conftest` swapea `database_module.SessionLocal` con la sesión de prueba). Servicios que lo usan: `tutor_service.audit_existing_analysis`, `gm_consultation_service.process_consultation`, `chess_analyzer.process_pgn_background`.
- **Tests need the in-memory `StaticPool` engine** from `conftest.py` or endpoint tests fail with "no such table". All Gemini-service tests patch `GeminiClient.model` with `PropertyMock` (el cliente unificado en `app/services/gemini_client.py`); los servicios mantienen una propiedad `model` que solo devuelve `gemini_client.model` por compatibilidad, pero la generación real va por `gemini_client`. `test_endpoints_game.py` spawns real Stockfish (~0.7s/test, ~2min full suite).
- **Puzzle data**: Training/exercise endpoints query a `chess_puzzles` table. One-time import: `python ejercicios/import_puzzles.py` reads `ejercicios/lichess_db_puzzle.csv` (~50k puzzles). Without it, puzzle flows return empty results.
- **Logging, no `print()`**: El backend usa el módulo estándar `logging` (`logger = logging.getLogger(__name__)`). **No uses `print()`** para trazas ni depuración en endpoints/servicios (reemplazado en `endpoints_gm_games.py` y `endpoints_training.py` durante la auditoría). En excepciones, `logger.error(..., exc_info=True)` en lugar de `print`/`traceback.print_exc()`.
- **Modelo canónico de entrenamiento**: `TrainingTask` y `WeeklyPlan` se definen **solo** en `app/models/exercise.py` (el modelo duplicado `app/models/training.py` fue eliminado en la auditoría por colisión de tablas `training_tasks`/`weekly_plans`). No recrees `training.py` ni re-declares esas tablas en otro módulo. Todos los imports deben apuntar a `app.models.exercise`.
- **`test_endpoints_exercise.py`** hits the `/api/v1/training/*` routes (the router registers training at `/training`, not `/exercise`): `all-tasks`, `pending-tasks`, `weekly/generate`, `tasks/{id}/complete`, `tasks/{id}/next-puzzle`.
- **GM game assignment persistence**: `User.current_assigned_gm_game_id` (FK → `gm_games.id`) stores the currently assigned GM game per user. `GET /training/pending-tasks` returns the **same** game across refreshes until the user submits the analysis. On submit, `tutor_service.py` creates a `UserAnalyzedGMGame` record (excludes the game from future recommendations) and clears the assignment.
- **SQLite migration (Alembic)**: el esquema se versiona con **Alembic** (`alembic/` + `alembic.ini`). `app/main.py` aplica las migraciones de forma programática al arrancar vía `alembic upgrade head` (con respaldo a `create_all` + `stamp` si la BD es previa a Alembic). Para evolucionar el esquema: editar modelos y generar con `.venv\Scripts\python.exe -m alembic revision --autogenerate -m "mensaje"`. La BD de desarrollo ya está marcada en head (`alembic stamp head`). `env.py` usa `settings.DATABASE_URL`, importa todos los modelos y activa `render_as_batch=True` para SQLite.
- **Migración de conciliación `c1bfac8dcae5`**: las BD ya desplegadas (`entrenador_ia.db`, `dist/entrenador_ia.db`) se crearon desde un modelo anterior sin `user_game_analyses.status`/`error_message` y ya estaban marcadas en head, así que `fe831aa70a9f` no las añadía y el INSERT de `tutor_service` fallaba con `OperationalError: table user_game_analyses has no column named status`. Esta migración las agrega **de forma idempotente** (omite columna/index si ya existen) para no romper BDs nuevas donde `fe831aa70a9f` ya las define. Si una BD antigua sigue sin esas columnas, basta con `alembic upgrade head`; si Alembic no las aplica (BD sellada), añadirlas con `ALTER TABLE user_game_analyses ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'processing'` + `ADD COLUMN error_message TEXT`.
- **Tareas de fondo robustas (BackgroundTasks)**: `gm_consultation_service.process_consultation` y `tutor_service.audit_existing_analysis` capturan cualquier excepción/timeout de Gemini y marcan el registro como `failed` con un `error_message` legible (nunca dejan el estado en `processing` indefinidamente). `GMConsultation` ya tenía `status`/`error_message`; `UserGameAnalysis` ahora también añade `status` (default `processing`) y `error_message`. El endpoint `GET /game-analysis/{id}/status` devuelve el `status` real (`processing`/`completed`/`failed`) + `error_message`. Al arrancar, `app/main.py` ejecuta `cleanup_stuck_background_tasks()`, que marca como `failed` las tareas que quedaron en `processing` (p.ej. por reinicio del servidor) con el mensaje "Procesamiento interrumpido por reinicio del servidor.".
- **Timeout de Gemini**: `settings.GEMINI_TIMEOUT_SECONDS` (default 120) se pasa como `request_options={"timeout": ...}` de forma **centralizada en `GeminiClient._generate`** (en `app/services/gemini_client.py`). Todos los `generate_json`/`generate_text` lo aplican, de modo que un cuelgue se convierte en una excepción capturada (antes `llm_coach` y `gm_service` NO lo aplicaban — ahora sí, corregido).
- **`response_schema=None/False` en `generate_json`**: para evitar que la SDK de `google-generativeai` falle al traducir esquemas Pydantic con campos `dict`/`payload` libres (error `Unknown field for Schema: additionalProperties`), se puede pasar `response_schema=False`. En ese caso `generate_json` NO envía `response_schema` a Gemini (la respuesta queda sin restricción estricta de esquema en la API) pero **sí valida localmente** contra el `schema` Pydantic provisto. Úsalo cuando el esquema tenga dicts anidados no tipados (p.ej. `TimelineEventSchema.payload: dict` en `endgame_generator_service.py`).
- **Módulo de Finales Teóricos** (basado en "100 finales que hay que saber" de Jesús de la Villa): modelo `EndgameLesson` (tabla `endgame_lessons`) con los campos: `title`, `slug` (único, index), `category` [enum `LessonCategory`: `peones`/`torres`/`piezas_menches`/`damas`], `difficulty`, `initial_fen` (String(100), NOT NULL), `target_result`, `audio_path`, `podcast_script`, `created_at` + **campos del estudio de Lichess** (`nullable=True` para no romper las 7 lecciones seed): `lesson_number` (Integer, index), `chapter_name` (String(255)), `concept` (String(255), del tag `[Black]`), `pgn_content` (Text, PGN exportado del capítulo con variaciones y comentarios), `main_line` (JSON, lista de SAN de la variante principal), `initial_comment` (Text, comentario introductorio del capítulo), `theory_tree` (JSON, árbol estructurado de la teoría) y `final_comment` (Text, conclusión teórica). + `EndgameTimelineEvent` (tabla `endgame_timeline_events`, `lesson_id` FK, `timestamp_seconds`, `action_type` [enum `ActionType`], `payload` JSON) + `UserEndgameProgress` (tabla `user_endgame_progress`). Importa los modelos desde `app.models.endgame` y todos los modelos vía `import app.db.base` (necesario para registrar `User` antes de mapear `UserEndgameProgress`). La sesión se re-exporta en `app/db/session.py` (`from app.core.database import SessionLocal, ...`) para que los scripts la importen vía `app.db.session` sin romper el monkey-patch de tests.
- **Scripts de población (ejecutables con `python -m`)**: 
  - `scripts/seed_endgames.py` → `seed_lessons()` inserta 7 lecciones base de Jesús de la Villa (regla del cuadrado, oposición y casillas clave, Lucena, Philidor, Vancura, dama contra peón de 7ª, mate alfil+caballo) evitando duplicados por `slug`.
  - `scripts/generate_endgame_content.py` → recorre las `EndgameLesson` sin `podcast_script` y llama a `endgame_generator_service.generate_lesson_content(lesson_id, db)` para generar guión de podcast + eventos de tablero con Gemini.
  - `scripts/generate_endgame_audio.py` → recorre las `EndgameLesson` con `podcast_script` y sin `audio_path`, genera el MP3 con **edge-tts** (voz neuronal `es-ES-AlvaroNeural`, motor principal) o **gTTS** (fallback) en `app/static/audio/endgames/{slug}.mp3`, y guarda la ruta relativa `audio/endgames/{slug}.mp3` en `lesson.audio_path` (se sirve vía `/static/...`). `requirements.txt` incluye `edge-tts>=6.1.0` y `gTTS==2.5.4`.
- **Endpoints de finales** — `app/api/v1/endgames.py` (registrado en `router.py` con prefijo `/endgames`, tag `"endgames"`):
  - `GET /api/v1/endgames/lessons` → catálogo agrupado por `category` (dict `{categoria: [EndgameLessonListItem]}`), con `status` de progreso del usuario (`not_started`/`in_progress`/`mastered`). Acepta `?category=` para filtrar una sola categoría.
  - `GET /api/v1/endgames/lessons/{slug}` → detalle: `initial_fen`, `audio_url` (`/static/audio/endgames/{slug}.mp3`), `podcast_script` y `timeline_events` ordenados por `timestamp_seconds`.
  - `POST /api/v1/endgames/lessons/{slug}/progress` → crea/actualiza `UserEndgameProgress` (`status`, `last_listened_second`) del usuario autenticado.
  - `POST /api/v1/endgames/stockfish-move` → endpoint de práctica: recibe `{fen, skill_level, time_limit}` y devuelve `{move_uci, move_san, fen_after}` con la mejor jugada de Stockfish. No requiere auth. Usado por el modo Práctica del frontend.
  - Esquemas en `app/schemas/endgame.py`: `EndgameLessonListItem`, `EndgameLessonDetail`, `TimelineEventResponse`, `EndgameProgressUpdate`, `EndgameProgressResponse`, y los enums `LessonCategory`/`LessonStatus`/`ActionType`.
  - **Archivos estáticos**: `app/main.py` monta `StaticFiles(directory=app/static)` en `/static`, de modo que los MP3 generados son accesibles en `/static/audio/endgames/{slug}.mp3`.
- **Servicio de contenido de finales** — `app/services/endgame_generator_service.py`:
  - `EndgameGeneratorService.generate_lesson_content(lesson_id, db)` (async) obtiene la lección, pide a Gemini (vía `gemini_client.generate_json(..., schema=LessonContentSchema, response_schema=False)`) un `podcast_script` (~300-400 palabras en español) y `timeline_events` sincronizados. Actualiza `lesson.podcast_script`, borra los `EndgameTimelineEvent` previos del `lesson_id` (idempotente) e inserta los nuevos; hace `db.commit()` o `db.rollback()` en error.
  - Esquemas Pydantic locales: `TimelineEventSchema` (`timestamp_seconds: float`, `action_type: Literal[...]`, `payload: dict`) y `LessonContentSchema` (`podcast_script: str`, `timeline_events: List[TimelineEventSchema]`).
  - Existe la función de ayuda `generate_lesson_content(lesson_id, db)` que delega en la instancia singleton `endgame_generator_service`.

---

## Asynchronous GM flows (key architecture)

Both "consultas al GM" and "Evaluación del Gran Maestro" are **non-blocking**: the endpoint returns **HTTP 202** immediately and a `BackgroundTasks` job processes the IA, then the frontend polls status. Do NOT make these synchronous again — that freezes the UI.

- **GM Consultations (chat/dudas)** — `app/api/v1/endpoints_gm_consultations.py`:
  - `POST /api/v1/gm-consultations/` → 202 `{consultation_id, status:"processing"}`, enqueues `gm_consultation_service.process_consultation` (Gemini answers the question).
  - `GET /api/v1/gm-consultations/{id}/status` → `{consultation_id, status, answer?, ...}`.
  - `GET /{id}` and `GET /` (history).
  - Model `GMConsultation` (`app/models/gm_consultation.py`); registered in `main.py` and `router.py`.
- **Game-analysis submission (autodiagnóstico)** — `app/api/v1/endpoints_analysis.py`:
  - `POST /api/v1/game-analysis/submit` → **202** `{analysis_id, status:"processing"}` (was 201 + inline feedback). Calls `tutor_service.create_pending_analysis` then enqueues `tutor_service.audit_existing_analysis`.
  - `GET /api/v1/game-analysis/{id}/status` → `{analysis_id, status, has_feedback}`.
  - The `submitGameAnalysis` frontend call now returns `GameAnalysisSubmitResponse`, not `UserGameAnalysisResponse`.
- **Frontend consumer**: `frontend/src/context/GMConsultationContext.tsx` is a global client provider mounted in the dashboard layout. It shows the "El GM está analizando tu duda…" Toast on send, tracks active items, and polls with **adaptive backoff** (`useAdaptivePolling` hook, `frontend/src/hooks/useAdaptivePolling.ts`: 3s → 5s → 8s → 12s → máx 15s) — no longer a fixed 4s interval. The loop stops immediately on `401`/missing token (session expiry) and shows a timeout Toast if a task exceeds the global limit. It plays `useChessSounds().playNotifySound()` and raises a completion Toast/desktop Notification, and exposes `activeCount` (badge) + `trackAnalysis(id, href)`.
- **Custom hooks de IA/API** (`frontend/src/hooks/`): `useChessAnalysis` encapsula el envío asíncrono de autodiagnóstico + polling adaptativo del estado de la auditoría (lo usa `AnalysisFormPanel` para renderizar la auditoría inline, marcando `failed` en error/timeout). `useGMConsultation` hace lo mismo para las consultas (dudas) al GM. Ambos se construyen sobre `useAdaptivePolling` y `src/lib/api.ts`. Mantén la lógica de polling/estado ahí, no la dupliques en los componentes.

---

## Run both servers at once

```bash
start.bat                      # Activates venv, starts servers, and opens the browser
# OR
python start_servers.py        # backend :8000 + frontend :3000 in parallel; Ctrl+C stops both
```

The script `start.bat` is the recommended way: it automatically activates the virtual environment, launches the backend (`uvicorn app.main:app --reload`) and frontend (`npm run dev`), and opens a browser window at `http://localhost:3000/login` after a short delay. `python start_servers.py` is also available if you just want to run the servers.

**Packaging** (tester builds): `build_dist.py` assembles `./dist/`. Notes that differ from naive assumptions:
- PyInstaller runs **`entrenador.spec`** and produces **`dist/entrenador.exe`** (NOT `EntrenadorIA.exe` — that spec exists but `build_dist.py` does not use it; its only check is that `EntrenadorIA.spec` *exists*).
- It needs `output: "standalone"` in `next.config.mjs` (already set) and `stockfish/stockfish.exe`; `server_launcher.py` is the frozen entry that boots both servers. The resulting `dist/` **includes `entrenador_ia.db`** and **excludes the `Historico partidas` folder**. Testers double-click `dist/EntrenadorIA.exe`? No — they launch `dist/start.bat` (per `dist/LEEME.txt`).
- Build: `build_dist.py` (full) or `build_dist.py --skip-frontend` (recompiles only the backend `.exe`; requires `dist/frontend` already assembled — note `frontend/.next/standalone` is rebuilt by the full `npm run build`, so `--skip-frontend` alone will fail if that folder is missing).

---

## Frontend — `frontend/`

```bash
cmd /c "cd frontend && npm run dev"     # http://localhost:3000, redirects to /login
cmd /c "cd frontend && npm run build"   # type-check + production build
cmd /c "cd frontend && npm test"    # Jest + Testing Library (19 suites / 160 tests)
```

Needs `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` (already present).

Spec: `Docs/frontend/frontend_scheme.md` — partially stale (predates análisis/histórico/jugar modules and still lists removed routes/libs). Stack: **Next.js 14.2.5 (App Router) + Tailwind CSS v3.4 + shadcn/ui + React Hook Form + Zod v4**. Auth forms at `src/app/(auth)/login` and `(auth)/register`. Dashboard routes (Sidebar: `src/components/ui/Sidebar.tsx`): `/partidas`, `/analisis`, `/jugar`, `/historico`, `/coach`, `/entrenamiento`, `/consulta-gm`, `/perfil`.

### Frontend quirks (CRITICAL — will waste time if ignored)

- **PowerShell blocks `npm`/`npx` scripts** in this environment (execution-policy error). Run all npm/npx commands through `cmd /c "..."` (e.g. `cmd /c "cd frontend && npm run build"`).
- **`.next` cache corruption between build and dev**: running `npm run build` (production) then `npm run dev` (or vice-versa) reuses a stale `.next` and fails with `Cannot find module './vendor-chunks/...'`. **Fix: delete `frontend/.next` before switching modes** (and before starting `npm run dev` after a build). This is the single most common "it worked before" error.
- **Dashboard pages must not be statically prerendered**: `(dashboard)/layout.tsx` sets `export const dynamic = "force-dynamic"` because the `GMConsultationProvider` (client context) wraps them and they require auth. Do not remove it; if you add a new dashboard page that uses client context/auth, it inherits this. If you change the layout and SSG prerender errors return, that's why.
- **shadcn v4 CLI** (`npx shadcn@latest add`) emits Tailwind v4 + incompatible component code. This repo is Tailwind v3 + Next.js 14. **Do NOT re-run the shadcn CLI** — the committed `src/components/ui/*` were already adapted. `@base-ui/react` is installed as a dependency but components use Radix where possible.
- **Login uses `OAuth2PasswordRequestForm`** (backend `endpoints_user.py`), so it expects `application/x-www-form-urlencoded`, NOT JSON. `src/lib/api.ts` exposes a `form` option for this; JSON bodies go through `body`.
- **`window.location` is non-configurable in this jsdom** — you cannot `Object.defineProperty(window, "location", ...)` nor shadow `href`, and setting `location.href` is a silent no-op. For the 401 handler, assert the real observable instead: token removed (`getToken()` is null) + `ApiError` status. See `src/lib/api.test.ts`.
- **`@testing-library/react` label queries need a real labelable association**: `src/components/ui/form.tsx` `FormControl` uses radix `Slot` so the `id`/`aria-*` land on the `<Input>` (not a wrapper `<div>`). Do NOT revert it to a plain `<div>` — `getByLabelText`/clicking labels would break.
- **Coach report rendering**: `report_markdown` (from `app/services/llm_coach.py`) is parsed with **`react-markdown`** in `coach/page.tsx` inside a `.report-markdown` container (styles in `globals.css`). Don't hand-roll a markdown parser. "Descargar PDF" screenshots that DOM via `html2canvas`+`jsPDF` with a forced white background, so an export made **in dark mode** yields light-on-white text — test PDF exports in light mode.
- **Training completion flow**: Solving puzzles in `/entrenamiento/[taskId]` invokes `completeTrainingTask(taskId)` via `onComplete` in `InteractiveChessBoard`, marking the task completed on the backend and refreshing the dashboard state.
- **Toasts**: use **`sonner`** (`<Toaster/>` mounted in `GMConsultationProvider`). The GM consultation/sound flow uses `useChessSounds().playNotifySound()` (synthesized Web Audio tone, no asset file) — prefer it for "GM finished" notifications.
- **Ruta de perfil**: la única ruta oficial del perfil es `/perfil` (`src/app/(dashboard)/perfil/page.tsx`); la Sidebar enlaza a `/perfil`. No existe una ruta `/profile` duplicada. La página carga los valores por defecto vía `form.reset` dentro de un `useEffect` con dependencia estable `[form]`, lo que evita re-fetches infinitos. Verifica siempre que los enlaces y tests apunten a `/perfil`.
- **Dark mode**: theme handled by `next-themes` via `src/components/theme-provider.tsx` (wrap in `app/layout.tsx`) with the toggle in `src/components/theme-toggle.tsx` (used in `/perfil`). UI uses `dark:` Tailwind variants throughout. Don't remove `class="dark"` support from `globals.css` nor the `ThemeProvider`.
- **Lichess game download**: `src/lib/lichess.ts` (`fetchLichessGames`, `analyzeLichessGame`) + `src/components/analysis/LichessImport.tsx` let a user paste a Lichess username, download their recent public games, store them, and enqueue background analysis. The flow is covered by `LichessImport.test.tsx` (mocks `fetchLichessGames`).
- **Visor de teoría PGN (`src/components/endgame/PgnStudyViewer.tsx`)**: auto-play paso a paso con lectura TTS y sonido de jugada.
  - **Voz masculina española**: la selección vive en `selectSpanishMaleVoice()` (función pura **exportada** y testeada). Orden real: normaliza el nombre quitando tildes (`normalizeVoiceName`, "Microsoft Álvaro…" ≡ "alvaro" — sin esto la voz masculina real de Windows/Edge NUNCA matchea), descarta primero las voces femeninas conocidas (Elvira, Helena, Mónica, Laura, Sabina, Isabel, María, Lucía, Esperanza, Dalia, Salomé, Paloma…) y solo después usa marcadores de calidad ("Neural"/"Natural"/"Enhanced"/"Premium") como desempate entre las restantes. NO pongas "natural"/"microsoft" como criterio de género: "Microsoft Elvira Online (**Natural**)" las contiene y ganaría. "Google español" es voz femenina. El hook `useSpanishMaleVoice()` refresca la voz vía evento `voiceschanged` (carga asíncrona) y el fallback de `speak()` usa la misma función pura.
  - **Configuración GM**: `utterance.lang = "es-ES"`, `rate = 0.95`, `pitch = 0.9`, siempre `speechSynthesis.cancel()` antes de cada locución.
  - **Sonido de jugada**: reutiliza `useChessSounds().playMoveSound()` (`/sounds/move.mp3`) disparado solo cuando el ply AVANZA (`pathPly(path)`; patrón idéntico a `LichessReplay.tsx`): suena en auto-play, clics sobre jugadas/burbujas y flechas ←/→/inicio/final; retroceder calla. Guard con `prevPgnRef` evita sonido fantasma al cambiar de lección.
- **Botón "Volver a la Academia"**: vive en `EndgameLessonPlayer.tsx` FUERA de `<Tabs>` — ver quirk de Tabs más abajo (envolver `TabsList` rompió la pestaña Práctica una vez).
- **Endgame practice mode**: `src/components/endgame/EndgameLessonPlayer.tsx` renders tabs (Lección/Práctica) using the custom `src/components/ui/tabs.tsx`. `EndgamePracticeBoard.tsx` handles interactive Stockfish practice with FEN initialization, drag-and-drop, skill level selector, move history, and auto-win detection. The `POST /api/v1/endgames/stockfish-move` endpoint returns UCI + SAN + resulting FEN. `chess.js` v1.4.0 has `.uci()` on `Move` objects — construct UCI string manually from `from`/`to`/`promotion`. No `Select` shadcn component exists; use native `<select>`.
- **Custom Tabs component**: `src/components/ui/tabs.tsx` is a **custom implementation** (NOT Radix UI). `Tabs` passes `activeTab`/`setActiveTab` to `TabsList` via `React.cloneElement`. `TabsList` forwards these to `TabsTrigger` children via `React.Children.map` + `cloneElement`. `TabsTrigger` calls `setActiveTab` on click. **Do not break this chain** — if you modify `TabsList`, it must accept and forward `activeTab`/`setActiveTab`. Los props inyectados por `cloneElement` se tipan vía la interfaz `TabsContextProps` (sin `as any`). **Caso real ya ocurrido**: envolver `TabsList` en un `<div>` (p.ej. para poner un botón en la misma fila) deja los triggers sin `setActiveTab` y las pestañas dejan de cambiar silenciosamente — `cloneElement` solo llega a hijos directos de `Tabs`. Si necesitas controles junto a las pestañas, colócalos fuera de `<Tabs>` (así está hecho el botón de retorno de `EndgameLessonPlayer`; regresión cubierta en `EndgameLessonPlayer.test.tsx`).

---

## Testing

```bash
# Run all backend tests
.venv\Scripts\python.exe -m pytest tests/ -v

# Run a single backend test file
.venv\Scripts\python.exe -m pytest tests/test_endpoints_analysis.py -v

# Run all frontend tests
cmd /c "cd frontend && npm test"

# Run a single frontend test file
cmd /c "cd frontend && npx jest src/lib/api.test.ts"
```
