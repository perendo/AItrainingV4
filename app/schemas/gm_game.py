# app/schemas/gm_game.py
import uuid
from typing import Optional, Union
from pydantic import BaseModel

class GMGameResponse(BaseModel):
    """
    Esquema de respuesta para una partida de Gran Maestro.
    """
    id: Union[uuid.UUID, str]
    gm_name: str
    white: str
    black: str
    event: str
    year: int
    result: str
    pgn: str
    theme_tags: Optional[str] = None

    model_config = {"from_attributes": True}
