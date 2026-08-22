# 📋 Plantilla de Evaluación de Preproducción — EntrenadorIA

**Proyecto:** EntrenadorIA (Sistema de Autodiagnóstico y Tutoría de Ajedrez con IA)  
**Fase:** Pruebas de Preproducción (Beta Testers)  
**Objetivo:** Validar la precisión pedagógica del Tutor (Gemini), la usabilidad de la interfaz de carga/análisis y la estabilidad técnica del sistema antes del despliegue final.

---

## 🎯 Instrucciones para el Tester
Por favor, realiza al menos **2 análisis completos de partidas** (una partida de Gran Maestro y una partida propia o anotada a mano) y evalúa los siguientes bloques según tu experiencia.

---

## 1. Calidad Pedagógica del Tutor de IA (Gemini)

Evaluamos el rigor y valor práctico del análisis que genera el Gran Maestro Virtual tras enviar el formulario.

* **1.1. Utilidad del Feedback por Fases:**  
  ¿Los comentarios en *Apertura, Medio Juego y Final* aportan conceptos estratégicos reales o se sienten genéricos/repetitivos?
  - [ ] Excelente (Aporta ideas clave y maniobras concretas)
  - [ ] Aceptable (Correcto pero algo superficial)
  - [ ] Deficiente (Repite lo mismo que escribí en el formulario)

* **1.2. Detección del Error Conceptual:**  
  En la sección de *Conclusiones*, ¿Gemini identificó correctamente si tu plan estratégico era adecuado o detectó tu fallo posicional/táctico?
  - [ ] Sí, acertó de lleno con el error
  - [ ] Parcialmente acertado
  - [ ] No, no entendió la posición o dio una evaluación errónea

* **1.3. Concisión y Tono:**  
  ¿Las respuestas del tutor son claras y directas (2-3 frases por bloque) o resultan abrumadoras/largas de leer?
  - [ ] Longitud ideal
  - [ ] Muy largo / Demasiado texto
  - [ ] Demasiado breve / Falta explicación

---

## 2. Experiencia de Usuario y Tablero (UX/UI)

Evaluamos la facilidad para ingresar partidas y rellenar el formulario de autodiagnóstico.

* **2.1. Carga de Partidas (PGN / Modo 1v1):**  
  ¿Tuviste algún problema al pegar un PGN propio o al reproducir movimientos en el tablero interactivo (modo 1v1 / liga)?
  - [ ] Fluido y sin errores
  - [ ] El tablero se sintió lento o dio fallos en la notación de jugadas
  - [ ] Dificultad para introducir los nombres de Jugador Blancas / Negras

* **2.2. Formulario de Autodiagnóstico:**  
  El formulario consta de 4 bloques (Fases, Preguntas Críticas, Factores Posicionales y Conclusiones). ¿Resulta intuitivo y ágil de completar?
  - [ ] Intuitivo y fácil de estructurar
  - [ ] Cansado / Demasiados campos obligatorios
  - [ ] Confuso (especifica qué bloque fue confuso a continuación)

---

## 3. Histórico de Análisis y Navegación

* **3.1. Visualización de Registros:**  
  En la pantalla de *Histórico de Análisis*, ¿se identifican claramente las partidas (Jugadores, Fecha, Estado de evaluación)?
  - [ ] Sí, la información es clara y ordenada
  - [ ] No, faltan datos visibles

* **3.2. Consulta y Re-evaluación:**  
  ¿Pudiste abrir análisis anteriores para leer el feedback del GM o completar análisis pendientes sin fallos?
  - [ ] Funcionó correctamente
  - [ ] Hubo errores al cargar los datos guardados

---

## 4. Rendimiento y Estabilidad Técnica

* **4.1. Tiempos de Espera (Latencia):**  
  El análisis de Gemini tarda entre 8 y 15 segundos. ¿El indicador de carga (spinner) te pareció adecuado?
  - [ ] Adecuado (se entiende que el GM está analizando)
  - [ ] Excesivo o genera sensación de congelamiento

* **4.2. Errores o Bloqueos:**  
  ¿Experimentaste algún mensaje de error inesperado (`Failed to fetch`, pantallas en blanco, o desconnexión del servidor)?
  - [ ] No, todo el flujo fue estable
  - [ ] Sí (detalla el error abajo)

---

## 💬 Comentarios Abiertos y Casos Límite (Muy Importante)

Por favor, describe a continuación **cualquier situación específica en la que el sistema haya fallado**, o donde el feedback de la IA te haya parecido incoherente:

> **Descripción del problema / Sugerencia:**  
> _[ Escribe aquí tu respuesta ]_

---