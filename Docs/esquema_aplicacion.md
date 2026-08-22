# Esquema de la aplicación

Este documento resume la arquitectura de EntrenadorIA y la función principal de cada módulo. La aplicación se divide en un **backend FastAPI**, que concentra la lógica y los datos, y un **frontend Next.js**, que ofrece la interfaz de usuario.

## 1. Vista general

```text
Usuario
  |
  v
Frontend Next.js (frontend/src)
  |  HTTP/JSON + JWT
  v
Backend FastAPI (app)
  |-- API REST /api/v1
  |-- Servicios de negocio
  |-- Stockfish y Gemini
  |-- SQLAlchemy + Alembic
  v
Base de datos SQLite/PostgreSQL
```

### Flujos principales

1. El usuario interactúa con una página del frontend.
2. El cliente HTTP añade el token JWT y llama a un endpoint del backend.
3. El endpoint valida la petición con esquemas Pydantic y delega en un servicio o repositorio.
4. El servicio consulta la base de datos y, cuando corresponde, ejecuta Stockfish o Gemini.
5. Las operaciones largas se procesan en segundo plano; el frontend consulta su estado mediante polling.

---

## 2. Backend

Ruta base: `app/`

### 2.1 Entrada y configuración

| Módulo | Función principal |
|---|---|
| `app/main.py` | Crea la aplicación FastAPI, configura CORS y middleware, registra las rutas, monta los archivos estáticos, aplica migraciones y limpia tareas interrumpidas al arrancar. |
| `app/core/config.py` | Carga y valida la configuración desde `.env`, incluyendo base de datos, Stockfish, Gemini, JWT y CORS. |
| `app/core/middleware.py` | Convierte excepciones no controladas en respuestas HTTP coherentes y registra los errores globales. |
| `app/core/security.py` | Gestiona el hash de contraseñas, la creación y validación de tokens JWT y la identificación del usuario autenticado. |
| `app/core/database.py` | Configura el engine de SQLAlchemy, la sesión, la clase `Base` y los context managers para sesiones normales y tareas de fondo. |
| `app/db/session.py` | Reexporta las sesiones de base de datos para que scripts y módulos antiguos usen la misma configuración. |
| `app/db/base.py` | Importa y centraliza los modelos ORM para que SQLAlchemy conozca todas las tablas. |

### 2.2 API REST

Todas las rutas se agrupan en `app/api/v1/` y se sirven bajo `/api/v1`.

| Módulo | Prefijo | Función principal |
|---|---|---|
| `router.py` | `/` | Registra y agrupa todos los routers de la API. |
| `dependencies.py` | Compartido | Proporciona dependencias como el usuario autenticado y la sesión de base de datos. |
| `endpoints_user.py` | `/users` | Registro, inicio de sesión, consulta y actualización del perfil. |
| `endpoints_game.py` | `/games` | Recepción de PGN, consulta de partidas y estado de análisis. |
| `endpoints_coach.py` | `/coach` | Solicitud e historial de informes pedagógicos del coach IA. |
| `endpoints_gm_games.py` | `/gm-games` | Búsqueda y consulta de partidas de Grandes Maestros. |
| `endpoints_training.py` | `/training` | Planes semanales, tareas pendientes, puzles y finalización de tareas. |
| `endpoints_analysis.py` | `/game-analysis` | Envío, consulta y estado del autodiagnóstico de una partida de GM. |
| `endpoints_gm_consultations.py` | `/gm-consultations` | Envío, estado e historial de consultas al Gran Maestro IA. |
| `endgames.py` | `/endgames` | Catálogo de finales, progreso, contenido teórico y jugadas de práctica con Stockfish. |

Las consultas al GM y las auditorías de partidas devuelven `202 Accepted`: el trabajo continúa en segundo plano y el cliente consulta después el estado (`processing`, `completed` o `failed`).

### 2.3 Esquemas de validación

Ruta: `app/schemas/`

Los esquemas Pydantic definen los formatos de entrada y salida de la API, validan los datos y evitan exponer directamente los modelos ORM.

| Módulo | Responsabilidad |
|---|---|
| `user.py` | Datos de registro, autenticación y perfil. |
| `game.py` | Partidas, movimientos, errores y resultados del análisis. |
| `coach.py` | Diagnósticos, informes y patrones pedagógicos. |
| `gm_game.py` | Partidas de Grandes Maestros y sus filtros de búsqueda. |
| `exercise.py` | Planes, tareas y puzles de entrenamiento. |
| `analysis.py` | Autodiagnóstico, auditoría y estados del procesamiento. |
| `gm_consultation.py` | Preguntas, respuestas y estados de las consultas al GM. |
| `endgame.py` | Lecciones, eventos de línea temporal, progreso y jugadas de práctica. |

### 2.4 Servicios de negocio

Ruta: `app/services/`

| Módulo | Función principal |
|---|---|
| `chess_analyzer.py` | Parsea PGN y analiza las jugadas con Stockfish; guarda errores y resultados en tareas de fondo. |
| `gemini_client.py` | Cliente único de Gemini; centraliza autenticación, timeout, generación de texto/JSON y validación de respuestas. |
| `coach_service.py` | Coordina la generación y recuperación de diagnósticos del jugador. |
| `llm_coach.py` | Construye el contexto de errores y solicita a Gemini un informe pedagógico estructurado. |
| `gm_service.py` | Gestiona el catálogo y las recomendaciones de partidas de Grandes Maestros, incluyendo caché y generación asistida por IA. |
| `tutor_service.py` | Crea autodiagnósticos y audita el análisis del jugador con Gemini; actualiza el estado de la tarea. |
| `gm_consultation_service.py` | Procesa en segundo plano las consultas al GM y guarda respuestas o errores. |
| `puzzle_service.py` | Selecciona puzles de Lichess adecuados para una tarea y el nivel del jugador. |
| `endgame_generator_service.py` | Genera con Gemini el guion, eventos y árbol teórico de una lección de finales. |

### 2.5 Persistencia

#### Repositorios: `app/repositories/`

| Módulo | Función principal |
|---|---|
| `base.py` | Operaciones comunes de acceso a datos. |
| `user_repo.py` | Consultas y persistencia de usuarios. |
| `game_repo.py` | Consultas y persistencia de partidas y movimientos. |
| `analysis_repo.py` | Consultas de autodiagnósticos y sus estados. |
| `gm_game_repo.py` | Consultas de partidas de Grandes Maestros. |
| `__init__.py` | Expone la capa de repositorios. |

#### Modelos ORM: `app/models/`

Los modelos representan las tablas y relaciones de SQLAlchemy: `User`, `Game`, `MoveError`, `CoachReport`, `TrainingTask`, `WeeklyPlan`, `Puzzle`, `ProcessingTask`, `GMGame`, `UserAnalyzedGMGame`, `UserGameAnalysis`, `GMConsultation`, además de las entidades de finales (`EndgameLesson`, `EndgameTimelineEvent` y `UserEndgameProgress`).

#### Migraciones: `alembic/`

Versiona la evolución del esquema de la base de datos. `alembic/env.py` conecta Alembic con la configuración de la aplicación y las revisiones de `alembic/versions/` modifican las tablas de forma reproducible.

### 2.6 Datos, scripts y pruebas del backend

| Módulo o carpeta | Función principal |
|---|---|
| `ejercicios/import_puzzles.py` | Importa puzles filtrados desde el CSV de Lichess. |
| `app/cli.py` (CLI `python -m app.cli`) | Tareas de administración del Módulo de Finales: `seed-endgames`, `import-pgns`, `gen-content`, `gen-audio`. |
| `app/services/endgame_admin_service.py` | Lógica de población/enriquecimiento de `endgame_lessons` (semilla, importación PGN, contenido y audio). |
| `tests/` | Pruebas de servicios, esquemas, seguridad, endpoints e importadores. |

---

## 3. Frontend

Ruta base: `frontend/src/`

### 3.1 Aplicación y navegación

| Ruta o módulo | Función principal |
|---|---|
| `app/layout.tsx` | Layout raíz, metadatos, estilos globales y proveedor de temas. |
| `app/page.tsx` | Entrada inicial de la aplicación y redirección hacia el flujo correspondiente. |
| `app/(auth)/layout.tsx` | Layout compartido de autenticación. |
| `app/(auth)/login/page.tsx` | Formulario de inicio de sesión y almacenamiento de la sesión JWT. |
| `app/(auth)/register/page.tsx` | Formulario de creación de cuenta. |
| `app/(dashboard)/layout.tsx` | Layout autenticado: sidebar, indicador de consultas activas y proveedor global del GM. |
| `app/(dashboard)/partidas/page.tsx` | Lista y búsqueda de partidas de Grandes Maestros. |
| `app/(dashboard)/partidas/[gmGameId]/page.tsx` | Detalle y visor de una partida de GM. |
| `app/(dashboard)/analisis/page.tsx` | Análisis de partidas propias, importación desde Lichess y envío de PGN. |
| `app/(dashboard)/historico/page.tsx` | Historial de análisis del jugador. |
| `app/(dashboard)/historico/[analysisId]/page.tsx` | Detalle de un análisis guardado y su informe. |
| `app/(dashboard)/coach/page.tsx` | Solicitud, visualización y exportación de informes del coach IA. |
| `app/(dashboard)/entrenamiento/page.tsx` | Vista del plan semanal y sus tareas. |
| `app/(dashboard)/entrenamiento/[taskId]/page.tsx` | Resolución interactiva de una tarea o puzle. |
| `app/(dashboard)/entrenamiento/finales/page.tsx` | Catálogo de lecciones de finales teóricos. |
| `app/(dashboard)/entrenamiento/finales/[slug]/page.tsx` | Reproductor de una lección y modo de práctica. |
| `app/(dashboard)/consulta-gm/page.tsx` | Formulario e historial de consultas al GM. |
| `app/(dashboard)/jugar/page.tsx` | Modo de juego y práctica contra el motor. |
| `app/(dashboard)/perfil/page.tsx` | Consulta y edición del perfil, preferencias y tema visual. |

### 3.2 Componentes de interfaz

Ruta: `frontend/src/components/`

| Carpeta o módulo | Función principal |
|---|---|
| `components/ui/` | Componentes visuales reutilizables: botones, formularios, tarjetas, pestañas, alertas, sidebar y controles base. |
| `components/analysis/` | Tableros, replay PGN, importación Lichess, formularios y vistas de análisis propio o de GM. |
| `components/training/` | Tablero interactivo, controles, visor PGN y tarjetas/listas de tareas. |
| `components/endgame/` | Reproductor de teoría PGN, timeline, audio y tablero de práctica de finales. |
| `GMActiveIndicator.tsx` | Muestra si existen consultas o auditorías del GM en procesamiento. |
| `theme-provider.tsx` | Proporciona el tema claro/oscuro mediante `next-themes`. |
| `theme-toggle.tsx` | Permite alternar el tema visual. |

### 3.3 Contextos y hooks

| Módulo | Función principal |
|---|---|
| `context/GMConsultationContext.tsx` | Estado global de consultas y auditorías activas, notificaciones y contador mostrado en el dashboard. |
| `hooks/useAdaptivePolling.ts` | Polling con intervalos crecientes para trabajos asíncronos. |
| `hooks/useChessAnalysis.ts` | Envía un autodiagnóstico y sigue su estado hasta completar o fallar. |
| `hooks/useGMConsultation.ts` | Envía consultas al GM y controla su polling. |
| `hooks/useChessSounds.ts` | Centraliza sonidos de movimiento y notificación del tablero. |

### 3.4 Cliente, autenticación y utilidades

Ruta: `frontend/src/lib/`

| Módulo | Función principal |
|---|---|
| `api.ts` | Cliente HTTP hacia el backend; serializa peticiones, añade JWT y normaliza errores. |
| `auth.ts` | Guarda, recupera y elimina el token de autenticación. |
| `types.ts` | Tipos TypeScript compartidos para respuestas y entidades de la API. |
| `lichess.ts` | Descarga partidas públicas de Lichess y solicita su análisis. |
| `pgn.ts` | Parseo y utilidades para trabajar con PGN. |
| `kiosk.ts` | Utilidades del modo de visualización/kiosco. |
| `utils.ts` | Funciones auxiliares generales y de clases CSS. |

### 3.5 Pruebas del frontend

Los tests están junto a sus módulos (`*.test.ts` y `*.test.tsx`) y cubren autenticación, cliente API, polling, importación Lichess, componentes de entrenamiento, navegación de pestañas y visor de finales.

---

## 4. Contrato entre frontend y backend

| Necesidad 		|	Backend 					| Frontend 						|
|-----------------------|-------------------------------------------------------|-------------------------------------------------------|
| Sesión		| `/users/login`, JWT y dependencias de seguridad 	| `lib/auth.ts`, formulario de login y `lib/api.ts` 	|
| Análisis de partida 	| `/games` y `chess_analyzer.py` 			| `useChessAnalysis`, `AnalysisFormPanel` y tableros 	|
| Coach IA 		| `/coach`, `coach_service.py` y `llm_coach.py` 	| página `coach` y renderizado del informe Markdown 	|
| Consulta al GM 	| `/gm-consultations` y `gm_consultation_service.py` 	| `useGMConsultation` y `GMConsultationContext` 	|
| Entrenamiento 	| `/training` y `puzzle_service.py` 			| páginas de entrenamiento y componentes de tareas 	|
| Finales 		| `/endgames` y `endgame_generator_service.py` 		| catálogo, `PgnStudyViewer` y `EndgamePracticeBoard` 	|

La frontera entre ambas partes es la API REST JSON. El frontend no accede directamente a la base de datos, a Stockfish ni a Gemini; todas esas responsabilidades pertenecen al backend.