# AGENTS.md

FastAPI backend (AI chess coach: Stockfish PGN analysis + Gemini reports + Lichess puzzles, autodiagnóstico auditado por Gemini para partidas de GM y propias) **más un frontend Next.js 14 (App Router)**. El backend usa código/comentarios/tags de API en **español** — mantén los nuevos strings/comentarios en español.

## Backend — ejecutar y verificar

```bash
uvicorn app.main:app --reload        # API en http://127.0.0.1:8000 · Swagger en /api/v1/docs
.venv\Scripts\python.exe -m pytest tests/ -v   # 16 archivos de test (~114 tests), config en pytest.ini
```

- Python corre desde el `.venv` del repo (3.12) — `python` plano puede no resolverse. `start_servers.py`, `server_launcher.py` y `build_dist.py` ya usan `.venv\Scripts\python.exe`.
- `.env` existe en la raíz. Claves requeridas: `DATABASE_URL`, `STOCKFISH_PATH`, `GEMINI_API_KEY`, `SECRET_KEY`.

### Quirks de backend (fáciles de errar)

- **Stockfish**: binario Windows en `stockfish/stockfish.exe`, ruta desde `STOCKFISH_PATH`. 0.1s/move (rápido pero superficial).
- **Gemini centralizado**: todo el IA usa el singleton `gemini_client` en `app/services/gemini_client.py` (modelo alias `gemini-flash-latest`). **No inicialices `genai.GenerativeModel`** ni dupliques `genai.configure` en los servicios; llama `gemini_client.generate_json(...)` / `generate_text(...)`. El timeout (`settings.GEMINI_TIMEOUT_SECONDS`, default 120) se aplica en `GeminiClient._generate`.
- **Login** (`POST /api/v1/users/login`) es `def` síncrono (FastAPI lo corre en threadpool, no bloquea el loop). bcrypt (`pwd_context.verify()`) es lento por diseño (~100-300 ms, no es un bug). Devuelve solo `{access_token, token_type}`. JWT: secreto `settings.SECRET_KEY`, expira en 7 días; auth vía `Depends(get_current_user_id)`.
- **CORS**: `CORS_ORIGINS` en `.env` (comma-separated), default `http://localhost:3000,http://127.0.0.1:3000`; `*` abre dev (sin credenciales).
- **Tareas de fondo** abren suya propia sesión con `background_session()` (`app/core/database.py`), no con `SessionLocal()` directo — así el monkey-patch de `conftest` (swapea `database_module.SessionLocal`) sigue funcionando. Lo usan `tutor_service.audit_existing_analysis`, `gm_consultation_service.process_consultation`, `chess_analyzer.process_pgn_background`.
- **Tests**: necesitan el engine `StaticPool` in-memory de `conftest.py` o fallan con "no such table". Los tests de servicios de Gemini patchan `GeminiClient.model` con `PropertyMock`. `test_endpoints_game.py` usa Stockfish real (~0.7s/test).
- **Logging, no `print()`**: usa `logging.getLogger(__name__)`; en excepciones `logger.error(..., exc_info=True)`.
- **Modelo canónico de entrenamiento**: `TrainingTask`/`WeeklyPlan` viven solo en `app/models/exercise.py`. `app/models/training.py` fue eliminado (colisión de tablas). No lo recrees.
- **Puzzles**: endpoints de entrenamiento consultan `chess_puzzles`. Import one-time: `python ejercicios/import_puzzles.py` lee `ejercicios/lichess_db_puzzle.csv`. `ejercicios/` no está en Git (datos pesados, solo local).
- **Alembic**: el esquema se versiona con Alembic; `app/main.py` aplica `alembic upgrade head` al arrancar (con respaldo a `create_all`+`stamp` si la BD es previa). Para evolucionar: editar modelos y `.venv\Scripts\python.exe -m alembic revision --autogenerate -m "mensaje"`. `env.py` usa `render_as_batch=True` (SQLite).
- **Tareas robustas**: `process_consultation` y `audit_existing_analysis` capturan excepción/timeout de Gemini y marcan el registro `failed` con `error_message` (nunca quedan en `processing`). Al arrancar, `cleanup_stuck_background_tasks()` marca como `failed` las tareas colgadas.
- **`response_schema=False` en `generate_json`**: úsalo cuando el esquema Pydantic tenga dicts libres (`payload: dict`), para evitar el error `Unknown field for Schema: additionalProperties` de la SDK. Valida localmente contra el esquema aunque no envíe `response_schema` a Gemini.

### Módulo de Finales Teóricos

- Modelos `EndgameLesson` (tabla `endgame_lessons`), `EndgameTimelineEvent` (`endgame_timeline_events`), `UserEndgameProgress` (`user_endgame_progress`) en `app/models/endgame`. Importa todos los modelos vía `import app.db.base`. La sesión se re-exporta en `app/db/session.py` para scripts (no rompe el monkey-patch de tests).
- **CLI de población**: `python -m app.cli seed-endgames | import-pgns [--dry-run] | gen-content | gen-audio [--force] [--voice es-ES-AlvaroNeural]`. La lógica está en `app/services/endgame_admin_service.py` (no hay scripts sueltos). `gen-audio` usa edge-tts (voz `es-ES-AlvaroNeural`, fallback gTTS) y guarda `audio/endgames/{slug}.mp3`.
- **Endpoints** (`app/api/v1/endgames.py`, prefijo `/endgames`): `GET /lessons` (catálogo por `category` + estado de progreso), `GET /lessons/{slug}` (`initial_fen`, `audio_url`, `podcast_script`, `timeline_events`), `POST /lessons/{slug}/progress`, `POST /stockfish-move` (devuelve `{move_uci, move_san, fen_after}`, sin auth).
- **Contenido**: `EndgameGeneratorService.generate_lesson_content(lesson_id, db)` pide a Gemini vía `generate_json(..., response_schema=False)`, actualiza `podcast_script` y reescribe `timeline_events` de forma idempotente.
- **Estáticos**: `app/main.py` monta `StaticFiles(directory=app/static)` en `/static`.

## Flujos asíncronos de GM (arquitectura clave)

"Consultas al GM" y "Evaluación del Gran Maestro" son **no bloqueantes**: el endpoint devuelve **HTTP 202** y un `BackgroundTasks` procesa la IA; el frontend hace polling. **No los hagas síncronos** — congela la UI.

- **Consultas** (`app/api/v1/endpoints_gm_consultations.py`): `POST /api/v1/gm-consultations/` → 202 `{consultation_id, status:"processing"}`; `GET /{id}/status`. Modelo `GMConsultation`.
- **Autodiagnóstico** (`app/api/v1/endpoints_analysis.py`): `POST /api/v1/game-analysis/submit` → 202 `{analysis_id, status:"processing"}`; `GET /{id}/status`. El frontend espera `GameAnalysisSubmitResponse`, no `UserGameAnalysisResponse`.
- **Consumidor frontend**: `frontend/src/context/GMConsultationContext.tsx` (provider global en el layout del dashboard) muestra el Toast "El GM está analizando tu duda…" y hace polling con backoff adaptativo (`useAdaptivePolling`, 3s→5s→8s→12s→15s). Para en `401`/token ausente. Suena `useChessSounds().playNotifySound()`.
- **Hooks**: `useChessAnalysis` y `useGMConsultation` encapsulan envío + polling sobre `useAdaptivePolling` y `src/lib/api.ts`. No dupliques esa lógica en componentes.

## Levantar ambos servidores

```bash
start.bat                      # activa venv, levanta backend+frontend, abre el navegador en /login
# O
python start_servers.py        # backend :8000 + frontend :3000 en paralelo; Ctrl+C para ambos
```

**Empaquetado** (`build_dist.py` → `./dist/`):
- PyInstaller corre **`entrenador.spec`** → **`dist/entrenador.exe`** (NO `EntrenadorIA.exe`; ese spec existe pero no se usa). Requiere `output:"standalone"` en `next.config.mjs` y `stockfish/stockfish.exe`. `server_launcher.py` es el entry congelado.
- `dist/` incluye `entrenador_ia.db` y excluye `Historico partidas`. Los testers lanzan `dist/start.bat` (no `dist/EntrenadorIA.exe`).
- `build_dist.py --skip-frontend` recompila solo el backend `.exe`; requiere `dist/frontend` ya ensamblado.

## Frontend — `frontend/`

```bash
cmd /c "cd frontend && npm run dev"     # http://localhost:3000, redirige a /login
cmd /c "cd frontend && npm run build"   # type-check + build de producción
cmd /c "cd frontend && npm test"        # Jest + Testing Library (20 suites)
```

- `frontend/.env.local` debe tener `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`.
- Stack: **Next.js 14.2 (App Router) + Tailwind v3 + shadcn/ui + React Hook Form + Zod**. Auth en `src/app/(auth)/login` y `register`. Rutas del dashboard (Sidebar): `/partidas`, `/analisis`, `/jugar`, `/historico`, `/coach`, `/entrenamiento`, `/consulta-gm`, `/perfil`.

### Quirks de frontend (CRÍTICO — pierden tiempo si se ignoran)

- **PowerShell bloquea `npm`/`npx`** en este entorno (execution-policy). Corre todo vía `cmd /c "..."`.
- **Corrupción de caché `.next`** entre build y dev: `npm run build` y luego `npm run dev` (o viceversa) reusa un `.next` viejo y falla con `Cannot find module './vendor-chunks/...'`. **Borra `frontend/.next` antes de cambiar de modo.**
- **Páginas del dashboard no se prerenderizan**: `(dashboard)/layout.tsx` tiene `export const dynamic = "force-dynamic"` (por `GMConsultationProvider` + auth). No lo quites.
- **No reejecutes el CLI de shadcn** (`npx shadcn@latest add`): emite Tailwind v4 + código incompatible. Este repo es Tailwind v3; los `src/components/ui/*` ya están adaptados.
- **Login usa `OAuth2PasswordRequestForm`** → espera `application/x-www-form-urlencoded`, no JSON. `src/lib/api.ts` expone opción `form`; los JSON van en `body`.
- **`window.location` no es configurable en jsdom**: no uses `Object.defineProperty(window,"location",...)` ni asignes `location.href` (no-op). Para el handler 401, afirma `getToken()===null` + `ApiError` status (ver `src/lib/api.test.ts`).
- **`FormControl`** (`src/components/ui/form.tsx`) usa radix `Slot` para que `id`/`aria-*` caigan en el `<Input>`; no lo reviertas a `<div>` o `getByLabelText` se rompe.
- **Reporte del coach**: `report_markdown` se renderiza con `react-markdown` en `coach/page.tsx` dentro de `.report-markdown`. "Descargar PDF" usa html2canvas+jsPDF con fondo blanco forzado → exportar en dark mode da texto claro sobre blanco; prueba PDFs en light mode.
- **Perfil**: la única ruta es `/perfil` (la Sidebar enlaza ahí; no existe `/profile`). Carga defaults con `form.reset` en `useEffect` con dep `[form]` para evitar re-fetch infinito.
- **Dark mode**: `next-themes` vía `src/components/theme-provider.tsx`, toggle en `theme-toggle.tsx`. No quites el soporte `dark:` de `globals.css` ni el `ThemeProvider`.
- **Lichess**: `src/lib/lichess.ts` + `src/components/analysis/LichessImport.tsx` descargan partidas públicas por usuario y encolan análisis en background (cubierto por `LichessImport.test.tsx`).
- **Visor PGN de finales** (`src/components/endgame/PgnStudyViewer.tsx`): auto-play con TTS y sonido de jugada. Voz masculina española en `selectSpanishMaleVoice()` (pura, exportada, testeada): normaliza quitando tildes (`normalizeVoiceName`) y descarta primero voces femeninas conocidas antes de usar marcadores de calidad ("Neural"/"Natural"/...) como desempate — **no** uses "natural"/"microsoft" como criterio de género. `utterance.lang="es-ES"`, `rate=0.95`, `pitch=0.9`, `speechSynthesis.cancel()` antes de cada locución. Suena `useChessSounds().playMoveSound()` solo cuando el ply avanza (guard `prevPgnRef`).
- **Tabs personalizado** (`src/components/ui/tabs.tsx`, NO Radix): `Tabs` pasa `activeTab`/`setActiveTab` a `TabsList` vía `cloneElement`, y `TabsList` los reenvía a `TabsTrigger`. **No envuelvas `TabsList` en un `<div>`** — `cloneElement` solo llega a hijos directos y los triggers perderían `setActiveTab` (regresión en `EndgameLessonPlayer.test.tsx`). El botón "Volver a la Academia" vive fuera de `<Tabs>`.
- **Práctica de finales** (`EndgameLessonPlayer.tsx` + `EndgamePracticeBoard.tsx`): usa `POST /api/v1/endgames/stockfish-move`. `chess.js` v1.4.0: construye UCI manualmente desde `from`/`to`/`promotion`. No existe componente `Select` shadcn; usa `<select>` nativo.

## Testing

```bash
.venv\Scripts\python.exe -m pytest tests/ -v                 # todos los backend
.venv\Scripts\python.exe -m pytest tests/test_endpoints_analysis.py -v   # un archivo
cmd /c "cd frontend && npm test"                             # todos los frontend
cmd /c "cd frontend && npx jest src/lib/api.test.ts"         # un archivo
```
