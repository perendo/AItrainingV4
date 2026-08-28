En un sistema dinámico guiado por la posición (y no por una partida fija), fijar las paradas por un **número de jugada estricto** (ej. "pausar siempre en la jugada 10") es un error pedagógico, ya que cada apertura se define a ritmos distintos (un *Gambito de Rey* se abre en la jugada 4, mientras que una *Defensa Berlinesa* llega al medio juego en la 15).

Para resolver esto de forma limpia, las paradas deben determinarse según **hitos estructurales y tácticos de la posición**, utilizando a Stockfish y Gemini en el backend para detectar el momento exacto.

---

### Los 3 Tipos de Paradas Automatizadas

**1. Fin de la Teórica / Definición de Estructura (Pausa Principal)**

* **Cuándo se activa:** Cuando la partida sale del "árbol teórico principal" de la apertura o se produce la primera transformación estructural mayor (un peón central que avanza para cerrar el centro, una captura que define una estructura de peones o el enroque opuesto).
* **Jugada aproximada:** Entre la jugada 8 y la 14 según la apertura.
* **Objetivo:** Preguntar por el **plan estratégico a largo plazo** (ej. *"Se ha cerrado el centro. ¿Dónde se debe atacar?"*). Despues de la respuesta del usuario, el gm debe dar una explicacion del plan estrategico a lp

**2. Puntos de Quiebre Táctico / Errores de Evaluación (Pausa de Advertencia)**

* **Cuándo se activa:** Mediante el análisis de Stockfish. Si entre dos jugadas consecutivas la evaluación cambia más de $0.8$ centipones (lo que indica que una de las opciones pierde la ventaja o comete un error grave de concepto), el sistema congela la partida.


* **Jugada aproximada:** Variable (cuando ocurre una imprecisión o ruptura prematura).
* **Objetivo:** Forzar al usuario a identificar por qué esa jugada es un error antes de continuar (ej. *"Las blancas acaban de jugar $h3$. ¿Por qué esta jugada debilita su posición?"*). Despues de la respuesta del usuario, el GM debe poner la respuesta

**3. Transición al Medio Juego Complejo (Pausa de Maniobra)**

* **Cuándo se activa:** Una vez completado el desarrollo de piezas menores y enroques, en el momento en que se debe elegir la primera **maniobra de piezas** estratégica (un salto de caballo a una casilla fuerte o la colocación de una torre en columna abierta).
* **Jugada aproximada:** Entre la jugada 15 y la 20.
* **Objetivo:** Evaluar la coordinación de piezas y planes de reagrupamiento, dar una explicación sobre ello.

---

### Algoritmo de Detección para el Backend (FastAPI)

Para no programar esto a mano partida por partida, el backend puede automatizar las pausas en el script de ingestión PGN siguiendo esta regla:

1. **Evaluación Stockfish:** Recorre el PGN analizando la pérdida de centipones (ACPL) jugada a jugada.


2. **Filtro de Apertura:** Ignora las primeras 4 jugadas del tablero.


3. **Selección de Puntos:**
* **Nodo 1:** La jugada exacta donde finaliza el libro de aperturas / variante elegida.

* **Nodo 2:** La jugada posterior con mayor oscilación táctica evaluada por Stockfish.


* **Nodo 3:** La jugada previa al primer intercambio masivo de piezas o ruptura de peones.


4. **Envío a Gemini:** FastAPI envía únicamente esos 3 FENs seleccionados a `gemini_client` para que genere el cuestionario de planes y las opciones asociadas.



Este enfoque garantiza que el alumno solo se detenga en momentos donde **realmente hay algo estratégico que aprender**, sin interrumpir el flujo del juego en jugadas rutinarias de desarrollo.