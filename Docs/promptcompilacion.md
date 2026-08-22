Quiero crear un ejecutable para los testers de la aplicación EntrenadorIA.

Por favor, un ejecutable para windows entrenador.exe que arranque los servidores y tenga compilado todo el backend, cuando aranquen los servidores debe abrir el navegador por defecto en la pagina users.

1. COMPROBACIÓN Y ENTORNO:
   - Verifica que la base de datos o variables de entorno necesarias estén cargadas.

2. ARRANQUE DE SERVIDORES EN SEGUNDO PLANO:
   - Inicia el servidor Backend (FastAPI con Uvicorn en http://localhost:8000).
   - Inicia el servidor Frontend (Next.js en http://localhost:3000).

3. ESPERA Y APERTURA DEL NAVEGADOR:
   - Implementa un mecanismo de espera activo (polling o retardo de comprobación) que verifique cuando el puerto 3000 (Next.js) o el endpoint del backend estén respondiendo con éxito (HTTP 200).
   - Únicamente cuando los servidores estén 100% operativos y respondiendo, abre automáticamente el navegador web predeterminado del sistema apuntando a `http://localhost:3000`.

4. GESTIÓN DE CIERRE (LIMPIEZA):
   - Muestra una consola de control que informe al tester que el sistema está corriendo y proporcione una instrucción clara para cerrar la aplicación (ej. "Presiona cualquier tecla o CTRL+C para detener todos los servidores").
   - Asegúrate de que al cerrar el script principal se maten/detengan limpiamente todos los procesos secundarios de Node y Python asociados para no dejar los puertos bloqueados.

Por favor, genera la estructura de archivos del ejecutable/distribuible junto con las instrucciones para que los testers solo tengan que hacer doble clic para ejecutar, incorporando todos los ficheros necesarios en el directorio dist