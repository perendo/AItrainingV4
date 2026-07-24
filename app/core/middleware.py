import time
import logging
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# Configuración básica de logs limpios en consola
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("EntrenadorIA")

class GlobalExceptionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.time()
        try:
            # Procesar la petición normalmente
            response = await call_next(request)
            
            # Registrar métricas de rendimiento de la petición (Útil para medir el análisis PGN)
            process_time = time.time() - start_time
            logger.info(f"Ruta: {request.url.path} | Estado: {response.status_code} | Tiempo: {process_time:.2f}s")
            
            return response
            
        except Exception as exc:
            # Captura cualquier error crítico no controlado
            process_time = time.time() - start_time
            logger.error(
                f"Error crítico en {request.url.path} después de {process_time:.2f}s | "
                f"Tipo: {type(exc).__name__} | Mensaje: {str(exc)}", 
                exc_info=True # Esto añade el traceback completo solo en los logs del servidor
            )
            
            # Retornamos una respuesta JSON elegante y segura para la GUI/Cliente
            return JSONResponse(
                status_code=500,
                content={
                    "status": "Error interno del sistema",
                    "detail": "Ha ocurrido un error inesperado en el servidor durante el procesamiento.",
                    "error_type": type(exc).__name__
                }
            )