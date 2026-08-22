"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";

export interface AdaptivePollingOptions {
  /** Retardo del primer intento (ms). Por defecto 3000. */
  initialIntervalMs?: number;
  /** Retardo máximo entre reintentos (ms). Por defecto 15000. */
  maxIntervalMs?: number;
  /** Número máximo de reintentos antes de dar por agotado el tiempo. Por defecto 20. */
  maxAttempts?: number;
  /** Tiempo total límite de la espera (ms). Por defecto 150000 (2.5 min). */
  timeoutMs?: number;
}

export const DEFAULT_POLLING_OPTIONS: Required<AdaptivePollingOptions> = {
  initialIntervalMs: 3000,
  maxIntervalMs: 15000,
  maxAttempts: 20,
  timeoutMs: 150000,
};

// Secuencia de backoff: 3s, 5s, 8s, 12s y luego se fija en maxIntervalMs (15s).
const DELAY_SCHEDULE = [3000, 5000, 8000, 12000];

/** Calcula el retardo adaptativo (exponential-backoff-like) para un intento dado. */
export function computeAdaptiveDelay(
  attempt: number,
  maxIntervalMs: number = DEFAULT_POLLING_OPTIONS.maxIntervalMs,
): number {
  if (attempt < DELAY_SCHEDULE.length) return DELAY_SCHEDULE[attempt];
  return maxIntervalMs;
}

export interface UseAdaptivePollingArgs<T> {
  /** Función que consulta el estado de la tarea asíncrona. */
  fetchStatus: () => Promise<T>;
  /** Devuelve true cuando la tarea alcanzó un estado terminal (completed/failed). */
  isTerminal: (result: T) => boolean;
  /** Callback cuando la tarea termina (completed/failed). */
  onTerminal?: (result: T) => void;
  /** Callback cuando la sesión caduca (error 401 o token ausente). */
  onUnauthorized?: () => void;
  /** Callback cuando se agota el tiempo de espera (timeout / máximo de reintentos). */
  onTimeout?: () => void;
  options?: AdaptivePollingOptions;
}

export interface UseAdaptivePollingReturn {
  start: () => void;
  stop: () => void;
  isPolling: boolean;
}

/**
 * Hook reutilizable de polling adaptativo con backoff exponencial.
 *
 * - Inicia con un retardo corto y lo aumenta progresivamente (3s → 5s → 8s → 12s → 15s).
 * - Cancela el bucle de forma inmediata si la sesión caduca (error 401 o token ausente).
 * - Detiene el polling al alcanzar un estado terminal o agotar el tiempo límite.
 * - Limpia el temporizador de forma segura al desmontar el componente.
 */
export function useAdaptivePolling<T>({
  fetchStatus,
  isTerminal,
  onTerminal,
  onUnauthorized,
  onTimeout,
  options,
}: UseAdaptivePollingArgs<T>): UseAdaptivePollingReturn {
  const opts = { ...DEFAULT_POLLING_OPTIONS, ...options };

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const fetchRef = useRef(fetchStatus);
  fetchRef.current = fetchStatus;
  const isTerminalRef = useRef(isTerminal);
  isTerminalRef.current = isTerminal;
  const onTerminalRef = useRef(onTerminal);
  onTerminalRef.current = onTerminal;
  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const [isPolling, setIsPolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(true);
  const attemptRef = useRef(0);
  const startRef = useRef(0);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    clear();
    setIsPolling(false);
  }, [clear]);

  const tick = useCallback(() => {
    if (stoppedRef.current) return;

    // Guard de sesión: si no hay token válido, interrumpimos de inmediato.
    if (!getToken()) {
      stoppedRef.current = true;
      clear();
      setIsPolling(false);
      onUnauthorizedRef.current?.();
      return;
    }

    const o = optsRef.current;
    if (Date.now() - startRef.current > o.timeoutMs) {
      stoppedRef.current = true;
      clear();
      setIsPolling(false);
      onTimeoutRef.current?.();
      return;
    }

    fetchRef
      .current()
      .then((result) => {
        if (stoppedRef.current) return;
        if (isTerminalRef.current(result)) {
          stoppedRef.current = true;
          clear();
          setIsPolling(false);
          onTerminalRef.current?.(result);
          return;
        }
        attemptRef.current += 1;
        if (attemptRef.current >= o.maxAttempts) {
          stoppedRef.current = true;
          clear();
          setIsPolling(false);
          onTimeoutRef.current?.();
          return;
        }
        timerRef.current = setTimeout(
          tick,
          computeAdaptiveDelay(attemptRef.current, o.maxIntervalMs),
        );
      })
      .catch((err: unknown) => {
        if (stoppedRef.current) return;
        if (err instanceof ApiError && err.status === 401) {
          stoppedRef.current = true;
          clear();
          setIsPolling(false);
          onUnauthorizedRef.current?.();
          return;
        }
        attemptRef.current += 1;
        if (
          attemptRef.current >= o.maxAttempts ||
          Date.now() - startRef.current > o.timeoutMs
        ) {
          stoppedRef.current = true;
          clear();
          setIsPolling(false);
          onTimeoutRef.current?.();
          return;
        }
        timerRef.current = setTimeout(
          tick,
          computeAdaptiveDelay(attemptRef.current, o.maxIntervalMs),
        );
      });
  }, [clear]);

  const start = useCallback(() => {
    if (!stoppedRef.current) return; // Ya está en ejecución.
    stoppedRef.current = false;
    attemptRef.current = 0;
    startRef.current = Date.now();
    setIsPolling(true);
    tick();
  }, [tick]);

  // Limpieza al desmontar.
  useEffect(() => clear, [clear]);

  return { start, stop, isPolling };
}
