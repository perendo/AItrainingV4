# app/schemas/analysis.py
from pydantic import BaseModel, Field, ConfigDict, field_validator
from datetime import datetime
from typing import Optional, Union


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

class GameAnalysisBase(BaseModel):
    """Campos comunes de origen de la partida (GM o partida propia/USER)."""
    # Union[str, int]: acepta tanto el uuid string de GMGame como ids numéricos
    # históricos (p.ej. 5078) almacenados como Integer en la BD.
    gm_game_id: Optional[Union[str, int]] = None
    game_type: str = "GM"
    white_player: Optional[str] = None
    black_player: Optional[str] = None
    pgn: Optional[str] = None
    player_username: Optional[str] = None
    user_side: Optional[str] = None

    @field_validator("game_type")
    @classmethod
    def _validar_game_type(cls, v: str) -> str:
        val = (v or "GM").strip().upper()
        if val not in {"GM", "USER"}:
            raise ValueError("game_type debe ser 'GM' o 'USER'")
        return val


class GameAnalysisCreate(GameAnalysisBase):
    """Payload que recibe POST /game-analysis/submit"""
    analysis_id: Optional[int] = None
    fases_analisis: FasesAnalisis
    momentos_criticos: MomentosCriticos
    factores_posicionales: FactoresPosicionales
    conclusiones_plan: ConclusionesPlan


class GameAnalysisDraftCreate(GameAnalysisBase):
    """Payload que recibe POST /game-analysis/save-draft (sin auditar con Gemini)"""
    analysis_id: Optional[int] = None
    fases_analisis: Optional[FasesAnalisis] = None
    momentos_criticos: Optional[MomentosCriticos] = None
    factores_posicionales: Optional[FactoresPosicionales] = None
    conclusiones_plan: Optional[ConclusionesPlan] = None


class GameAnalysisResponse(BaseModel):
    """Lo que devuelve la API tras guardar + consultar Gemini"""
    id: int
    user_id: int
    game_id: Optional[Union[str, int]] = None
    game_type: str
    white_player: Optional[str] = None
    black_player: Optional[str] = None
    pgn: Optional[str] = None
    fases_analisis: Optional[str] = None
    momentos_criticos: Optional[str] = None
    factores_posicionales: Optional[str] = None
    conclusiones_plan: Optional[str] = None
    gemini_feedback: Optional[str] = None
    created_at: str
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class GameAnalysisUpdate(BaseModel):
    """Para actualizar parcialmente un autodiagnóstico"""
    fases_analisis: Optional[str] = None
    momentos_criticos: Optional[str] = None
    factores_posicionales: Optional[str] = None
    conclusiones_plan: Optional[str] = None
    gemini_feedback: Optional[str] = None


class GameAnalysisSubmitResponse(BaseModel):
    """Respuesta inmediata (HTTP 202) del envío asíncrono al Gran Maestro."""
    analysis_id: int
    status: str  # "processing"


class GameAnalysisStatusResponse(BaseModel):
    """Estado de la auditoría en segundo plano."""
    analysis_id: int
    status: str  # "processing" | "completed" | "failed"
    has_feedback: bool
    error_message: Optional[str] = None
