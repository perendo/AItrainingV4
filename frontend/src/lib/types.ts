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
  gm_game_id: number;
  fases_analisis: FasesAnalisis;
  momentos_criticos: MomentosCriticos;
  factores_posicionales: FactoresPosicionales;
  conclusiones_plan: ConclusionesPlan;
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
  game_id: number | null;
  game_type: string;
  fases_analisis: string;
  momentos_criticos: string;
  factores_posicionales: string;
  conclusiones_plan: string;
  gemini_feedback: string | null;
  created_at: string;
}
