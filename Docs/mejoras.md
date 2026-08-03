## 1. ¿Cómo se guardan las tareas y cómo interactúa el usuario en el Frontend?

Para que el usuario pueda **elegir qué tarea quiere realizar** en cada momento (p. ej. *"Hoy prefiero ver la partida de Capablanca"* o *"Prefiero hacer 10 puzzles de Finales de Torres"*), el backend debe entregar un **Plan Semanal estructurado como una lista de módulos**.

### Modificaciones necesarias en la Base de Datos (BD)

Sí, hay que añadir/modificar tablas para modelar este flujo. Una estructura muy limpia es:

```text
[WeeklyPlan] (Plan de la semana del usuario)
  ├── id, user_id, week_start, week_end, is_active
  │
  ├── [TrainingTask] (Las sub-tareas o módulos que el usuario puede elegir)
  │     ├── id, weekly_plan_id
  │     ├── task_type ("PUZZLE_BATCH", "GM_GAME_STUDY", "USER_GAME_ANALYSIS")
  │     ├── title ("Estructuras de Peón Aislado: Capablanca", "Táctica: Capturas Forzadas")
  │     ├── theme_tag ("endgame", "pin", "hangingPiece", etc.)
  │     ├── status ("PENDING", "IN_PROGRESS", "COMPLETED")
  │     └── payload_json (IDs de los puzzles asignados, o datos específicos)
  │
  └── [GMGameAssignment] (Partidas comentadas asignadas para esa semana)
        ├── id, task_id
        ├── gm_name, topic, pgn_annotated
        └── user_notes (Comentarios o variantes que el usuario añade durante el estudio)

```

### Flujo en el Frontend

1. **Selector de Módulos (Dashboard):** Al entrar en `/training`, el usuario ve su **"Plan de la Semana"** con tarjetas interactibles:
* 🧩 **Módulo Táctico / Posicional:** *"15 Puzzles de Eliminación del Defensor"* [Progreso: 5/15] $\rightarrow$ [Boton: *Entrenar Ahora*]
* 📚 **Estudio de GM:** *"Capablanca vs. Lasker (1921) - Manejo de Peón Aislado"* $\rightarrow$ [Boton: *Estudiar Partida*]
* 📝 **Análisis de Partida Propia:** *"Revisión guiada de tu Partida #4"* $\rightarrow$ [Boton: *Revisar*]


2. **Libertad de Elección:** El usuario no está obligado a un orden lineal; escoge qué bloque abordar según el tiempo o la energía que tenga ese día.

---

## 2. Corrección de Análisis / Comentarios del Usuario sobre PGN (Feedback de Gemini)

Esta idea es excelente para fomentar el **estudio activo** (no solo mirar la pantalla, sino intentar explicar la jugada).

### ¿Cómo funcionaría la revisión del usuario?

1. En el visor PGN, el usuario añade sus propias notas o variantes en jugadas clave (ej. *"Aquí pensé en 21.Ne5 porque ataca c6, pero temía 21...f6"*).
2. Pulsa en **"Enviar mi análisis al Coach"**.
3. Se hace una llamada a Gemini con el PGN anotado por el usuario + la evaluación de Stockfish.

### Tono y Filosofía de la IA (Sin "hacer leña del árbol caído")

Gemini debe actuar como un **Maestro empático y pedagógico**:

* **Validar el razonamiento:** Si el cálculo del usuario tenía sentido táctico pero falló por una sutileza, Gemini debe elogiar la intención (*"Buen ojo al detectar la casilla c6, la idea estratégica era correcta..."*).
* **Señalar el punto ciego con delicadeza:** (*"...sin embargo, la respuesta 21...f6 descalabra el plan porque deja sin casilla al caballo. Mira qué ocurre si antes jugamos 21.a4"*).
* **Progresión continua:** Le recuerda que la visión táctica se consolida con la acumulación de partidas y que el error es la herramienta principal de aprendizaje.

---

## 3. La App como Sistema Autosuficiente (Sin depender de ChessBase)

Para lograr que la app no necesite software externo, debe integrar internamente:

* **Visor / Editor de PGN en la web:** Usar librerías como `@mliebelt/pgn-viewer` o integrar `chessboardjs` + `chess.js` habilitando un panel de texto para agregar anotaciones `{comentario}` y árbol de variantes sintácticas.
* **Descargador / Repositorio de Partidas Clásicas:** Tener un servicio interno que, según el GM sugerido por Gemini (ej. Rubinstein, Capablanca), busque en una colección local comprimida de PGNs de clásicos (fácil de integrar en el backend) la partida más representativa del tema.

---

## 💡 Otras ideas y temas para elevar la plataforma (Propuestas de Mejora)

1. **"Racha de Entrenamiento" y Gamificación Suave:**
* Contador de días consecutivos entrenando antes del reinicio del viernes.
* Porcentaje de cumplimiento semanal (ej. *"Semana completada al 85%"*).


2. **Módulo de "Repetición Espaciada" (Errores Propios Reincidentes):**
* En lugar de jugar solo puzzles aleatorios de la base de datos de 6M, incluir automáticamente en la tarea semanal **los mismos ejercicios o posiciones donde el usuario cometió un fallo en sus partidas reales** hace 2 o 3 semanas. Esto garantiza que no tropiece dos veces con la misma piedra.


3. **Resumen de Cierre de Semana (Los Viernes):**
* Antes de reiniciar la tarea a las 00:00 del viernes, enviar un mini-resumen o notificación:
*"Esta semana completaste 20/20 puzzles y estudiaste la partida de Capablanca. ¡Tu precisión táctica en capturas ha subido un 4%!"*


4. **Exportación de Informes y Tareas:**
* Opción de exportar el PGN estudiado (con los comentarios del usuario + correcciones de Gemini) para que el alumno pueda guardarlo en su colección personal si lo desea.



---

¿Qué te parecen estos puntos de diseño? Si estás de acuerdo con la estructura de la base de datos y la dinámica de las tareas, podemos pasar a definir los **modelos de BD o las rutas API para la gestión del plan semanal**.