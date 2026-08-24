# EntrenadorIA â€” Coach de Ajedrez con Inteligencia Artificial

Plataforma de entrenamiento de ajedrez que combina **anÃ¡lisis de partidas con Stockfish**, **informes pedagÃ³gicos generados con Gemini** y **planes de entrenamiento basados en puzles reales de Lichess**, todo envuelto en una aplicaciÃ³n web moderna (FastAPI + Next.js).

El jugador sube sus partidas en formato PGN, el sistema detecta errores jugada a jugada (Blunder, Mistake, Inaccuracy), un LLM traduce esos datos en un diagnÃ³stico pedagÃ³gico personalizado y la plataforma le asigna un plan semanal de tÃ¡cticas, estrategia y finales adaptado a su ELO.

---

## âœ¨ Funcionalidades

### ðŸ§  Backend

- **AutenticaciÃ³n JWT** con bcrypt (registro, login, perfil).
- **AnÃ¡lisis de partidas PGN** en segundo plano: filtra, elimina duplicados y analiza cada jugada con Stockfish (proceso asÃ­ncrono con polling de tareas).
- **Informes de coaching con IA**: Gemini analiza el historial de errores y genera un diagnÃ³stico estructurado (patrones, partidas de referencia, plan de acciÃ³n).
- **Partidas de Grandes Maestros**: bÃºsqueda de partidas clÃ¡sicas (Morphy, Capablanca, Alekhine, Karpov, Petrosian) con cachÃ© local y generaciÃ³n vÃ­a IA.
- **AutodiagnÃ³stico tutorizado**: el jugador analiza una partida de un GM y Gemini **audita su anÃ¡lisis** (fases, preguntas crÃ­ticas, factores posicionales, conclusiones) con feedback correcto/incorrecto.
- **Planes de entrenamiento semanales**: tareas de TÃ¡ctica / Estrategia / Finales con puzles reales de Lichess adaptados por tema y ELO.

### ðŸ–¥ï¸ Frontend

- **AutenticaciÃ³n** (login / registro) con sesiÃ³n persistente vÃ­a JWT.
- **GestiÃ³n de partidas**: subida de PGN con progreso en vivo, historial y detalle con tablero interactivo.
- **Coach IA**: generaciÃ³n de informes y consulta del historial de diagnÃ³sticos.
- **Entrenamiento**: plan semanal y resoluciÃ³n de puzles interactivos.
- **AnÃ¡lisis de partidas de GM**: tablero de solo lectura + formulario modular de 4 bloques plegables (Fases, Preguntas CrÃ­ticas, Factores Posicionales, Conclusiones) con **guardado automÃ¡tico de borrador** y envÃ­o a auditorÃ­a del Gran Maestro.

---

## ðŸ§± Stack tecnolÃ³gico

### Backend

| Componente       | TecnologÃ­a                                    |
|------------------|-----------------------------------------------|
| Framework        | FastAPI 0.111                                 |
| ORM              | SQLAlchemy 2.0                                |
| Base de datos    | SQLite (dev, modo WAL) / PostgreSQL (prod)    |
| Motor de ajedrez | Stockfish (binario local)                     |
| LLM coaching     | Google Gemini (`gemini-3.7-flash`)           |
| LLM tutor        | Google Gemini (`gemini-3.7-flash`)           |
| AutenticaciÃ³n    | PyJWT + passlib/bcrypt                        |
| ValidaciÃ³n       | Pydantic 2                                    |

### Frontend

| Capa            | TecnologÃ­a                              |
|-----------------|-----------------------------------------|
| Framework       | Next.js 14.2 (App Router)               |
| Lenguaje        | TypeScript 5                            |
| Estilos         | Tailwind CSS 3 + shadcn/ui              |
| Forms           | React Hook Form + Zod                   |
| Tablero         | react-chessboard + chess.js             |
| HTTP client     | Fetch con wrapper propio (interceptor JWT) |

---

## ðŸ“ Estructura del repositorio

```
â”œâ”€â”€ app/                          # Backend FastAPI
â”‚   â”œâ”€â”€ main.py                   # Entrada, CORS, registro de rutas, creaciÃ³n de tablas
â”‚   â”œâ”€â”€ core/                     # Config (.env), BD, seguridad, middleware
â”‚   â”œâ”€â”€ models/                   # Modelos ORM (users, games, puzzles, gm_games, ...)
â”‚   â”œâ”€â”€ schemas/                  # Modelos Pydantic (request/response)
â”‚   â”œâ”€â”€ repositories/             # Capa de acceso a datos (patrÃ³n repositorio)
â”‚   â”œâ”€â”€ services/                 # LÃ³gica de negocio (anÃ¡lisis, coach, tutor, puzzles)
â”‚   â””â”€â”€ api/v1/                   # Endpoints registrados en router.py
â”œâ”€â”€ frontend/                     # Frontend Next.js
â”‚   â””â”€â”€ src/
â”‚       â”œâ”€â”€ app/(auth)/           # Login y registro
â”‚       â”œâ”€â”€ app/(dashboard)/      # Partidas, coach, entrenamiento, perfil, anÃ¡lisis GM
â”‚       â”œâ”€â”€ components/           # UI (shadcn/ui), tablero, puzles, anÃ¡lisis
â”‚       â””â”€â”€ lib/                  # api.ts, types.ts, validaciones
â”œâ”€â”€ ejercicios/                   # Script de importaciÃ³n de puzles
â”œâ”€â”€ stockfish/                    # Binario de Stockfish (no versionado)
â”œâ”€â”€ Docs/                         # DocumentaciÃ³n del proyecto
â”œâ”€â”€ tests/                        # Suite de pruebas pytest
â”œâ”€â”€ start_servers.py              # Lanza backend y frontend en paralelo
â””â”€â”€ AGENTS.md                     # Notas de arquitectura para desarrollo con IA
```

---

## ðŸš€ Puesta en marcha

### Requisitos previos

- Python 3.10+
- Node.js 18+
- [Stockfish](https://stockfishchess.org/download/) (binario en `stockfish/stockfish.exe` en Windows)
- API key de [Google AI Studio](https://aistudio.google.com/apikey)

### 1. Backend

```bash
# Entorno virtual e instalaciÃ³n de dependencias
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac

pip install -r requirements.txt
```

Crea un archivo `.env` en la raÃ­z del repositorio con las siguientes variables:

```env
DATABASE_URL="sqlite:///./entrenador_ia.db"
STOCKFISH_PATH="stockfish/stockfish.exe"
GEMINI_API_KEY="tu-api-key-de-gemini"
SECRET_KEY="clave-secreta-para-jwt"
```

> â„¹ï¸ No existe `.env.example`; el `.env` debe crearse manualmente con las claves anteriores.

Arranca el servidor:

```bash
uvicorn app.main:app --reload
```

- API: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/api/v1/docs`

### 2. Frontend

```bash
cd frontend
npm install
```

Crea `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL="http://127.0.0.1:8000"
```

```bash
npm run dev
```

AplicaciÃ³n disponible en `http://localhost:3000`.

### 3. Ambos a la vez

```bash
python start_servers.py        # backend :8000 + frontend :3000 en paralelo
```

### 4. Importar puzles de Lichess (opcional pero recomendado)

```bash
python ejercicios/import_puzzles.py
```

Importa puzles filtrados de `ejercicios/lichess_db_puzzle.csv` (popularidad â‰¥ 80, reproducciones â‰¥ 500, hasta 50.000). Sin este paso, los flujos de puzles devuelven resultados vacÃ­os.

---

## ðŸ”Œ API

Todas las rutas se sirven bajo el prefijo `/api/v1` y requieren autenticaciÃ³n JWT salvo las indicadas.

### Usuarios â€” `/users`

| MÃ©todo | Ruta        | DescripciÃ³n                                      | Auth |
|--------|-------------|--------------------------------------------------|------|
| POST   | `/register` | Registrar nuevo jugador                          | No   |
| POST   | `/login`    | Iniciar sesiÃ³n (`OAuth2PasswordRequestForm`)     | No   |
| GET    | `/me`       | Obtener perfil                                   | SÃ­   |
| PUT    | `/me`       | Actualizar perfil                                | SÃ­   |

### Partidas â€” `/games`

| MÃ©todo | Ruta            | DescripciÃ³n                                        |
|--------|-----------------|----------------------------------------------------|
| POST   | `/upload-pgn`   | Subir PGN â†’ `202 Accepted` con `task_id`           |
| GET    | `/tasks/{id}`   | Polling del estado de la tarea de anÃ¡lisis         |
| GET    | `/`             | Listar partidas analizadas del usuario             |

### Coach â€” `/coach`

| MÃ©todo | Ruta          | DescripciÃ³n                                    |
|--------|---------------|------------------------------------------------|
| POST   | `/diagnostic` | Generar diagnÃ³stico pedagÃ³gico con Gemini      |
| GET    | `/history`    | Historial de informes del entrenador           |

### Partidas de Grandes Maestros â€” `/gm-games`

| MÃ©todo | Ruta           | DescripciÃ³n                                        |
|--------|----------------|----------------------------------------------------|
| GET    | `/search`      | Buscar partidas por GM y/o tema (con cachÃ©)        |
| GET    | `/{game_id}`   | Obtener una partida GM por ID                      |

### Entrenamiento â€” `/training`

| MÃ©todo | Ruta                        | DescripciÃ³n                                        |
|--------|-----------------------------|----------------------------------------------------|
| GET    | `/pending-tasks`            | Tareas pendientes del plan + partida GM asignada   |
| GET    | `/all-tasks`                | Todas las tareas del plan semanal activo           |
| POST   | `/weekly/generate`          | Generar nuevo plan semanal (desactiva el anterior) |
| GET    | `/tasks/{id}/next-puzzle`   | Puzle aleatorio relevante para una tarea           |
| POST   | `/tasks/{id}/complete`      | Marcar una unidad de tarea como completada         |

### AnÃ¡lisis de partidas GM â€” `/game-analysis`

| MÃ©todo | Ruta            | DescripciÃ³n                                                 |
|--------|-----------------|-------------------------------------------------------------|
| POST   | `/submit`       | Enviar autodiagnÃ³stico para auditorÃ­a de Gemini             |
| GET    | `/`             | Historial de autodiagnÃ³sticos del usuario                   |
| GET    | `/{analysis_id}`| Obtener un autodiagnÃ³stico por ID                           |

---

## ðŸ§ª Testing

```bash
# Suite completa
python -m pytest tests/ -v

# Archivo individual
python -m pytest tests/test_endpoints_game.py -v
```

> â„¹ï¸ La suite tarda ~2 minutos: los tests de Stockfish lanzan el binario real. Los tests usan una base de datos SQLite en memoria (`StaticPool`).

---

## â˜ï¸ Despliegue

### Backend (Render)

1. Crear un **Web Service** conectado al repositorio.
2. Build: `pip install -r requirements.txt`
3. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. AÃ±adir una base de datos **PostgreSQL** y configurar las variables de entorno (`DATABASE_URL`, `SECRET_KEY`, `GEMINI_API_KEY`, `STOCKFISH_PATH`).

### Frontend (Vercel)

1. Importar el proyecto seleccionando la carpeta `frontend/`.
2. Configurar `NEXT_PUBLIC_API_URL` apuntando al backend.
3. Deploy automÃ¡tico en cada push a `main`.

> âš ï¸ Stockfish no viene preinstalado en Render; instÃ¡lalo en el buildpack (p. ej. `apt-get install -y stockfish`) o usa una imagen Docker con el binario incluido.

---

## ðŸ“„ Licencia

Proyecto privado. Todos los derechos reservados.
