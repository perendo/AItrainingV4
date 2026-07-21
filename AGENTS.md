# AGENTS.md

## What this is

FastAPI backend (AI chess coach: Stockfish PGN analysis + Gemini reports + Lichess puzzles) **plus a Next.js 14 frontend**. Backend code, comments, and API tags are in **Spanish** — keep new backend strings/comments Spanish.

## Backend — run & verify

```bash
uvicorn app.main:app --reload        # API at http://127.0.0.1:8000 · Swagger at /api/v1/docs
python -m pytest tests/ -v           # 78 tests across 10 files, config in pytest.ini
```

There is **no `.env.example`** (README's `copy .env.example .env` is stale) — a working `.env` already exists at the repo root. Required keys: `DATABASE_URL`, `STOCKFISH_PATH`, `GEMINI_API_KEY`, `SECRET_KEY`.

PGN upload returns `202 Accepted` with a `task_id`; the analysis runs in a background thread and the client polls `GET /games/tasks/{id}`.

### Backend quirks (easy to miss)

- **Stockfish**: Windows binary at `stockfish/stockfish.exe`, path read from `STOCKFISH_PATH` in `.env`. 0.1s/move — fast but shallow.
- **Gemini model** is hardcoded to `gemini-2.5-flash` in `app/services/llm_coach.py:17`.
- **JWT**: secret from `settings.SECRET_KEY` (`.env`), tokens expire in 7 days. Auth via `Depends(get_current_user_id)`.
- **CORS** in `main.py:29` allows `http://localhost:3000` and `http://127.0.0.1:3000` only — widen for production.
- **Background tasks**: `chess_analyzer.process_pgn_background()` opens its own session via `database_module.SessionLocal()` (module access, not import). Required for test monkey-patching.
- **Tests need the in-memory `StaticPool` engine** from `conftest.py` or endpoint tests fail with "no such table". `test_endpoints_coach.py` patches `llm_coach_service.client.models.generate_content` (method, not constructor). `test_endpoints_game.py` spawns real Stockfish (~0.7s/test, ~2min full suite).
- **Exercise/puzzle endpoints need a populated `chess_puzzles` table.** One-time setup: `python ejercicios/import_puzzles.py` reads `ejercicios/lichess_db_puzzle.csv` (up to ~50k puzzles). Without it, `/api/v1/exercise` puzzle flows have no data.

### Backend conventions

- Models inherit `TimeStampedModel` (`app/models/base.py`); import new models in `main.py` for table creation.
- Schemas keep `model_config = {"from_attributes": True}`.
- Services are exported as singletons (e.g. `chess_analyzer_service = ChessAnalyzerService()`).
- New endpoints: add `endpoints_*.py` in `app/api/v1/` and register in `router.py`.

## Run both servers at once

```bash
python start_servers.py        # backend :8000 + frontend :3000 in parallel; Ctrl+C stops both
```

This launches `uvicorn app.main:app --reload` (from repo root) and, via `cmd /c`, `npm run dev` in `frontend/`. Use it instead of two terminals.

## Frontend — `frontend/`

```bash
cd frontend && npm run dev     # http://localhost:3000, redirects to /login
cd frontend && npm run build   # type-check + production build
```

Spec: `Docs/frontend/frontend_scheme.md`. Stack: **Next.js 14.2.5 (App Router) + Tailwind CSS v3.4 + shadcn/ui + React Hook Form + Zod v4**. Auth forms implemented at `src/app/(auth)/login` and `(auth)/register`.

### Frontend quirks (CRITICAL — will waste time if ignored)

- **PowerShell blocks `npm`/`npx` scripts** in this environment (execution-policy error). Run all npm/npx commands through `cmd /c "..."` (e.g. `cmd /c "cd frontend && npm run build"`).
- **shadcn v4 CLI emits Tailwind v4 + `@base-ui/react` code, but this repo is Tailwind v3 + Next.js 14.** The committed `src/components/ui/*` were already rewritten to standard React/HTML + Radix. **Do NOT re-run `npx shadcn@latest add`** — it reintroduces incompatible v4 components.
- **Login uses `OAuth2PasswordRequestForm`** (backend `endpoints_user.py:48`), so it expects `application/x-www-form-urlencoded`, NOT JSON. `src/lib/api.ts` exposes a `form` option for this; JSON bodies go through `body`.

### Frontend conventions

- `src/lib/api.ts` `apiFetch` auto-attaches the JWT from `localStorage` and redirects to `/login` on 401.
- `src/lib/types.ts` mirrors backend Pydantic schemas; keep in sync.
- `src/lib/validations/auth.ts` holds Zod v4 schemas (`loginSchema`, `registerSchema` with `.refine` on matching passwords).

## Deployment

- **Backend (Render)**: PostgreSQL (`DATABASE_URL`), `SECRET_KEY`, `GEMINI_API_KEY`, `STOCKFISH_PATH`; `psycopg2-binary` in `requirements.txt`.
- **Frontend (Vercel)**: set `NEXT_PUBLIC_API_URL` to the backend URL; auto-deploy on push to `main`.
