"use client";

import { useCallback, useRef, useState } from "react";
import {
  createGmConsultation,
  getGmConsultationStatus,
  ApiError,
} from "@/lib/api";
import { useAdaptivePolling } from "./useAdaptivePolling";
import type {
  GMConsultationStatusResponse,
  GMConsultationResponse,
} from "@/lib/types";

export interface UseGMConsultationReturn {
  /** Envía una duda al Gran Maestro y arranca el polling de la respuesta. */
  ask: (question: string) => Promise<number | null>;
  status: GMConsultationStatusResponse | null;
  isPolling: boolean;
  error: string | null;
}

/**
 * Encapsula el flujo asíncrono de consulta (duda) al Gran Maestro: envío (202)
 * + polling adaptativo del estado, hasta `completed`/`failed`.
 */
export function useGMConsultation(
  onTerminal?: (status: GMConsultationStatusResponse) => void,
  onTimeout?: () => void,
): UseGMConsultationReturn {
  const [status, setStatus] = useState<GMConsultationStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const consultationIdRef = useRef<number | null>(null);

  const polling = useAdaptivePolling<GMConsultationStatusResponse>({
    fetchStatus: () => {
      const id = consultationIdRef.current;
      if (id === null) return Promise.reject(new Error("No consultation id"));
      return getGmConsultationStatus(id);
    },
    isTerminal: (r) => r.status === "completed" || r.status === "failed",
    onTerminal: (r) => {
      setStatus(r);
      if (r.status === "failed") {
        setError(r.error_message ?? "La consulta al Gran Maestro falló.");
      }
      onTerminal?.(r);
    },
    onUnauthorized: () => setError("Sesión expirada. Vuelve a iniciar sesión."),
    onTimeout: () => {
      setError("Se agotó el tiempo de espera de la consulta.");
      onTimeout?.();
    },
  });

  const ask = useCallback(
    async (question: string): Promise<number | null> => {
      setError(null);
      try {
        const res = await createGmConsultation(question);
        consultationIdRef.current = res.consultation_id;
        setStatus({
          consultation_id: res.consultation_id,
          status: "processing",
          answer: null,
          error_message: null,
          created_at: "",
          updated_at: "",
        });
        polling.start();
        return res.consultation_id;
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Error al enviar la consulta.");
        return null;
      }
    },
    [polling],
  );

  return { ask, status, isPolling: polling.isPolling, error };
}

export type { GMConsultationResponse };
