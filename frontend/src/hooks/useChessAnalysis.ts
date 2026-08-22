"use client";

import { useCallback, useRef, useState } from "react";
import {
  submitGameAnalysis,
  getGameAnalysisStatus,
  ApiError,
} from "@/lib/api";
import { useAdaptivePolling } from "./useAdaptivePolling";
import type {
  UserGameAnalysisSubmit,
  GameAnalysisStatusResponse,
  GameAnalysisSubmitResponse,
} from "@/lib/types";

export interface UseChessAnalysisReturn {
  /** Envía el autodiagnóstico y arranca el polling del estado de la auditoría. */
  submit: (data: UserGameAnalysisSubmit) => Promise<number | null>;
  status: GameAnalysisStatusResponse | null;
  isPolling: boolean;
  error: string | null;
}

/**
 * Encapsula el flujo asíncrono de autodiagnóstico: envío (202) + polling
 * adaptativo del estado de la auditoría del Gran Maestro, hasta `completed`/`failed`.
 */
export function useChessAnalysis(
  onTerminal?: (status: GameAnalysisStatusResponse) => void,
  onTimeout?: () => void,
): UseChessAnalysisReturn {
  const [status, setStatus] = useState<GameAnalysisStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analysisIdRef = useRef<number | null>(null);

  const polling = useAdaptivePolling<GameAnalysisStatusResponse>({
    fetchStatus: () => {
      const id = analysisIdRef.current;
      if (id === null) return Promise.reject(new Error("No analysis id"));
      return getGameAnalysisStatus(id);
    },
    isTerminal: (r) => r.status === "completed" || r.status === "failed",
    onTerminal: (r) => {
      setStatus(r);
      if (r.status === "failed") {
        setError(r.error_message ?? "La auditoría del Gran Maestro falló.");
      }
      onTerminal?.(r);
    },
    onUnauthorized: () => setError("Sesión expirada. Vuelve a iniciar sesión."),
    onTimeout: () => {
      setError("Se agotó el tiempo de espera de la auditoría.");
      onTimeout?.();
    },
  });

  const submit = useCallback(
    async (data: UserGameAnalysisSubmit): Promise<number | null> => {
      setError(null);
      // Los errores de envío se propagan para que el componente los gestione.
      const res: GameAnalysisSubmitResponse = await submitGameAnalysis(data);
      analysisIdRef.current = res.analysis_id;
      setStatus({
        analysis_id: res.analysis_id,
        status: "processing",
        has_feedback: false,
      });
      polling.start();
      return res.analysis_id;
    },
    [polling],
  );

  return { submit, status, isPolling: polling.isPolling, error };
}
