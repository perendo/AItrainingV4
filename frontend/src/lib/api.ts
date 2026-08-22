import { getToken, removeToken } from "./auth";
import { 
  TrainingTask, 
  WeeklyPlanResponse, 
  PuzzleResponse,
  UserGameAnalysisSubmit,
  UserGameAnalysisResponse,
  GameAnalysisSubmitResponse,
  GameAnalysisStatusResponse,
  GameResponse,
  GMConsultationStatusResponse,
  GMConsultationResponse,
} from "./types";

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  form?: Record<string, string>;
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, form, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let requestBody: BodyInit | undefined;

  if (body instanceof FormData) {
    requestBody = body;
  } else if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    requestBody = new URLSearchParams(form).toString();
  } else if (body) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      ...rest,
      headers,
      body: requestBody,
    });
  } catch (err) {
    // Fallo de red / backend apagado / CORS bloqueado: fetch lanza TypeError "Failed to fetch"
    throw new ApiError(
      0,
      "No se pudo conectar con el servidor Backend. Verifica que esté en ejecución.",
      err,
    );
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401) {
      removeToken();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    const message =
      (data as { detail?: string })?.detail || `Error ${res.status}`;
    throw new ApiError(res.status, message, data);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const getPendingTasks = (): Promise<TrainingTask[]> => {
    return apiFetch<TrainingTask[]>("/api/v1/training/pending-tasks");
};

export const generateWeeklyPlan = (): Promise<WeeklyPlanResponse> => {
    return apiFetch<WeeklyPlanResponse>("/api/v1/training/weekly/generate", {
        method: "POST",
    });
};

export const completeTrainingTask = (taskId: string): Promise<TrainingTask> => {
    return apiFetch<TrainingTask>(`/api/v1/training/tasks/${taskId}/complete`, {
        method: "POST",
    });
};

export const getNextPuzzle = (taskId: string): Promise<PuzzleResponse> => {
  return apiFetch<PuzzleResponse>(`/api/v1/training/tasks/${taskId}/next-puzzle`);
}

// Game Analysis API
export const submitGameAnalysis = (
  data: UserGameAnalysisSubmit,
): Promise<GameAnalysisSubmitResponse> => {
  return apiFetch<GameAnalysisSubmitResponse>("/api/v1/game-analysis/submit", {
    method: "POST",
    body: data,
  });
};

export const getGameAnalysisStatus = (
  analysisId: number,
): Promise<GameAnalysisStatusResponse> => {
  return apiFetch<GameAnalysisStatusResponse>(
    `/api/v1/game-analysis/${analysisId}/status`,
  );
};

export const saveAnalysisDraft = (data: import("./types").UserGameAnalysisDraft): Promise<UserGameAnalysisResponse> => {
  return apiFetch<UserGameAnalysisResponse>("/api/v1/game-analysis/save-draft", {
    method: "POST",
    body: data,
  });
};

export const getGameAnalysis = (analysisId: number): Promise<UserGameAnalysisResponse> => {
  return apiFetch<UserGameAnalysisResponse>(`/api/v1/game-analysis/${analysisId}`);
};

export const listGameAnalyses = (): Promise<UserGameAnalysisResponse[]> => {
  return apiFetch<UserGameAnalysisResponse[]>("/api/v1/game-analysis/history");
};

// GM Games API
export const getGmGameById = (gameId: string): Promise<import("./types").GMGameResponse> => {
  return apiFetch<import("./types").GMGameResponse>(`/api/v1/gm-games/${gameId}`);
};

export const searchGmGames = (
  gmName: string,
  theme?: string,
  limit = 5
): Promise<import("./types").GMGameResponse[]> => {
  const params = new URLSearchParams({ gm_name: gmName, limit: String(limit) });
  if (theme) params.set("theme", theme);
  return apiFetch<import("./types").GMGameResponse[]>(
    `/api/v1/gm-games/search?${params.toString()}`
  );
};


export const listMyGames = (): Promise<GameResponse[]> => {
  return apiFetch<GameResponse[]>("/api/v1/games/");
};

// GM Consultations (dudas asíncronas al Gran Maestro)
export const createGmConsultation = (
  question: string,
): Promise<GMConsultationStatusResponse> => {
  return apiFetch<GMConsultationStatusResponse>("/api/v1/gm-consultations/", {
    method: "POST",
    body: { question },
  });
};

export const getGmConsultationStatus = (
  consultationId: number,
): Promise<GMConsultationStatusResponse> => {
  return apiFetch<GMConsultationStatusResponse>(
    `/api/v1/gm-consultations/${consultationId}/status`,
  );
};

export const getGmConsultation = (
  consultationId: number,
): Promise<GMConsultationResponse> => {
  return apiFetch<GMConsultationResponse>(
    `/api/v1/gm-consultations/${consultationId}`,
  );
};

export const listGmConsultations = (): Promise<GMConsultationResponse[]> => {
  return apiFetch<GMConsultationResponse[]>("/api/v1/gm-consultations/");
};

export const getCurrentUser = (): Promise<import("./types").UserResponse> => {
  return apiFetch<import("./types").UserResponse>("/api/v1/users/me");
};

export const updateUserProfile = (
  data: import("./types").UserUpdate
): Promise<import("./types").UserResponse> => {
  return apiFetch<import("./types").UserResponse>("/api/v1/users/me", {
    method: "PUT",
    body: data,
  });
};

// Módulo de Finales Teóricos (Academia de Finales)
export const getEndgameLessons = (
  category?: string,
): Promise<Record<string, import("./types").EndgameLessonListItem[]>> => {
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  return apiFetch<Record<string, import("./types").EndgameLessonListItem[]>>(
    `/api/v1/endgames/lessons${qs}`,
  );
};

export const getEndgameLesson = (
  slug: string,
): Promise<import("./types").EndgameLessonDetail> => {
  return apiFetch<import("./types").EndgameLessonDetail>(
    `/api/v1/endgames/lessons/${slug}`,
  );
};

export const updateEndgameProgress = (
  slug: string,
  status: import("./types").LessonStatus,
  last_listened_second: number,
): Promise<import("./types").EndgameProgressResponse> => {
  return apiFetch<import("./types").EndgameProgressResponse>(
    `/api/v1/endgames/lessons/${slug}/progress`,
    {
      method: "POST",
      body: { status, last_listened_second },
    },
  );
};

// Stockfish Practice Mode (Finales)
export const getStockfishMove = (
  fen: string,
  skillLevel: number = 8,
  timeLimit: number = 0.5,
): Promise<import("./types").StockfishMoveResponse> => {
  return apiFetch<import("./types").StockfishMoveResponse>(
    "/api/v1/endgames/stockfish-move",
    {
      method: "POST",
      body: {
        fen,
        skill_level: skillLevel,
        time_limit: timeLimit,
      },
    },
  );
};