# Frontend — Esquema de Arquitectura

## Stack

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router) | 14+ |
| Lenguaje | TypeScript | 5+ |
| Estilos | Tailwind CSS | 3+ |
| Componentes | shadcn/ui | latest |
| Estado (server) | TanStack Query (React Query) | 5+ |
| Forms | React Hook Form + Zod | latest |
| Chess UI | react-chessboard + chess.js | latest |
| HTTP client | Fetch con wrapper propio | — |

## Decisiones clave

- **JWT**: Almacenado en `localStorage`, inyectado via interceptor en `lib/api.ts`
- **BD desarrollo**: SQLite (sin cambios en backend)
- **BD producción**: PostgreSQL en Render (free tier)

---

## Estructura de carpetas

```
frontend/
  src/
    app/
      (auth)/
        layout.tsx            # Layout sin sidebar (solo formularios)
        login/
          page.tsx            # Formulario login
        register/
          page.tsx            # Formulario registro
      (dashboard)/
        layout.tsx            # Sidebar + navbar + guard de auth
        partidas/
          page.tsx            # Historial de partidas
          upload/
            page.tsx          # Upload PGN con polling
          [id]/
            page.tsx          # Detalle de partida + tablero
        coach/
          page.tsx            # Generar informe + historial
        entrenamiento/
          page.tsx            # Plan semanal + puzzles
        perfil/
          page.tsx            # Ver/editar perfil
      layout.tsx              # Root layout (providers, fonts)
      page.tsx                # Redirect a /partidas o /login
    components/
      chess/
        Board.tsx             # Wrapper de react-chessboard
        PuzzleSolver.tsx      # Interfaz interactiva de puzzles
        GameAnalysis.tsx      # Tablero + lista de errores
      ui/                     # shadcn/ui components (button, card, input...)
      layout/
        Sidebar.tsx           # Navegación lateral
        Navbar.tsx            # Barra superior con avatar
        AuthGuard.tsx         # Redirect si no hay token
      partidas/
        GameTable.tsx         # Tabla de historial
        PGNUploader.tsx       # Dropzone + polling
        GameDetail.tsx        # Detalle de partida
      coach/
        DiagnosticButton.tsx  # Botón generar informe
        ReportCard.tsx        # Tarjeta de informe
        ReportHistory.tsx     # Lista de informes
      entrenamiento/
        WeeklyPlan.tsx        # Tarjetas de tareas
        CategoryBadge.tsx     # Badge de categoría
    lib/
      api.ts                  # Fetch wrapper con JWT interceptor
      auth.ts                 # Token management (get/set/remove)
      types.ts                # Tipos TypeScript (espejo de Pydantic schemas)
      utils.ts                # Utilidades (format dates, etc.)
    hooks/
      useAuth.ts              # Login, register, logout, user
      useTaskPolling.ts       # Polling de /games/tasks/{id}
      useGames.ts             # CRUD de partidas
      useCoach.ts             # Diagnóstico + historial
      useTraining.ts          # Plan semanal + puzzles
    middleware.ts              # Next.js middleware (redirect si no token)
  public/
    favicon.ico
  .env.local                  # NEXT_PUBLIC_API_URL
  tailwind.config.ts
  next.config.ts
  package.json
```

---

## Flujo de autenticación

```
1. Usuario hace login → POST /users/login
2. Backend devuelve { access_token, token_type }
3. Frontend guarda access_token en localStorage
4. Cada petición HTTP → interceptor lee token de localStorage
5. Header: Authorization: Bearer <token>
6. Si 401 → limpiar localStorage → redirect /login
```

---

## Módulos y endpoints

### Auth (`/(auth)/`)

| Ruta | Método | Endpoint | Descripción |
|---|---|---|---|
| `/register` | POST | `/api/v1/users/register` | Registro de usuario |
| `/login` | POST | `/api/v1/users/login` | Login, devuelve JWT |
| `/perfil` | GET | `/api/v1/users/me` | Datos del usuario |
| `/perfil` | PUT | `/api/v1/users/me` | Actualizar perfil |

### Partidas (`/(dashboard)/partidas/`)

| Ruta | Método | Endpoint | Descripción |
|---|---|---|---|
| `/partidas` | GET | `/api/v1/games/` | Historial de partidas |
| `/partidas/upload` | POST | `/api/v1/games/upload-pgn` | Upload PGN (202 Accepted) |
| `/partidas/upload` | GET | `/api/v1/games/tasks/{id}` | Polling de estado de tarea |

### Coach IA (`/(dashboard)/coach/`)

| Ruta | Método | Endpoint | Descripción |
|---|---|---|---|
| `/coach` | POST | `/api/v1/coach/diagnostic` | Generar informe con Gemini |
| `/coach` | GET | `/api/v1/coach/history` | Historial de informes |

### Entrenamiento (`/(dashboard)/entrenamiento/`)

| Ruta | Método | Endpoint | Descripción |
|---|---|---|---|
| `/entrenamiento` | GET | `/api/v1/exercise/` | Tareas con puzzles |
| `/entrenamiento` | GET | `/api/v1/exercise/weekly/active` | Plan semanal activo |
| `/entrenamiento` | POST | `/api/v1/exercise/weekly/generate` | Generar plan semanal |
| `/entrenamiento` | POST | `/api/v1/exercise/validate-puzzle` | Validar solución puzzle |

---

## Tipos TypeScript (espejo de Pydantic schemas)

```typescript
// lib/types.ts

// Auth
interface UserCreate {
  username: string;
  full_name?: string;
  chess_online_nick?: string;
  current_elo?: number;
  target_elo?: number;
  password: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
}

interface UserResponse {
  id: number;
  username: string;
  full_name?: string;
  chess_online_nick?: string;
  current_elo: number;
  target_elo: number;
  created_at: string;
}

// Games
interface MoveErrorResponse {
  id: number;
  game_id: number;
  move_number: number;
  algebraic_move: string;
  error_type: string;
  eval_difference: number;
  tactical_theme: string;
  description?: string;
}

interface GameResponse {
  id: number;
  user_id: number;
  white_player: string;
  black_player: string;
  result: string;
  player_color: string;
  pgn_content: string;
  created_at: string;
  errors: MoveErrorResponse[];
}

interface TaskResponse {
  id: number;
  filename: string;
  status: "pending" | "processing" | "completed" | "failed";
  processed: number;
  skipped_duplicate: number;
  skipped_not_user: number;
  errors_found: number;
  error_message?: string;
  created_at: string;
}

// Coach
interface CoachReportResponse {
  id: number;
  user_id: number;
  report_text: string;
  estimated_level: string;
  created_at: string;
  updated_at: string;
}

// Training
interface PuzzleResponse {
  puzzle_id: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string;
}

interface TrainingTaskResponse {
  id: number;
  category: "TACTICS" | "ENDGAME" | "STRATEGY";
  description: string;
  target_count: number;
  current_count: number;
  is_completed: boolean;
  created_at: string;
  puzzles?: PuzzleResponse[];
}

interface WeeklyPlanResponse {
  id: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  compliance_rate: number;
  tasks: TaskInWeeklyPlan[];
}

interface TaskInWeeklyPlan {
  id: number;
  category: string;
  description: string;
  current_count: number;
  target_count: number;
  is_completed: boolean;
}

interface SolutionValidationRequest {
  task_id: number;
  puzzle_id: string;
  user_moves: string;
}
```

---

## Cronograma de desarrollo

| Semana | Fase | Entregable |
|---|---|---|
| 1 | Scaffolding + Auth | Proyecto configurado, login/registro funcionando |
| 2 | Partidas | Upload PGN con polling, historial, detalle con tablero |
| 3 | Coach + Entrenamiento | Generar informes, plan semanal, puzzles interactivos |
| 4 | Deploy + Polish | Backend en Render (PostgreSQL), frontend en Vercel, testing E2E |

---

## Deployment

### Backend (Render)

1. Crear cuenta en Render
2. Nuevo "Web Service" → conectar repo GitHub
3. Configurar:
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Añadir PostgreSQL (free tier) → copiar `DATABASE_URL` a variables de entorno
5. Añadir variable: `SECRET_KEY=<clave-random-larga>`
6. Añadir variable: `GEMINI_API_KEY=<tu-key>`
7. Añadir variable: `STOCKFISH_PATH=<ruta-en-render>` (o instalar Stockfish via buildpack)

### Frontend (Vercel)

1. Crear cuenta en Vercel
2. Nuevo proyecto → conectar repo GitHub (carpeta `frontend/`)
3. Configurar variable de entorno: `NEXT_PUBLIC_API_URL=https://tu-backend.onrender.com`
4. Deploy automático en cada push a `main`

### Nota sobre Stockfish en Render

Stockfish no está disponible por defecto en Render. Opciones:
- Instalar via apt en el buildpack: `apt-get install -y stockfish`
- Usar Docker image con Stockfish preinstalado
- Para MVP: desactivar análisis Stockfish en producción (solo Gemini)
