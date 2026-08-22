# EntrenadorIA Backend

Backend de una plataforma de entrenamiento de ajedrez con inteligencia artificial. Analiza partidas de los usuarios mediante Stockfish, detecta patrones de error recurrentes y genera informes de coaching personalizados con Google Gemini.

---

## Funcionalidades principales

- **Registro y autenticación** de jugadores con JWT y encriptación bcrypt.
- **Análisis de partidas PGN**: sube un archivo con N partidas y el sistema las filtra, detecta duplicados y analiza cada jugada en busca de errores (Blunder, Mistake, Inaccuracy) usando Stockfish.
- **Informes de coaching con IA**: Gemini genera un diagnóstico pedagógico en Markdown con patrones detectados, referencias a partidas concretas y un plan de acción personalizado.
- **Plan de entrenamiento semanal**: tareas categorizadas (Táctica, Estrategia, Finales) con puzles reales de Lichess adaptados al ELO del jugador.
- **Validación de puzles**: el jugador resuelve puzles y el sistema actualiza su progreso en tiempo real.

---

## Stack tecnológico

| Componente         | Tecnología                              |
|--------------------|-----------------------------------------|
| Framework          | FastAPI 0.111                           |
| Base de datos      | SQLAlchemy 2.0 + SQLite (modo WAL)      |
| Motor de ajedrez   | Stockfish (binario local)               |
| LLM de coaching    | Google Gemini (`gemini-flash-latest`)     |
| Validación         | Pydantic 2.7                            |
| Autenticación      | PyJWT + passlib/bcrypt                  |
| Configuración      | pydantic-settings + python-dotenv       |

---

## Requisitos previos

- Python 3.10+
- [Stockfish](https://stockfishchess.org/download/) (binario incluido en `stockfish/stockfish.exe` para Windows)
- API key de [Google AI Studio](https://aistudio.google.com/apikey)

---

## Instalación

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

## Ejecución

```bash
uvicorn app.main:app --reload
```

El servidor estará disponible en `http://127.0.0.1:8000`.

Documentación interactiva (Swagger UI): `http://127.0.0.1:8000/api/v1/docs`

---

## Estructura del proyecto

```
app/
├── main.py                    # Punto de entrada — crea tablas y registra rutas
├── core/
│   ├── config.py              # Configuración vía .env (pydantic-settings)
│   ├── database.py            # Engine SQLAlchemy, sesiones y Base
│   ├── security.py            # Hashing bcrypt y creación de JWT
│   └── middleware.py          # Manejador global de excepciones
├── models/                    # Modelos ORM (SQLAlchemy)
│   ├── base.py                # TimeStampedModel (abstracto)
│   ├── user.py                # Usuarios con ELO y credenciales
│   ├── game.py                # Partidas, errores de jugada e informes
│   ├── exercise.py            # Tareas de entrenamiento y planes semanales
│   └── puzzle.py              # Puzles de Lichess
├── schemas/                   # Modelos Pydantic (request/response)
├── repositories/              # Capa de acceso a datos (patrón repositorio)
├── services/                  # Lógica de negocio
│   ├── chess_analyzer.py      # Pipeline de análisis con Stockfish
│   ├── llm_coach.py           # Llamadas a Gemini para informes
│   └── coach_service.py       # Generación de planes de entrenamiento
└── api/v1/
    ├── router.py              # Registra todos los endpoints bajo /api/v1
    ├── dependencies.py        # Extracción de JWT
    ├── endpoints_user.py      # Registro, login, perfil
    ├── endpoints_game.py      # Subida y análisis de PGN
    ├── endpoints_coach.py     # Generación de informes IA
    └── endpoints_exercise.py  # Planes, tareas y validación de puzles
```

---

## Endpoints principales

### Usuarios (`/api/v1/users`)

| Método | Ruta          | Descripción                     |
|--------|---------------|---------------------------------|
| POST   | `/register`   | Registrar nuevo jugador         |
| POST   | `/login`      | Iniciar sesión (devuelve JWT)   |
| GET    | `/me`         | Obtener perfil del usuario      |
| PUT    | `/me`         | Actualizar perfil               |

### Partidas (`/api/v1/games`)

| Método | Ruta            | Descripción                                      |
|--------|-----------------|--------------------------------------------------|
| POST   | `/upload-pgn`   | Subir archivo PGN para análisis con Stockfish     |
| GET    | `/`             | Listar todas las partidas analizadas del usuario   |

### Entrenador IA (`/api/v1/coach`)

| Método | Ruta            | Descripción                                            |
|--------|-----------------|--------------------------------------------------------|
| POST   | `/diagnostic`   | Generar informe de patrones con Gemini                 |
| GET    | `/history`      | Obtener historial de informes del entrenador            |

### Ejercicios (`/api/v1/exercise`)

| Método | Ruta                    | Descripción                                      |
|--------|-------------------------|--------------------------------------------------|
| GET    | `/`                     | Obtener plan de entrenamiento con puzles          |
| GET    | `/weekly/active`        | Obtener plan semanal activo                       |
| POST   | `/weekly/generate`      | Generar nuevo plan semanal                        |
| POST   | `/validate-puzzle`      | Validar solución de un puzle y actualizar progreso|

---

## Importar puzles de Lichess

El sistema necesita una base de datos de puzles para asignar ejercicios. Ejecuta:

```bash
python ejercicios/import_puzzles.py
```

Esto importa puzles filtrados de `ejercicios/lichess_db_puzzle.csv` (popularidad ≥ 80, reproducciones ≥ 500) hasta un máximo de 50.000. El CSV debe estar presente en la ruta indicada.

---

## Base de datos

SQLite con modo WAL habilitado para lecturas concurrentes. Las tablas se crean automáticamente al iniciar el servidor (`Base.metadata.create_all`).

**Tablas principales:**

- `users` — perfiles de jugadores con ELO actual y objetivo
- `games` — partidas analizadas con PGN completo
- `move_errors` — errores detectados por jugada con tema táctico
- `coach_reports` — informes generados por Gemini
- `training_tasks` — tareas de entrenamiento categorizadas
- `weekly_plans` — planes semanales con tasa de cumplimiento
- `chess_puzzles` — bank de puzles de Lichess

---

## Licencia

Proyecto privado. Todos los derechos reservados.
