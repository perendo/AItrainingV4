from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional
from app.models.exercise import ExerciseCategory

# --- MOVE ERRORS ---
class MoveErrorBase(BaseModel):
    move_number: int
    algebraic_move: str
    error_type: str  # "Blunder", "Mistake", "Inaccuracy"
    eval_difference: int
    tactical_theme: str
    description: Optional[str] = None

class MoveErrorResponse(MoveErrorBase):
    id: int
    game_id: int

    model_config = {
        "from_attributes": True
    }


# --- GAMES ---
class GameBase(BaseModel):
    white_player: str
    black_player: str
    result: str
    player_color: str
    pgn_content: str

# Esquema detallado que se envía de vuelta tras analizar o listar partidas
class GameResponse(GameBase):
    id: int
    user_id: int
    created_at: datetime
    # Gracias a esto, la API puede devolver la partida junto con todos sus errores detectados de golpe
    errors: List[MoveErrorResponse] = []

    model_config = {
        "from_attributes": True
    }

# Esquema simplificado para estadísticas rápidas o listados masivos
class GameSummaryResponse(BaseModel):
    id: int
    white_player: str
    black_player: str
    result: str
    player_color: str
    error_count: int  # Para mostrar cuántos fallos cometió en esa partida sin cargar todos los detalles
    created_at: datetime

    model_config = {
        "from_attributes": True
    }
# Nuevo esquema para los detalles del puzle que irá al Front
class PuzzleResponse(BaseModel):
    id: str # This was puzzle_id, but the model has id
    fen: str
    moves: str
    rating: int
    themes: str

    class Config:
        from_attributes = True


# --- PROCESSING TASKS ---
class TaskResponse(BaseModel):
    id: int
    filename: str
    status: str
    processed: int
    skipped_duplicate: int
    skipped_not_user: int
    errors_found: int
    error_message: Optional[str] = None
    created_at: datetime

    model_config = {
        "from_attributes": True
    }
        
