# EntrenadorIA — Distribución para Testers

Aplicación de entrenamiento de ajedrez (análisis con Stockfish, informes Gemini,
finales teóricos y consultas al Gran Maestro) empaquetada como ejecutable
independiente para Windows.

---

## 1. Requisitos

- **Windows 10 / 11 (64 bits).**
- No necesita **Python** ni **Node.js** instalados: ambos runtime van embebidos
  en la distribución (`entrenador.exe` incluye el backend y `frontend/node.exe`
  el servidor de Next.js).
- Permisos de escritura en la carpeta `dist` (la base de datos se crea/actualiza
  ahí mismo al arrancar).

## 2. Puertos utilizados ( locales )

| Servicio | URL                              |
|----------|----------------------------------|
| Backend  | `http://127.0.0.1:8000`          |
| Frontend | `http://localhost:3000/login`    |

Si el firewall de Windows pregunta, **permitir el acceso en redes privadas**.
No se expone nada fuera de la máquina.

## 3. Cómo arrancar

1. Descomprimir la carpeta `dist` en una ubicación de tu elección.
2. **Doble clic en `dist/start.bat`** (o directamente en `dist/entrenador.exe`).
3. Se abrirá el navegador automáticamente en una **ventana de aplicación**
   (sin barra de dirección ni pestañas) en la pantalla de **Inicio de sesión**.
4. Regístrate con una cuenta o usa una ya existente.

> La primera carga del frontend puede tardar unos segundos mientras arranca el
> servidor Next.js embebido.

## 4. Cómo salir

Pulsa el botón **"Salir al escritorio"**, disponible en:

- La pantalla de **Inicio de sesión**.
- El **menú lateral**, justo encima de **"Cerrar Sesión"**.

Esto cierra la ventana del navegador y detiene el backend y el frontend.

## 5. Contenido de la carpeta `dist`

| Elemento                | Descripción                                         |
|------------------------|-----------------------------------------------------|
| `entrenador.exe`       | Ejecutable principal (backend + orquestador).       |
| `start.bat`            | Arranque de doble clic para Windows.                |
| `start.sh`             | Arranque para Unix/Mac (si se distribuye allí).     |
| `frontend/`            | Servidor Next.js standalone + `node.exe` embebido.  |
| `stockfish/stockfish.exe` | Motor de ajedrez para el análisis.               |
| `entrenador_ia.db`     | Base de datos de trabajo (ya incluida).             |
| `.env`                 | Configuración (puertos, clave secreta, rutas).      |

---

## 6. Novedades respecto a versiones anteriores

### Apertura en modo aplicación (sin intrusión)
El arranque ya **no** usa `--kiosk` ni perfiles temporales, y **no cierra ni
toca** las ventanas, pestañas ni sesiones que el usuario tenga abiertas en su
navegador. Se abre una **ventana de aplicación propia** (`--app=URL
--start-fullscreen`) limpia, maximizada y sin interfaz del navegador.

### Botón "Salir al escritorio"
Nuevo botón en el login y en el menú (sobre "Cerrar Sesión") que cierra la
aplicación completa (navegador + backend + frontend) de forma controlada.
Funciona porque el ejecutable levanta un pequeño servidor local en
`127.0.0.1:18999`; al pulsar el botón, el frontend le avisa y el orquestador
termina los procesos.

### Visor de finales: marcas de casillas y flechas del PGN
El visor de lecciones de la **Academia de Finales** ahora interpreta las
marcas de comentario de Lichess incluidas en el PGN:

- `[%csl Ge4,Rd5]` → **resalta casillas** con su color.
- `[%cal Gd1d8,Be8e1]` → **dibuja flechas** origen→destino con su color.

Colores estándar soportados:

| Letra | Color    | Hex       |
|-------|----------|-----------|
| `G`   | Verde    | `#15803d` |
| `R`   | Rojo     | `#b91c1c` |
| `Y`   | Amarillo | `#eab308` |
| `B`   | Azul     | `#2563eb` |

Las marcas se muestran al situarse en la jugada correspondiente. El texto de
las directivas (`[%csl]…`, `[%cal]…`) se **elimina** tanto de la explicación
visible como de la lectura por voz (TTS), para que no se pronuncie en voz alta.

---

## 7. Solución de problemas

- **No abre el navegador / pantalla en blanco:** comprueba que el firewall no
  bloqueó el acceso local y que los puertos `8000` y `3000` no están ocupados.
- **"Salir al escritorio" no hace nada:** este botón depende del ejecutable
  (orquestador). Si lanzas el frontend manualmente con `npm run dev` sin el
  ejecutable, el cierre no está disponible (limitación del navegador).
- **No muevas archivos fuera de `dist`:** las rutas de `stockfish`, la BD y el
  frontend son relativas a esa carpeta.
- **La BD no se carga:** asegúrate de que `entrenador_ia.db` está en `dist/`.

---

*Generado para pruebas. No distribuir claves ni datos sensibles fuera del
entorno de test.*
