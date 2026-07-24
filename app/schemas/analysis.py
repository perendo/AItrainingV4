# app/schemas/analysis.py
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional


# --- Bloques JSON que el usuario rellena en el formulario ---

class FasesAnalisis(BaseModel):
    apertura: str
    medio_juego: str
    final: str


class MomentosCriticos(BaseModel):
    pieza_a_mejorar: str
    amenaza_rival: str


class FactoresPosicionales(BaseModel):
    material: str
    seguridad_rey: str
    espacio: str


class ConclusionesPlan(BaseModel):
    plan_estrategico: str
    error_conceptual_grave: str
    idea_a_repasar: str


# --- Respuesta estructurada que Gemini devuelve (auditoría) ---

class GeminiFeedbackFases(BaseModel):
    apertura: str
    medio_juego: str
    final: str


class GeminiFeedbackPreguntasCriticas(BaseModel):
    mejora_piezas: str
    amenaza_real: str


class GeminiFeedbackPosicional(BaseModel):
    material: str
    rey: str
    espacio: str


class GeminiFeedbackConclusiones(BaseModel):
    plan_correcto: bool
    evaluacion_error: str
    concepto_reforzar: str


class GeminiFeedback(BaseModel):
    feedback_fases: GeminiFeedbackFases
    respuestas_preguntas_criticas: GeminiFeedbackPreguntasCriticas
    matriz_posicional: GeminiFeedbackPosicional
    auditoria_conclusiones: GeminiFeedbackConclusiones


# --- Esquemas de la API ---

class GameAnalysisCreate(BaseModel):
    """Payload que recibe POST /game-analysis/submit"""
    gm_game_id: str
    fases_analisis: FasesAnalisis
    momentos_criticos: MomentosCriticos
    factores_posicionales: FactoresPosicionales
    conclusiones_plan: ConclusionesPlan


class GameAnalysisResponse(BaseModel):
    """Lo que devuelve la API tras guardar + consultar Gemini"""
    id: int
    user_id: int
    game_id: Optional[str] = None
    game_type: str
    fases_analisis: Optional[str] = None
    momentos_criticos: Optional[str] = None
    factores_posicionales: Optional[str] = None
    conclusiones_plan: Optional[str] = None
    gemini_feedback: Optional[str] = None
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class GameAnalysisUpdate(BaseModel):
    """Para actualizar parcialmente un autodiagnóstico"""
    fases_analisis: Optional[str] = None
    momentos_criticos: Optional[str] = None
    factores_posicionales: Optional[str] = None
    conclusiones_plan: Optional[str] = None
    gemini_feedback: Optional[str] = None
