# EntrenadorIA — Coach de Ajedrez con Inteligencia Artificial

Plataforma de entrenamiento de ajedrez que combina **análisis de partidas con Stockfish**, **informes pedagógicos generados con Gemini** y **planes de entrenamiento basados en puzles reales de Lichess**, todo envuelto en una aplicación web moderna (FastAPI + Next.js).

El jugador sube sus partidas en formato PGN, el sistema detecta errores jugada a jugada (Blunder, Mistake, Inaccuracy), un LLM traduce esos datos en un diagnóstico pedagógico personalizado y la plataforma le asigna un plan semanal de tácticas, estrategia y finales adaptado a su ELO.

---

## ✨ Funcionalidades

### 🧠 Backend

- **Autenticación JWT** con bcrypt (registro, login, perfil).
- **Análisis de partidas PGN** en segundo plano: filtra, elimina duplicados y analiza cada jugada con Stockfish (proceso asíncrono con polling de tareas).
- **Informes de coaching con IA**: Gemini analiza el historial de errores y genera un diagnóstico estructurado (patrones, partidas de referencia, plan de acción).
- **Partidas de Grandes Maestros**: búsqueda de partidas clásicas (Morphy, Capablanca, Alekhine, Karpov, Petrosian) con caché local y generación vía IA.
- **Autodiagnóstico tutorizado**: el jugador analiza una partida de un GM y Gemini **audita su análisis** (fases, preguntas críticas, factores posicionales, conclusiones) con feedback correcto/incorrecto.
- **Planes de entrenamiento semanales**: tareas de Táctica / Estrategia / Finales con puzles reales de Lichess adaptados por tema y ELO.

### 🖥️ Frontend

- **Autenticación** (login / registro) con sesión persistente vía JWT.
- **Gestión de partidas**: subida de PGN con progreso en vivo, historial y detalle con tablero interactivo.
- **Coach IA**: generación de informes y consulta del historial de diagnósticos.
- **Entrenamiento**: plan semanal y resolución de puzles interactivos.
- **Análisis de partidas de GM**: tablero de solo lectura + formulario modular de 4 bloques plegables (Fases, Preguntas Críticas, Factores Posicionales, Conclusiones) con **guardado automático de borrador** y envío a auditoría del Gran Maestro.

---

## 🧱 Stack tecnológico

### Backend

| Componente       | Tecnología                                    |
|------------------|-----------------------------------------------|
| Framework        | FastAPI 0.111                                 |
| ORM              | SQLAlchemy 2.0                                |
| Base de datos    | SQLite (dev, modo WAL) / PostgreSQL (prod)    |
| Motor de ajedrez | Stockfish (binario local)                     |
| LLM coaching     | Google Gemini (`gemini-2.5-flash`)            |
| LLM tutor        | Google Gemini (`gemini-1.5-flash`)            |
| Autenticación    | PyJWT + passlib/bcrypt                        |
| Validación       | Pydantic 2                                    |

### Frontend

| Capa            | Tecnología                              |
|-----------------|-----------------------------------------|
| Framework       | Next.js 14.2 (App Router)               |
| Lenguaje        | TypeScript 5                            |
| Estilos         | Tailwind CSS 3 + shadcn/ui              |
| Forms           | React Hook Form + Zod                   |
| Tablero         | react-chessboard + chess.js             |
| HTTP client     | Fetch con wrapper propio (interceptor JWT) |

---

## 📁 Estructura del repositorio

```
├── app/                          # Backend FastAPI
│   ├── main.py                   # Entrada, CORS, registro de rutas, creación de tablas
│   ├── core/                     # Config (.env), BD, seguridad, middleware
│   ├── models/                   # Modelos ORM (users, games, puzzles, gm_games, ...)
│   ├── schemas/                  # Modelos Pydantic (request/response)
│   ├── repositories/             # Capa de acceso a datos (patrón repositorio)
│   ├── services/                 # Lógica de negocio (análisis, coach, tutor, puzzles)
│   └── api/v1/                   # Endpoints registrados en router.py
├── frontend/                     # Frontend Next.js
│   └── src/
│       ├── app/(auth)/           # Login y registro
│       ├── app/(dashboard)/      # Partidas, coach, entrenamiento, perfil, análisis GM
│       ├── components/           # UI (shadcn/ui), tablero, puzles, análisis
│       └── lib/                  # api.ts, types.ts, validaciones
├── ejercicios/                   # Script de importación de puzles
├── stockfish/                    # Binario de Stockfish (no versionado)
├── Docs/                         # Documentación del proyecto
├── tests/                        # Suite de pruebas pytest
├── start_servers.py              # Lanza backend y frontend en paralelo
└── AGENTS.md                     # Notas de arquitectura para desarrollo con IA
```

---

## 🚀 Puesta en marcha

### Requisitos previos

- Python 3.10+
- Node.js 18+
- [Stockfish](https://stockfishchess.org/download/) (binario en `stockfish/stockfish.exe` en Windows)
- API key de [Google AI Studio](https://aistudio.google.com/apikey)

### 1. Backend

```bash
# Entorno virtual e instalación de dependencias
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac

pip install -r requirements.txt
```

Crea un archivo `.env` en la raíz del repositorio con las siguientes variables:

```env
DATABASE_URL="sqlite:///./entrenador_ia.db"
STOCKFISH_PATH="stockfish/stockfish.exe"
GEMINI_API_KEY="tu-api-key-de-gemini"
SECRET_KEY="clave-secreta-para-jwt"
```

> ℹ️ No existe `.env.example`; el `.env` debe crearse manualmente con las claves anteriores.

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

Aplicación disponible en `http://localhost:3000`.

### 3. Ambos a la vez

```bash
python start_servers.py        # backend :8000 + frontend :3000 en paralelo
```

### 4. Importar puzles de Lichess (opcional pero recomendado)

```bash
python ejercicios/import_puzzles.py
```

Importa puzles filtrados de `ejercicios/lichess_db_puzzle.csv` (popularidad ≥ 80, reproducciones ≥ 500, hasta 50.000). Sin este paso, los flujos de puzles devuelven resultados vacíos.

---

## 🔌 API

Todas las rutas se sirven bajo el prefijo `/api/v1` y requieren autenticación JWT salvo las indicadas.

### Usuarios — `/users`

| Método | Ruta        | Descripción                                      | Auth |
|--------|-------------|--------------------------------------------------|------|
| POST   | `/register` | Registrar nuevo jugador                          | No   |
| POST   | `/login`    | Iniciar sesión (`OAuth2PasswordRequestForm`)     | No   |
| GET    | `/me`       | Obtener perfil                                   | Sí   |
| PUT    | `/me`       | Actualizar perfil                                | Sí   |

### Partidas — `/games`

| Método | Ruta            | Descripción                                        |
|--------|-----------------|----------------------------------------------------|
| POST   | `/upload-pgn`   | Subir PGN → `202 Accepted` con `task_id`           |
| GET    | `/tasks/{id}`   | Polling del estado de la tarea de análisis         |
| GET    | `/`             | Listar partidas analizadas del usuario             |

### Coach — `/coach`

| Método | Ruta          | Descripción                                    |
|--------|---------------|------------------------------------------------|
| POST   | `/diagnostic` | Generar diagnóstico pedagógico con Gemini      |
| GET    | `/history`    | Historial de informes del entrenador           |

### Partidas de Grandes Maestros — `/gm-games`

| Método | Ruta           | Descripción                                        |
|--------|----------------|----------------------------------------------------|
| GET    | `/search`      | Buscar partidas por GM y/o tema (con caché)        |
| GET    | `/{game_id}`   | Obtener una partida GM por ID                      |

### Entrenamiento — `/training`

| Método | Ruta                        | Descripción                                        |
|--------|-----------------------------|----------------------------------------------------|
| GET    | `/pending-tasks`            | Tareas pendientes del plan + partida GM asignada   |
| GET    | `/all-tasks`                | Todas las tareas del plan semanal activo           |
| POST   | `/weekly/generate`          | Generar nuevo plan semanal (desactiva el anterior) |
| GET    | `/tasks/{id}/next-puzzle`   | Puzle aleatorio relevante para una tarea           |
| POST   | `/tasks/{id}/complete`      | Marcar una unidad de tarea como completada         |

### Análisis de partidas GM — `/game-analysis`

| Método | Ruta            | Descripción                                                 |
|--------|-----------------|-------------------------------------------------------------|
| POST   | `/submit`       | Enviar autodiagnóstico para auditoría de Gemini             |
| GET    | `/`             | Historial de autodiagnósticos del usuario                   |
| GET    | `/{analysis_id}`| Obtener un autodiagnóstico por ID                           |

---

## 🧪 Testing

```bash
# Suite completa
python -m pytest tests/ -v

# Archivo individual
python -m pytest tests/test_endpoints_game.py -v
```

> ℹ️ La suite tarda ~2 minutos: los tests de Stockfish lanzan el binario real. Los tests usan una base de datos SQLite en memoria (`StaticPool`).

---

## ☁️ Despliegue

### Backend (Render)

1. Crear un **Web Service** conectado al repositorio.
2. Build: `pip install -r requirements.txt`
3. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Añadir una base de datos **PostgreSQL** y configurar las variables de entorno (`DATABASE_URL`, `SECRET_KEY`, `GEMINI_API_KEY`, `STOCKFISH_PATH`).

### Frontend (Vercel)

1. Importar el proyecto seleccionando la carpeta `frontend/`.
2. Configurar `NEXT_PUBLIC_API_URL` apuntando al backend.
3. Deploy automático en cada push a `main`.

> ⚠️ Stockfish no viene preinstalado en Render; instálalo en el buildpack (p. ej. `apt-get install -y stockfish`) o usa una imagen Docker con el binario incluido.

---

## 📄 Licencia

Proyecto privado. Todos los derechos reservados.
