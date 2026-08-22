# app/schemas/coach.py
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import List, Optional, Any

# Esquema interno para validar la estructura JSON devuelta por el LLM
class CoachReportJSON(BaseModel):
    report_markdown: str = Field(..., description="El informe narrativo completo en formato Markdown")
    estimated_level: Optional[str] = Field(default="Intermedio", description="Nivel estimado")
    strengths: Optional[List[str]] = Field(default_factory=lambda: ["Buen nivel táctico", "Juego activo"], description="Puntos fuertes")
    weaknesses: Optional[List[str]] = Field(default_factory=lambda: ["Precisión en finales", "Control posicional"], description="Debilidades")

    model_config = ConfigDict(extra="allow")

# Esquema para la llamada a Gemini: sin min_length/max_length en listas,
# porque la SDK (google-generativeai) no soporta minItems/maxItems en response_schema.
class CoachReportJSONSchema(BaseModel):
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
