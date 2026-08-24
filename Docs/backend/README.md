# EntrenadorIA Backend

Backend de una plataforma de entrenamiento de ajedrez con inteligencia artificial. Analiza partidas de los usuarios mediante Stockfish, detecta patrones de error recurrentes y genera informes de coaching personalizados con Google Gemini.

---

## Funcionalidades principales

- **Registro y autenticaciÃ³n** de jugadores con JWT y encriptaciÃ³n bcrypt.
- **AnÃ¡lisis de partidas PGN**: sube un archivo con N partidas y el sistema las filtra, detecta duplicados y analiza cada jugada en busca de errores (Blunder, Mistake, Inaccuracy) usando Stockfish.
- **Informes de coaching con IA**: Gemini genera un diagnÃ³stico pedagÃ³gico en Markdown con patrones detectados, referencias a partidas concretas y un plan de acciÃ³n personalizado.
- **Plan de entrenamiento semanal**: tareas categorizadas (TÃ¡ctica, Estrategia, Finales) con puzles reales de Lichess adaptados al ELO del jugador.
- **ValidaciÃ³n de puzles**: el jugador resuelve puzles y el sistema actualiza su progreso en tiempo real.

---

## Stack tecnolÃ³gico

| Componente         | TecnologÃ­a                              |
|--------------------|-----------------------------------------|
| Framework          | FastAPI 0.111                           |
| Base de datos      | SQLAlchemy 2.0 + SQLite (modo WAL)      |
| Motor de ajedrez   | Stockfish (binario local)               |
| LLM de coaching    | Google Gemini (`gemini-3.7-flash`)     |
| ValidaciÃ³n         | Pydantic 2.7                            |
| AutenticaciÃ³n      | PyJWT + passlib/bcrypt                  |
| ConfiguraciÃ³n      | pydantic-settings + python-dotenv       |

---

## Requisitos previos

- Python 3.10+
- [Stockfish](https://stockfishchess.org/download/) (binario incluido en `stockfish/stockfish.exe` para Windows)
- API key de [Google AI Studio](https://aistudio.google.com/apikey)

---

## InstalaciÃ³n

```bash
# 1. Clonar el repositorio
git clone <url-del-repositorio>
cd entrenador-ia

# 2. Crear entorno virtual
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac

# 3. Instalar dependencias
pip install -r requirements.txt

# 4. Configurar variables de entorno
copy .env.example .env       # Windows
# cp .env.example .env       # Linux/Mac
```

Editar `.env` con tus valores:

```env
DATABASE_URL="sqlite:///./entrenador_ia.db"
STOCKFISH_PATH="D:\ruta\a\stockfish.exe"
GEMINI_API_KEY="tu-api-key-de-gemini"
```

---

## EjecuciÃ³n

```bash
uvicorn app.main:app --reload
```

El servidor estarÃ¡ disponible en `http://127.0.0.1:8000`.

DocumentaciÃ³n interactiva (Swagger UI): `http://127.0.0.1:8000/api/v1/docs`

---

## Estructura del proyecto

```
app/
â”œâ”€â”€ main.py                    # Punto de entrada â€” crea tablas y registra rutas
â”œâ”€â”€ core/
â”‚   â”œâ”€â”€ config.py              # ConfiguraciÃ³n vÃ­a .env (pydantic-settings)
â”‚   â”œâ”€â”€ database.py            # Engine SQLAlchemy, sesiones y Base
â”‚   â”œâ”€â”€ security.py            # Hashing bcrypt y creaciÃ³n de JWT
â”‚   â””â”€â”€ middleware.py          # Manejador global de excepciones
â”œâ”€â”€ models/                    # Modelos ORM (SQLAlchemy)
â”‚   â”œâ”€â”€ base.py                # TimeStampedModel (abstracto)
â”‚   â”œâ”€â”€ user.py                # Usuarios con ELO y credenciales
â”‚   â”œâ”€â”€ game.py                # Partidas, errores de jugada e informes
â”‚   â”œâ”€â”€ exercise.py            # Tareas de entrenamiento y planes semanales
â”‚   â””â”€â”€ puzzle.py              # Puzles de Lichess
â”œâ”€â”€ schemas/                   # Modelos Pydantic (request/response)
â”œâ”€â”€ repositories/              # Capa de acceso a datos (patrÃ³n repositorio)
â”œâ”€â”€ services/                  # LÃ³gica de negocio
â”‚   â”œâ”€â”€ chess_analyzer.py      # Pipeline de anÃ¡lisis con Stockfish
â”‚   â”œâ”€â”€ llm_coach.py           # Llamadas a Gemini para informes
â”‚   â””â”€â”€ coach_service.py       # GeneraciÃ³n de planes de entrenamiento
â””â”€â”€ api/v1/
    â”œâ”€â”€ router.py              # Registra todos los endpoints bajo /api/v1
    â”œâ”€â”€ dependencies.py        # ExtracciÃ³n de JWT
    â”œâ”€â”€ endpoints_user.py      # Registro, login, perfil
    â”œâ”€â”€ endpoints_game.py      # Subida y anÃ¡lisis de PGN
    â”œâ”€â”€ endpoints_coach.py     # GeneraciÃ³n de informes IA
    â””â”€â”€ endpoints_exercise.py  # Planes, tareas y validaciÃ³n de puzles
```

---

## Endpoints principales

### Usuarios (`/api/v1/users`)

| MÃ©todo | Ruta          | DescripciÃ³n                     |
|--------|---------------|---------------------------------|
| POST   | `/register`   | Registrar nuevo jugador         |
| POST   | `/login`      | Iniciar sesiÃ³n (devuelve JWT)   |
| GET    | `/me`         | Obtener perfil del usuario      |
| PUT    | `/me`         | Actualizar perfil               |

### Partidas (`/api/v1/games`)

| MÃ©todo | Ruta            | DescripciÃ³n                                      |
|--------|-----------------|--------------------------------------------------|
| POST   | `/upload-pgn`   | Subir archivo PGN para anÃ¡lisis con Stockfish     |
| GET    | `/`             | Listar todas las partidas analizadas del usuario   |

### Entrenador IA (`/api/v1/coach`)

| MÃ©todo | Ruta            | DescripciÃ³n                                            |
|--------|-----------------|--------------------------------------------------------|
| POST   | `/diagnostic`   | Generar informe de patrones con Gemini                 |
| GET    | `/history`      | Obtener historial de informes del entrenador            |

### Ejercicios (`/api/v1/exercise`)

| MÃ©todo | Ruta                    | DescripciÃ³n                                      |
|--------|-------------------------|--------------------------------------------------|
| GET    | `/`                     | Obtener plan de entrenamiento con puzles          |
| GET    | `/weekly/active`        | Obtener plan semanal activo                       |
| POST   | `/weekly/generate`      | Generar nuevo plan semanal                        |
| POST   | `/validate-puzzle`      | Validar soluciÃ³n de un puzle y actualizar progreso|

---

## Importar puzles de Lichess

El sistema necesita una base de datos de puzles para asignar ejercicios. Ejecuta:

```bash
python ejercicios/import_puzzles.py
```

Esto importa puzles filtrados de `ejercicios/lichess_db_puzzle.csv` (popularidad â‰¥ 80, reproducciones â‰¥ 500) hasta un mÃ¡ximo de 50.000. El CSV debe estar presente en la ruta indicada.

---

## Base de datos

SQLite con modo WAL habilitado para lecturas concurrentes. Las tablas se crean automÃ¡ticamente al iniciar el servidor (`Base.metadata.create_all`).

**Tablas principales:**

- `users` â€” perfiles de jugadores con ELO actual y objetivo
- `games` â€” partidas analizadas con PGN completo
- `move_errors` â€” errores detectados por jugada con tema tÃ¡ctico
- `coach_reports` â€” informes generados por Gemini
- `training_tasks` â€” tareas de entrenamiento categorizadas
- `weekly_plans` â€” planes semanales con tasa de cumplimiento
- `chess_puzzles` â€” bank de puzles de Lichess

---

## Licencia

Proyecto privado. Todos los derechos reservados.
