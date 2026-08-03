# Resumen de Tests

**78 passed, 0 failed, ~2 min**

## Comando

```bash
python -m pytest tests/ -v
```

## Ficheros de test

| Fichero | Cubre | Tests |
|---|---|---|
| `test_schemas.py` | Validación Pydantic (User, Game, Exercise, Coach) | 12 |
| `test_security.py` | bcrypt hash/verify, JWT creation/decode | 8 |
| `test_config.py` | Settings .env, engine SQLAlchemy, create_all tablas | 7 |
| `test_repositories.py` | CRUD users, games, duplicados, eager loading, conteo | 11 |
| `test_endpoints_user.py` | Registro, login, /me, actualización, auth | 9 |
| `test_endpoints_game.py` | Upload PGN (background), listado, status de tareas, auth cruzada | 11 |
| `test_endpoints_coach.py` | Diagnóstico IA (mock Gemini), historial | 3 |
| `test_endpoints_exercise.py` | Plan semanal, generación, activo, reemplazo | 5 |
| `test_chess_analyzer.py` | `_clean_string`, `_analyze_moves` blunder, `process_pgn_stream` con Stockfish | 8 |
| `test_coach_service.py` | Asignación tareas, categorías, reemplazo | 3 |

## Detalles técnicos

### Background Tasks (PGN Upload)

- **Flujo asíncrono**: `POST /upload-pgn` devuelve `202 Accepted` con un `task_id`. El análisis se ejecuta en `BackgroundTasks`. El cliente consulta el progreso con `GET /games/tasks/{task_id}`.
- **Modelo `ProcessingTask`**: Tabla `processing_tasks` en BD con estados `pending → processing → completed/failed`. Almacena contadores de `processed`, `skipped_duplicate`, `skipped_not_user`, `errors_found`.
- **Sesión independiente**: `process_pgn_background()` crea su propia sesión con `database_module.SessionLocal()` (no depende del request). Importante: usa acceso al módulo (`import app.core.database as database_module`) para que el monkey-patch de tests funcione.
- **Stockfish cleanup**: `engine.quit()` en bloque `finally` para no dejar procesos huérfanos.
- **Seguridad por usuario**: `GET /games/tasks/{id}` solo devuelve la tarea si `user_id` coincide. Otro usuario recibe 404.

### BD en memoria con `StaticPool`

`conftest.py` crea un engine SQLite in-memory con `StaticPool` para que todas las conexiones compartan la misma BD. Si quitas `StaticPool`, los tests de endpoints fallan con "no such table".

### Monkey-patch de `SessionLocal`

El background task crea su propia sesión con `database_module.SessionLocal()`. En tests, el fixture `client` parchea `app.core.database.SessionLocal` para apuntar al engine in-memory del test. Sin esto, el background task intenta acceder a `processing_tasks` en la BD real (que no tiene esa tabla) y falla.

### Mock de Gemini

`test_endpoints_coach.py` usa `patch.object(llm_coach_service.client.models, "generate_content", ...)` — el singleton `llm_coach_service` ya tiene el cliente creado al importar, así que hay que parchear el método, no el constructor.

### Tests lentos

`test_endpoints_game.py` lanza Stockfish por cada upload real (~0.7s por test). El suite completo tarda ~2 min.

### PGN real

`test_upload_pgn_real_pedro` usa el fichero `Historico partidas/PedroBasedatos.pgn` con 10 partidas reales del jugador. Timeout ampliado a 120s para el background task.

### Helper `wait_for_task()`

Función auxiliar en `test_endpoints_game.py` que hace polling a `GET /games/tasks/{id}` cada 100ms hasta que la tarea termina (max 30s por defecto, 120s para el test de Pedro). Usada en todos los tests de upload para verificar que el background task completó correctamente.

### SECRET_KEY en tests

`conftest.py` establece `os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"` antes de importar la app. Esto asegura que `settings.SECRET_KEY` y por tanto `security.py` usen una clave predecible en tests, distinta de la del `.env` real.
