from fastapi import APIRouter
from app.api.v1 import (
    endpoints_coach, endpoints_gm_games, endpoints_user, 
    endpoints_game, endpoints_training, endpoints_analysis,
    endpoints_gm_consultations, endgames, endpoints_openings,
)

api_router = APIRouter()

api_router.include_router(endpoints_user.router, prefix="/users", tags=["Users"])
api_router.include_router(endpoints_game.router, prefix="/games", tags=["Games"])
api_router.include_router(endpoints_coach.router, prefix="/coach", tags=["Coach"])
api_router.include_router(endpoints_gm_games.router, prefix="/gm-games", tags=["GM Games"])
api_router.include_router(endpoints_training.router, prefix="/training", tags=["Training"])
api_router.include_router(endpoints_analysis.router, prefix="/game-analysis", tags=["Game Analysis"])
api_router.include_router(endpoints_gm_consultations.router, prefix="/gm-consultations", tags=["GM Consultations"])
api_router.include_router(endgames.router, prefix="/endgames", tags=["endgames"])
api_router.include_router(endpoints_openings.router, prefix="/openings", tags=["Openings"])

__all__ = ["api_router"]
