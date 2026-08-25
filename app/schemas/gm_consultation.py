# app/schemas/gm_consultation.py
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, AliasChoices


class GMConsultationCreate(BaseModel):
    """Cuerpo de la petición: la duda o consulta del usuario al Gran Maestro."""

    question: str = Field(
        ...,
        min_length=3,
        max_length=3000,
        description="Duda o consulta de ajedrez que se envía al Gran Maestro.",
    )


class GMConsultationStatus(BaseModel):
    """Estado de una consulta en segundo plano (procesamiento asíncrono)."""

    consultation_id: int = Field(validation_alias=AliasChoices("consultation_id", "id"))
    status: str  # "processing" | "completed" | "failed"
    answer: Optional[str] = None
    error_message: Optional[str] = None
    attempts: int = 0  # Intentos de llamada a Gemini en la última ronda
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GMConsultationResponse(GMConsultationStatus):
    """Consulta completa, incluyendo la pregunta original."""

    question: str
