# app/schemas/analysis.py
from pydantic import BaseModel, Field, ConfigDict, field_validator
from datetime import datetime
from typing import List, Optional, Union


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
    # Motivo concreto y claro de por qué el diagnóstico es insuficiente.
    # Solo se rellena (y es obligatorio) cuando plan_correcto es False.
    razon_insuficiente: str = ""
    concepto_reforzar: str


class GeminiFeedback(BaseModel):
    feedback_fases: GeminiFeedbackFases
    respuestas_preguntas_criticas: GeminiFeedbackPreguntasCriticas
    matriz_posicional: GeminiFeedbackPosicional
    auditoria_conclusiones: GeminiFeedbackConclusiones


# --- Respuesta estructurada de la Partida Guiada de Apertura ---
# Tras salir de la teórica el sistema genera dos capas: la Capa A
# (feedback pedagógico del tutor sobre el autodiagnóstico del alumno) y la
# Capa B (análisis general de IA con los momentos críticos de Stockfish).

class TutorFeedbackSchema(BaseModel):
    """Capa A: feedback pedagógico del tutor (3 puntos obligatorios)."""
    user_summary: str
    conceptual_error: str
    takeaway_lesson: str


class CriticalMomentSchema(BaseModel):
    """Punto crítico de la partida según Stockfish (Capa B)."""
    ply: int
    san_move: str
    eval_change: float
    explanation: str


class GeneralAIAnalysisSchema(BaseModel):
    """Capa B: análisis general de la IA, limpio y técnico."""
    summary: str
    critical_moments: List[CriticalMomentSchema]
    strategic_plans: List[str]


class AuditGameAnalysisResponse(BaseModel):
    """Respuesta JSON de Gemini para una Partida Guiada de Apertura.

    Incluye la identificación teórica de la apertura (ECO + nombre oficial)
    y las dos capas de análisis (tutor pedagógico + análisis general de IA).
    """
    eco_code: str
    opening_name: str
    is_user_analysis_sufficient: bool
    tutor_feedback: TutorFeedbackSchema
    general_ai_analysis: GeneralAIAnalysisSchema


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
    # Modo de análisis:
    #   "auto"           -> el backend detecta si hay autodiagnóstico (auditoría) o no (análisis IA)
    #   "ai"             -> análisis completo de la partida por el Gran Maestro (sin comentarios del alumno)
    #   "self_audit"     -> auditar el autodiagnóstico del alumno (requiere comentarios)
    #   "guided_opening" -> Partida Guiada de Apertura: auditación tras salir de la teórica
    analysis_mode: Optional[str] = "auto"

    @field_validator("analysis_mode")
    @classmethod
    def _validar_analysis_mode(cls, v: Optional[str]) -> str:
        val = (v or "auto").strip().lower()
        if val not in {"auto", "ai", "self_audit", "guided_opening"}:
            return "auto"
        return val

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
    status: Optional[str] = None  # "processing" | "completed" | "failed"
    error_message: Optional[str] = None
    analysis_mode: Optional[str] = None  # "auto" | "ai" | "self_audit" | "guided_opening"
    audit_attempts: int = 0
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
