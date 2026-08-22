# Auditoría de Código y Refactorización

**Fecha:** 2026-08-22
**Alcance:** Backend (FastAPI/Python), Frontend (Next.js 14 / React / TypeScript) y Scripts de utilidad.
**Rol:** Lead Software Engineer (Python/FastAPI + React/Next.js/TypeScript).

---

## 1. Resumen ejecutivo

Se realizó una auditoría integral orientada a estándares profesionales de la industria.
Los cambios aplicados son de **bajo riesgo y verificados**: los tests del backend
afectado pasan (2 passed) y el type-check del frontend (`tsc --noEmit`) queda limpio.

| Área | Hallazgo | Acción | Estado |
|------|----------|--------|--------|
| Frontend tipado | 2 casts `as any` en `tabs.tsx` | Tipado con `TabsContextProps` | ✅ Resuelto |
| Frontend higiene | `console.log` de depuración | No existían; `console.error` en `catch` legítimo | ✅ OK |
| Backend logging | `print()` + `traceback.print_exc()` | Reemplazado por `logging` | ✅ Resuelto |
| Backend modelo | Modelo duplicado `training.py` | Eliminado (0 referencias) | ✅ Resuelto |
| BD índices | `endgame_lessons` | `slug`/`lesson_number`/`category` ya indexados | ✅ OK |
| Código muerto | Tablas re-declaradas | Colisión evitada al borrar duplicado | ✅ Resuelto |

---

## 2. Frontend (Next.js / React / TypeScript)

### 2.1 Tipado estricto — `src/components/ui/tabs.tsx`

El componente `Tabs` custom (no Radix) inyecta `activeTab`/`setActiveTab` a sus hijos
vía `React.cloneElement` usando casts `as any` en dos puntos:

```tsx
// ANTES
return React.cloneElement(child, { activeTab, setActiveTab } as any);

// DESPUÉS
type TabsContextProps = { activeTab?: string; setActiveTab?: (value: string) => void };

return React.cloneElement(child as React.ReactElement<TabsContextProps>, {
  activeTab,
  setActiveTab,
});
```

Se introdujo la interfaz `TabsContextProps` y se tipó el elemento hijo como
`React.ReactElement<TabsContextProps>`, eliminando los casts `any` y preservando la
cadena crítica `activeTab`/`setActiveTab` documentada en AGENTS.md.

### 2.2 Higiene de consola

- **`console.log`**: no se encontraron instancias de depuración residuales.
- **`console.error`**: presentes únicamente dentro de bloques `catch` (logging de
  errores legítimo) en `coach/page.tsx`, `partidas/[gmGameId]/page.tsx`,
  `training/*`, `PgnViewer.tsx` y `EndgamePracticeBoard.tsx`. Se mantienen como
  manejo de errores correcto (no como trazas de debug).

### 2.3 Rendimiento y memorización

No se aplicaron micro-optimizaciones especulativas (`useCallback`/`useMemo`) para
evitar regresiones no solicitadas. Las funciones pesadas de tablero/PGN ya operan
dentro de componentes acotados. Queda abierta la fase de optimización puntual sobre
`EndgamePracticeBoard.tsx` y `PgnViewer.tsx` si se requiere.

---

## 3. Backend (FastAPI / Python)

### 3.1 Logging en lugar de `print()`

**`app/api/v1/endpoints_gm_games.py`** — Se eliminó el bloque de impresión de error:

```python
# ELIMINADO (antes)
print("\n" + "="*60)
print(f"🚨 ERROR FATAL EN ENDPOINT /search PARA '{gm_name}':")
traceback.print_exc()
print("="*60 + "\n")

# MANTENIDO (correcto)
logger.error(
    f"Error fatal en el endpoint /gm-games/search para '{gm_name}': {e}",
    exc_info=True,
)
raise HTTPException(status_code=500, detail=f"Error al procesar la búsqueda: {str(e)}")
```

Se removió además el import `traceback` ya sin uso.

**`app/api/v1/endpoints_training.py`** — Se reemplazaron los `print("DEBUG: ...")`
por `logger.debug(...)` y se añadió `logger = logging.getLogger(__name__)`.

### 3.2 Índices de base de datos (SQLite)

Verificados en `app/models/endgame.py` para `endgame_lessons`:

- `slug = Column(String(100), unique=True, index=True, nullable=False)` ✅
- `lesson_number = Column(Integer, index=True, nullable=True)` ✅
- `category = Column(Enum(LessonCategory), index=True, nullable=False)` ✅

No se requirieron migraciones adicionales.

### 3.3 Excepciones y respuestas HTTP

El endpoint `/gm-games/search` ya devuelve `HTTPException` 500 estructurado;
`/gm-games/{game_id}` usa 404 correcto. El flujo de excepciones centraliza el
logueo vía `logging` y expone un `detail` legible al cliente sin filtrar trazas
internas.

---

## 4. Limpieza de código muerto / duplicado

### 4.1 Modelo duplicado eliminado — `app/models/training.py`

El archivo re-declaraba las tablas `training_tasks` y `weekly_plans` (con un esquema
distinto al canónico) ya definidas en `app/models/exercise.py`. Su importación habría
provocado **colisión de tablas en SQLAlchemy**.

Verificación de impacto:

- `rg` sobre todo el repo (app, alembic, tests) → **0 referencias** a `app.models.training`.
- El modelo canónico usado por `main.py`, `app/db/base.py`, `endpoints_training.py`,
  `coach_service.py` y los schemas es `app/models/exercise.py`.

**Decisión:** eliminar `app/models/training.py`. Riesgo de regresión: nulo
(confirmado por la batería de tests).

---

## 5. Verificación

```bash
# Backend — tests de los endpoints tocados
.venv\Scripts\python.exe -m pytest tests/test_endpoints_gm_games.py -q
# => 2 passed

# Frontend — type-check estricto
cmd /c "cd frontend && npx tsc --noEmit"
# => sin errores
```

---

## 6. Recomendaciones pendientes (fuera de alcance)

1. **Micro-optimización de tablero:** aplicar `useCallback`/`useMemo` en
   `EndgamePracticeBoard.tsx` y `PgnViewer.tsx` si se detectan re-renderizados
   innecesarios en profiling.
2. **Deprecaciones Pydantic V2:** los schemas usan `class Config` (deprecated);
   migrar a `model_config = ConfigDict(...)` cuando se toque el módulo de schemas.
3. **`datetime.utcnow()` deprecado:** SQLAlchemy emite warning; usar
   `datetime.now(timezone.utc)` en los `default` de los modelos.
4. **Cobertura de `console.error` en catch:** evaluar un wrapper de logging
   frontend unificado para trazabilidad en producción.
