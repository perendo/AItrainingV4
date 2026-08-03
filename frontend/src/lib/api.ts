import { getToken, removeToken } from "./auth";
import { 
  TrainingTask, 
  WeeklyPlanResponse, 
  PuzzleResponse,
  UserGameAnalysisSubmit,
  UserGameAnalysisResponse
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

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

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...rest,
    headers,
    body: requestBody,
  });

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
export const submitGameAnalysis = (data: UserGameAnalysisSubmit): Promise<UserGameAnalysisResponse> => {
  return apiFetch<UserGameAnalysisResponse>("/api/v1/game-analysis/submit", {
    method: "POST",
    body: data,
  });
};

export const getGameAnalysis = (analysisId: number): Promise<UserGameAnalysisResponse> => {
  return apiFetch<UserGameAnalysisResponse>(`/api/v1/game-analysis/${analysisId}`);
};

export const listGameAnalyses = (): Promise<UserGameAnalysisResponse[]> => {
  return apiFetch<UserGameAnalysisResponse[]>("/api/v1/game-analysis/");
};

// GM Games API
export const getGmGameById = (gameId: string): Promise<import("./types").GMGameResponse> => {
  return apiFetch<import("./types").GMGameResponse>(`/api/v1/gm-games/${gameId}`);
};