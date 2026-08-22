"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "sonner";
import { useChessSounds } from "@/hooks/useChessSounds";
import {
  createGmConsultation,
  getGmConsultation,
  getGmConsultationStatus,
  getGameAnalysisStatus,
  listGmConsultations,
  ApiError,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { computeAdaptiveDelay } from "@/hooks/useAdaptivePolling";
import {
  GMConsultationResponse,
  GMConsultationStatusResponse,
} from "@/lib/types";

interface GMConsultationContextValue {
  consultations: GMConsultationResponse[];
  activeCount: number;
  sendConsultation: (question: string) => Promise<number | null>;
  refresh: () => Promise<void>;
  trackAnalysis: (analysisId: number, href: string) => void;
}

const GMConsultationContext = createContext<GMConsultationContextValue | null>(
  null,
);

const POLL_TIMEOUT_MS = 150000;
const POLL_MAX_ATTEMPTS = 20;

export function GMConsultationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [consultations, setConsultations] = useState<GMConsultationResponse[]>([]);
  const consultationsRef = useRef<Record<number, GMConsultationResponse>>({});
  const analysesRef = useRef<Record<number, { status: string; href?: string }>>({});
  const notifiedRef = useRef<Set<number>>(new Set());
  const { playNotifySound } = useChessSounds();
  const router = useRouter();

  const mergeConsultation = useCallback(
    (incoming: Partial<GMConsultationResponse> & { consultation_id: number }) => {
      setConsultations((prev) => {
        const idx = prev.findIndex(
          (x) => x.consultation_id === incoming.consultation_id,
        );
        if (idx === -1) {
          const full = incoming as GMConsultationResponse;
          consultationsRef.current[full.consultation_id] = full;
          return [full, ...prev];
        }
        const merged = { ...prev[idx], ...incoming };
        consultationsRef.current[merged.consultation_id] = merged;
        const copy = [...prev];
        copy[idx] = merged;
        return copy;
      });
    },
    [],
  );

  const sendConsultation = useCallback(
    async (question: string): Promise<number | null> => {
      const trimmed = question.trim();
      if (trimmed.length < 3) {
        toast.error("Escribe una duda más detallada para el Gran Maestro.");
        return null;
      }
      // Solicita permiso de notificación de escritorio una sola vez.
      try {
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "default"
        ) {
          Notification.requestPermission().catch(() => {});
        }
      } catch {
        // Ignorado: el navegador bloquea la API.
      }
      try {
        const res: GMConsultationStatusResponse = await createGmConsultation(
          trimmed,
        );
        mergeConsultation({
          consultation_id: res.consultation_id,
          status: res.status,
          created_at: res.created_at,
          updated_at: res.updated_at,
          question: trimmed,
          answer: null,
          error_message: null,
        });
        toast.info(
          "El GM está analizando tu duda. Puedes seguir utilizando la app.",
          {
            description: "Te avisaremos en cuanto el Gran Maestro responda.",
            duration: 5000,
          },
        );
        return res.consultation_id;
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo enviar la consulta.",
        );
        return null;
      }
    },
    [mergeConsultation],
  );

  // Polling adaptativo en segundo plano (backoff exponencial + guard de sesión).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let attempt = 0;
    let startedAt = 0;

    const tick = async () => {
      if (stopped) return;

      // Guard de sesión: sin token válido, interrumpimos el bucle de inmediato.
      if (!getToken()) {
        stopped = true;
        return;
      }

      const active = Object.values(consultationsRef.current).filter(
        (c) => c.status === "processing",
      );
      const activeAnalyses = Object.entries(analysesRef.current).filter(
        ([, a]) => a.status === "processing",
      );

      if (active.length === 0 && activeAnalyses.length === 0) {
        // Sin tareas activas: reiniciamos el backoff y seguimos vigilando.
        attempt = 0;
        startedAt = 0;
        timer = setTimeout(tick, computeAdaptiveDelay(0));
        return;
      }

      if (startedAt === 0) startedAt = Date.now();

      let completedSomething = false;

      try {
        await Promise.all(
          active.map(async (c) => {
            try {
              const status = await getGmConsultationStatus(c.consultation_id);
              if (status.status === "processing") {
                mergeConsultation(status);
                return;
              }
              const full = await getGmConsultation(c.consultation_id);
              completedSomething = true;
              mergeConsultation(full);

              if (!notifiedRef.current.has(c.consultation_id)) {
                notifiedRef.current.add(c.consultation_id);
                playNotifySound();

                if (status.status === "completed") {
                  toast.success(
                    "¡El Gran Maestro ha respondido a tu consulta!",
                    {
                      description: "Toca para abrir la respuesta.",
                      action: {
                        label: "Abrir",
                        onClick: () => router.push("/consulta-gm"),
                      },
                      duration: 10000,
                    },
                  );
                  try {
                    if (
                      typeof Notification !== "undefined" &&
                      Notification.permission === "granted"
                    ) {
                      new Notification(
                        "¡El Gran Maestro ha respondido a tu consulta!",
                      );
                    }
                  } catch {
                    // Ignorado.
                  }
                } else {
                  toast.error(
                    "La consulta al Gran Maestro falló. Inténtala de nuevo.",
                  );
                }
              }
            } catch (e) {
              if (e instanceof ApiError && e.status === 401) throw e;
              // Error de red puntual: se reintentará en el próximo ciclo.
            }
          }),
        );

        if (stopped) return;

        // 2. Auditorías de partidas enviadas al Gran Maestro (Evaluación del GM).
        await Promise.all(
          activeAnalyses.map(async ([idStr, meta]) => {
            const id = Number(idStr);
            try {
              const status = await getGameAnalysisStatus(id);
              if (status.status === "completed") {
                meta.status = "completed";
                completedSomething = true;
                if (!notifiedRef.current.has(id)) {
                  notifiedRef.current.add(id);
                  playNotifySound();
                  toast.success("¡El Gran Maestro ha evaluado tu partida!", {
                    description: "Toca para ver la auditoría.",
                    action: {
                      label: "Abrir",
                      onClick: () => router.push(meta.href || "/historico"),
                    },
                    duration: 10000,
                  });
                  try {
                    if (
                      typeof Notification !== "undefined" &&
                      Notification.permission === "granted"
                    ) {
                      new Notification(
                        "¡El Gran Maestro ha evaluado tu partida!",
                      );
                    }
                  } catch {
                    // Ignorado.
                  }
                }
              } else if (status.status === "failed") {
                meta.status = "failed";
                completedSomething = true;
                if (!notifiedRef.current.has(id)) {
                  notifiedRef.current.add(id);
                  toast.error("La evaluación del Gran Maestro falló.");
                }
              }
            } catch (e) {
              if (e instanceof ApiError && e.status === 401) throw e;
              // Reintentará en el próximo ciclo.
            }
          }),
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          // Sesión expirada: detenemos el bucle de inmediato.
          stopped = true;
          return;
        }
        // Otros errores: se reintenta en el siguiente ciclo.
      }

      if (stopped) return;

      if (completedSomething) {
        attempt = 0;
      } else {
        attempt += 1;
        if (attempt >= POLL_MAX_ATTEMPTS || Date.now() - startedAt > POLL_TIMEOUT_MS) {
          stopped = true;
          toast.error(
            "El Gran Maestro está tardando demasiado en responder.",
            {
              description:
                "Puedes recargar la página para reintentar manualmente.",
              duration: 10000,
            },
          );
          return;
        }
      }

      timer = setTimeout(tick, computeAdaptiveDelay(attempt));
    };

    timer = setTimeout(tick, computeAdaptiveDelay(0));

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [mergeConsultation, playNotifySound, router]);

  const refresh = useCallback(async () => {
    try {
      const list = await listGmConsultations();
      const map: Record<number, GMConsultationResponse> = {};
      list.forEach((c) => {
        map[c.consultation_id] = c;
      });
      consultationsRef.current = map;
      setConsultations(list);
    } catch {
      // Silencioso: el usuario puede reintentar manualmente.
    }
  }, []);

  // Registra una auditoría de partida enviada para monitorizarla de forma global.
  const trackAnalysis = useCallback((analysisId: number, href: string) => {
    analysesRef.current[analysisId] = { status: "processing", href };
  }, []);

  const activeCount =
    consultations.filter((c) => c.status === "processing").length +
    Object.values(analysesRef.current).filter((a) => a.status === "processing")
      .length;

  return (
    <GMConsultationContext.Provider
      value={{ consultations, activeCount, sendConsultation, refresh, trackAnalysis }}
    >
      {children}
      <Toaster richColors position="top-right" closeButton />
    </GMConsultationContext.Provider>
  );
}

export function useGMConsultation(): GMConsultationContextValue {
  const ctx = useContext(GMConsultationContext);
  if (!ctx) {
    throw new Error(
      "useGMConsultation debe usarse dentro de <GMConsultationProvider>.",
    );
  }
  return ctx;
}
