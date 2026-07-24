# app/api/v1/endpoints_gm_games.py
import logging
import traceback
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.gm_game import GMGameResponse
from app.services.gm_service import gm_game_service

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get(
    "/search",
    response_model=List[GMGameResponse],
    summary="Buscar partidas de Grandes Maestros"
)
def search_gm_games(
    gm_name: str = Query(..., description="Nombre del Gran Maestro a buscar (ej: 'Capablanca', 'Fischer')."),
    theme: Optional[str] = Query(None, description="Tema táctico o posicional a filtrar (ej: 'endgame')."),
    limit: int = Query(5, ge=1, le=50, description="Número máximo de partidas a devolver."),
    db: Session = Depends(get_db)
):
    """
    Busca partidas de un Gran Maestro (GM).

    - Primero busca en la caché local (base de datos SQLite).
    - Si no encuentra suficientes partidas, utiliza la API de Google Gemini para generar
      una lista de partidas famosas del GM y las guarda en la caché.
    - Garantiza siempre devolver una lista, aunque esté vacía, con un status 200 OK.
    """
    try:
        games = gm_game_service.get_games_by_gm_or_theme(
            db=db,
            gm_name=gm_name,
            theme=theme,
            limit=limit
        )
        if not games:
            return []

        response_games = []
        for game in games:
            response_games.append(GMGameResponse.model_validate(game))

        return response_games

    except Exception as e:
        # 🚨 IMPRESIÓN DETALLADA DEL ERROR EN LA CONSOLA DEL SERVIDOR
        print("\n" + "="*60)
        print(f"🚨 ERROR FATAL EN ENDPOINT /search PARA '{gm_name}':")
        traceback.print_exc()
        print("="*60 + "\n")

        logger.error(f"Error fatal en el endpoint /gm-games/search para '{gm_name}': {e}", exc_info=True)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar la búsqueda: {str(e)}"
        )