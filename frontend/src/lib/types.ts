// Tipos TypeScript — espejo de Pydantic schemas del backend

// Auth
export interface UserCreate {
  username: string;
  full_name: string;
  chess_online_nick?: string;
  current_elo: number;
  target_elo: number;
  password: string;
}


export interface UserUpdate {
  full_name?: string;
  chess_online_nick?: string;
  current_elo?: number;
  target_elo?: number;
  password?: string;
}

export interface UserLogin {
  username: string;
  password: string;
}


export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserResponse {
  id: number;
  username: string;
  full_name: string;
  chess_online_nick?: string;
  current_elo: number;
  target_elo: number;
  created_at: string;
}

// Games
export interface MoveErrorResponse {
  id: number;
  game_id: number;
  move_number: number;
  algebraic_move: string;
  error_type: string;
  eval_difference: number;
  tactical_theme: string;
  description?: string;
}

export interface GameResponse {
  id: number;
  user_id: number;
  white_player: string;
  black_player: string;
  result: string;
  player_color: string;
  pgn_content: string;
  created_at: string;
  errors: MoveErrorResponse[];
}

export interface TaskResponse {
  id: number;
  filename: string;
  status: "pending" | "processing" | "completed" | "failed";
  processed: number;
  skipped_duplicate: number;
  skipped_not_user: number;
  errors_found: number;
  error_message?: string;
  created_at: string;
}

// Coach
export interface CoachReportResponse {
  id: number;
  user_id: number;
  report_text: string;
  report_markdown: string;
  estimated_level: string;
  strengths: string[];
  weaknesses: string[];
  created_at: string;
  updated_at: string;
}

// Training / Exercises
export interface PuzzleResponse {
  id: string; // Was puzzle_id, changed to match backend model
  fen: string;
  moves: string; // UCI moves separated by spaces
  rating: number;
  themes: string;
}

export interface PuzzleSolutionRequest {
  user_moves: string; // UCI moves separated by spaces
}

export interface ExerciseSolutionResponse {
  correct: boolean;
  message: string;
  next_puzzle?: PuzzleResponse;
}

export interface TrainingTaskResponse {
  id: number;
  category: "TACTICS" | "ENDGAME" | "STRATEGY";
  description: string;
  target_count: number;
  current_count: number;
  is_completed: boolean;
  created_at: string;
  puzzles?: PuzzleResponse[];
}

export interface WeeklyPlanResponse {
  id: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  compliance_rate: number;
  tasks: TrainingTask[];
}

export interface GMGameResponse {
  id: string;
  gm_name: string;
  white: string;
  black: string;
  event: string;
  year: number;
  result: string;
  pgn: string;
  theme_tags?: string;
}

export interface TrainingTask {
  id: number;
  category: "Estrategia y Posicional" | "Táctica y Capturas" | "Seguridad del Rey y Finales" | "Análisis de Partida de GM";
  description: string;
  current_count: number;
  target_count: number;
  is_completed: boolean;
  gm_game?: GMGameResponse;
}

// Game Analysis / Autodiagnóstico
export interface FasesAnalisis {
  apertura: string;
  medio_juego: string;
  final: string;
}

export interface MomentosCriticos {
  pieza_a_mejorar: string;
  amenaza_rival: string;
}

export interface FactoresPosicionales {
  material: string;
  seguridad_rey: string;
  espacio: string;
}

export interface ConclusionesPlan {
  plan_estrategico: string;
  error_conceptual_grave: string;
  idea_a_repasar: string;
}

export interface UserGameAnalysisSubmit {
  gm_game_id?: string | number | null;
  game_type: "GM" | "USER";
  white_player?: string;
  black_player?: string;
  pgn?: string;
  analysis_id?: number;
  fases_analisis: FasesAnalisis;
  momentos_criticos: MomentosCriticos;
  factores_posicionales: FactoresPosicionales;
  conclusiones_plan: ConclusionesPlan;
}

export interface UserGameAnalysisDraft {
  gm_game_id?: string | number | null;
  game_type: "GM" | "USER";
  white_player?: string;
  black_player?: string;
  pgn?: string;
  analysis_id?: number;
  fases_analisis?: FasesAnalisis;
  momentos_criticos?: MomentosCriticos;
  factores_posicionales?: FactoresPosicionales;
  conclusiones_plan?: ConclusionesPlan;
}

export interface FeedbackFases {
  apertura: string;
  medio_juego: string;
  final: string;
}

export interface RespuestasPreguntasCriticas {
  mejora_piezas: string;
  amenaza_real: string;
}

export interface MatrizPosicional {
  material: string;
  rey: string;
  espacio: string;
}

export interface AuditoriaConclusiones {
  plan_correcto: boolean;
  evaluacion_error: string;
  concepto_reforzar: string;
}

export interface GeminiFeedback {
  feedback_fases: FeedbackFases;
  respuestas_preguntas_criticas: RespuestasPreguntasCriticas;
  matriz_posicional: MatrizPosicional;
  auditoria_conclusiones: AuditoriaConclusiones;
}

export interface UserGameAnalysisResponse {
  id: number;
  user_id: number;
  game_id: string | number | null;
  game_type: string;
  white_player?: string | null;
  black_player?: string | null;
  pgn?: string | null;
  fases_analisis: string | null;
  momentos_criticos: string | null;
  factores_posicionales: string | null;
  conclusiones_plan: string | null;
  gemini_feedback: string | null;
  created_at: string;
  updated_at?: string | null;
}

export type GameAnalysisGameType = "GM" | "USER";

export type GameAnalysisStatus =
  | "pending"
  | "evaluated_correct"
  | "evaluated_incorrect";

export function gameAnalysisStatus(analysis: UserGameAnalysisResponse): GameAnalysisStatus {
  if (!analysis.gemini_feedback) return "pending";
  try {
    const feedback = JSON.parse(analysis.gemini_feedback) as GeminiFeedback;
    return feedback.auditoria_conclusiones.plan_correcto
      ? "evaluated_correct"
      : "evaluated_incorrect";
  } catch {
    return "pending";
  }
}

// Envío asíncrono de autodiagnóstico al Gran Maestro
export interface GameAnalysisSubmitResponse {
  analysis_id: number;
  status: string;
}

export interface GameAnalysisStatusResponse {
  analysis_id: number;
  status: "processing" | "completed" | "failed";
  has_feedback: boolean;
  error_message?: string | null;
}

// Módulo de Finales Teóricos (Academia de Finales)
export type LessonCategory = "peones" | "torres" | "piezas_menores" | "damas";
export type LessonStatus = "not_started" | "in_progress" | "mastered";
export type ActionType =
  | "move_piece"
  | "highlight_square"
  | "draw_arrow"
  | "pause_for_quiz";

export interface TimelineEvent {
  id: number;
  lesson_id: number;
  timestamp_seconds: number;
  action_type: ActionType;
  payload: Record<string, unknown>;
}

export interface EndgameLessonListItem {
  id: number;
  slug: string;
  title: string;
  category: LessonCategory;
  difficulty: string;
  target_result: string;
  has_audio: boolean;
  status: LessonStatus;
  last_listened_second: number;
}

export interface EndgameLessonDetail {
  id: number;
  slug: string;
  title: string;
  category: LessonCategory;
  difficulty: string;
  target_result: string;
  initial_fen: string;
  audio_url: string | null;
  podcast_script: string | null;
  timeline_events: TimelineEvent[];
  lesson_number?: number | null;
  chapter_name?: string | null;
  concept?: string | null;
  /** PGN completo de la lección (comentarios, NAGs y variantes incluidos). */
  pgn_content?: string | null;
  main_line?: string[] | null;
  initial_comment?: string | null;
  theory_tree?: unknown[] | null;
  final_comment?: string | null;
}

export interface EndgameProgressResponse {
  slug: string;
  status: LessonStatus;
  last_listened_second: number;
  updated_at: string;
}

// Consultas (dudas) al Gran Maestro — procesamiento asíncrono en segundo plano
export type GMConsultationStatusValue = "processing" | "completed" | "failed";

export interface GMConsultationStatusResponse {
  consultation_id: number;
  status: GMConsultationStatusValue;
  answer?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GMConsultationResponse extends GMConsultationStatusResponse {
  question: string;
}

// Stockfish Practice Mode (Finales)
export interface StockfishMoveRequest {
  fen: string;
  skill_level?: number;
  time_limit?: number;
}

export interface StockfishMoveResponse {
  move_uci: string;
  move_san: string;
  fen_after: string;
}
