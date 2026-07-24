# app/schemas/coach.py
from pydantic import BaseModel, Field
from datetime import datetime
from typing import List

# Esquema interno para validar la estructura JSON devuelta por el LLM
class CoachReportJSON(BaseModel):
    estimated_level: str = Field(..., description="Ej: 'Intermedio (~1400 ELO)'")
    strengths: List[str] = Field(..., min_length=2, max_length=4, description="Lista de 2-4 puntos fuertes")
    weaknesses: List[str] = Field(..., min_length=2, max_length=4, description="Lista de 2-4 debilidades")
    report_markdown: str = Field(..., description="El informe narrativo completo en formato Markdown")

# Esquema de respuesta para el frontend, tal como se solicitó
class CoachReportResponse(BaseModel):
    id: int
    created_at: datetime
    estimated_level: str
    strengths: List[str]
    weaknesses: List[str]
    report_markdown: str

    class Config:
        from_attributes = True
