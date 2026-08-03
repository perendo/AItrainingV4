---

## 1. Estructura de Carpetas y Archivos (Arquitectura Limpia)

Utilizaremos una arquitectura orientada a dominios/módulos para facilitar el mantenimiento y cumplir con los principios SOLID.

```text
entrenador_ia/
│
├── app/
│   ├── __init__.py
│   ├── main.py                  # Punto de entrada de la aplicación FastAPI
│   │
│   ├── core/                    # Configuración global y seguridad
│   │   ├── config.py           *  # Variables de entorno y ajustes
│   │   ├── database.py         *  # Conexión SQLAlchemy y sesión
│   │   ├── security.py          # Hashing y utilidades de validación
│   │   └── middleware.py        # Middleware global de errores y logs
│   │
│   ├── models/                  # Modelos de SQLAlchemy (Base de Datos)
│   │   ├── base.py             *
│   │   ├── user.py             *
│   │   ├── game.py             *
│   │   └── training.py
│   │
│   ├── schemas/                 # Esquemas Pantic (Validación de Input/Output)
│   │   ├── user.py             *
│   │   ├── game.py             *
│   │   └── training.py
│   │
│   ├── api/                     # Capa de Controladores / Endpoints
│   │   ├── v1/
│   │   │   ├── router.py        # Enrutador principal v1
│   │   │   ├── endpoints_user.py
│   │   │   ├── endpoints_game.py
│   │   │   └── endpoints_training.py
│   │
│   ├── services/                # Lógica de Negocio Pura (Caja Negra)
│   │   ├── chess_analyzer.py    # Procesamiento de PGN y detección de errores/variantes
│   │   └── coach_engine.py      # Algoritmia para hallar patrones y generar el plan
│   │
│   └── repositories/            # Capa de Datos (Abstracción de consultas SQL)
│       ├── base.py
│       ├── user_repo.py
│       ├── game_repo.py
│       └── training_repo.py
│
├── requirements.txt             # Dependencias del proyecto (FastAPI, python-chess, SQLAlchemy, etc.)
├── .env.example                 # Plantilla de variables de entorno
├── .gitignore
└── README.md

```

---

## 2. Esquema de la Base de Datos Relacional (SQL)

Para evitar el problema de rendimiento N+1, diseñamos relaciones claras y usaremos `joinedload` / `selectinload` en los repositorios.

### Entidad: `users` (Módulo 1)

* `id`: UUID / Integer (PK)
* `username`: VARCHAR(50) (Único - Nombre real o identificador interno)
* `chess_online_nick`: VARCHAR(100) (Opcional, para buscar sus partidas en PGNs)
* `current_elo`: INTEGER (Por defecto 1500)
* `target_elo`: INTEGER (Por defecto 2000)
* `created_at`: TIMESTAMP

### Entidad: `games` (Módulo 2)

* `id`: UUID / Integer (PK)
* `user_id`: Integer (FK -> `users.id`)
* `white_player`: VARCHAR(100)
* `black_player`: VARCHAR(100)
* `result`: VARCHAR(10) (1-0, 0-1, 1/2-1/2)
* `pgn_content`: TEXT (El archivo PGN crudo con variantes)
* `player_color`: VARCHAR(5) ('white' o 'black' respecto al usuario)
* `analyzed_at`: TIMESTAMP

### Entidad: `move_errors` (Módulo 2 y 3 - Crucial para los patrones)

* `id`: UUID / Integer (PK)
* `game_id`: Integer (FK -> `games.id`)
* `move_number`: INTEGER
* `algebraic_move`: VARCHAR(10) (ej: "Nf3")
* `error_type`: VARCHAR(50) (ej: "Blunder", "Mistake", "Inaccuracy")
* `tactical_theme`: VARCHAR(100) (ej: "Tactical: Fork", "Positional: Weak Color Complex", "Endgame: King Activity", "Opening: Time Waste")
* `description`: TEXT (Breve explicación de por qué es un error)

### Entidad: `training_plans` (Módulo 4)

* `id`: UUID / Integer (PK)
* `user_id`: Integer (FK -> `users.id`)
* `created_at`: TIMESTAMP
* `is_active`: BOOLEAN (Solo un plan activo a la vez)
* `detected_weaknesses`: JSON / TEXT (Lista de los patrones de error más repetidos)

### Entidad: `training_tasks` (Módulo 4 - Bloques del plan)

* `id`: UUID / Integer (PK)
* `plan_id`: Integer (FK -> `training_plans.id`)
* `theme`: VARCHAR(100) (ej: "Táctica: Ataques dobles")
* `suggested_routine`: TEXT (ej: "Resolver 15 problemas diarios de este tema en [Chess.com/Lichess](https://www.google.com/search?q=https://Chess.com/Lichess) durante 2 semanas")
* `status`: VARCHAR(20) ('Pending', 'In_Progress', 'Completed')

---

## 3. Sistema de Clases (Estilo Caja Negra) e Interconexión

Para mantener el backend desacoplado del futuro frontend, diseñamos los servicios como motores autónomos. Aunque mencionas "GUI" y "widgets", dado que estamos en el Backend (FastAPI), representaremos estos componentes como **Servicios e Intercomunicadores de la API (Endpoints)** que actúan como "cajas negras":

```
[Cliente HTTP / Futura GUI] 
        │
        ▼ (JSON / PGN Multipart)
[API Endpoints (FastAPI Controllers)]  <-- Validan esquemas con Pydantic
        │
        ▼ (Inyección de Dependencias)
[Servicios de Lógica (Black Box)] 
  ├── ChessAnalyzerService (Parsea PGN, detecta errores usando python-chess/Stockfish)
  └── CoachEngineService (Procesa el histórico de MoveErrors, extrae patrones, dicta el plan)
        │
        ▼
[Capa Repositorios (SQLAlchemy)] 
        │
        ▼
[Base de Datos SQL]

```

### Descripción de la Interconexión de Métodos:

1. **`ChessAnalyzerService.analyze_pgn_bulk(file_content, user_nick)`**: Recibe el lote de texto. Itera cada partida, identifica si el usuario jugó con blancas o negras usando su `user_nick`, procesa el árbol de movimientos (incluyendo variantes) y extrae las jugadas dudosas. Retorna una estructura limpia de datos con partidas y errores listos para guardar a través del repositorio.
2. **`CoachEngineService.generate_plan(user_id)`**: Es invocado automáticamente cuando el usuario alcanza el umbral de $\ge 10$ partidas en la base de datos (o bajo demanda si añade más).
* Llama a `GameRepository.get_all_errors_by_user(user_id)`.
* Agrupa y cuenta los `tactical_theme` para encontrar la debilidad estadística principal.
* Crea un nuevo `TrainingPlan` y genera subtareas (`TrainingTasks`) específicas para mitigar esos patrones de error.



---

## 4. Preguntas antes de codificar

Para afinar el tiro al máximo antes de empezar a escribir los archivos de código, tengo tres preguntas breves para ti:

1. **Motor de Análisis:** ¿Para el análisis de las partidas y detección de errores/temas tácticos utilizaremos una librería puramente heurística en Python (como `python-chess`), o integraremos un motor local como **Stockfish** a través de la API de comandos para evaluar las posiciones ($+$ o $-$ centipeones)?
2. **Base de Datos específica:** ¿Prefieres que prepare la configuración para **SQLite** (fácil y rápido para desarrollo local/monolítico) o **PostgreSQL** (estándar para producción)?
3. **Identificación en Lotes PGN:** Cuando el usuario suba un fichero con 10 o más partidas, ¿asumimos que el "Nick de internet" del Módulo 1 aparecerá *siempre* en el tag `[White "..."]` o `[Black "..."]` de todas las partidas de ese archivo para poder identificar cuál era su bando, o debemos permitir que elija el bando manualmente en la subida?

Quedo a la espera de tus comentarios y confirmación para empezar a generar el código archivo por archivo. ¿Todo entendido?