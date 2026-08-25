"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Save,
  Trash2,
  BookOpen,
  HelpCircle,
  Layers,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getGameAnalysis } from "@/lib/api";
import { useGMConsultation } from "@/context/GMConsultationContext";
import { useChessAnalysis } from "@/hooks/useChessAnalysis";
import { useChessSounds } from "@/hooks/useChessSounds";
import { toast } from "sonner";
import {
  UserGameAnalysisResponse,
  UserGameAnalysisSubmit,
  GeminiFeedback,
  FasesAnalisis,
  MomentosCriticos,
  FactoresPosicionales,
  ConclusionesPlan,
} from "@/lib/types";

const DRAFT_KEY_PREFIX = "analysis_draft_";

export interface AnalysisFormState {
  fases: FasesAnalisis;
  momentos: MomentosCriticos;
  factores: FactoresPosicionales;
  conclusiones: ConclusionesPlan;
}

interface DraftData extends AnalysisFormState {
  savedAt: string;
}

interface AnalysisFormPanelProps {
  gameType: "GM" | "USER";
  gmGameId?: string | number | null;
  pgn?: string;
  whitePlayer?: string;
  blackPlayer?: string;
  analysisId?: number | null;
  initialForm?: AnalysisFormState | null;
  initialFeedback?: GeminiFeedback | null;
  submitDisabled?: boolean;
  onComplete?: () => void;
  /** Si true, el informe del GM NO se renderiza aquí (lo renderiza el padre al final). */
  hideFeedback?: boolean;
  /** Notifica al padre el feedback activo para que lo renderice donde corresponda. */
  onFeedbackChange?: (feedback: GeminiFeedback | null) => void;
  /** Tour: fuerza un bloque concreto abierto (ignora el toggle interno). */
  openBlock?: string | null;
  /** Tour: valores de ejemplo mostrados en los textareas (solo lectura). */
  controlledValues?: AnalysisFormState | null;
  /** Tour: desactiva el envío real y usa onDemoSubmit. */
  demoMode?: boolean;
  onDemoSubmit?: () => void;
}

const EMPTY_FORM: AnalysisFormState = {
  fases: { apertura: "", medio_juego: "", final: "" },
  momentos: { pieza_a_mejorar: "", amenaza_rival: "" },
  factores: { material: "", seguridad_rey: "", espacio: "" },
  conclusiones: {
    plan_estrategico: "",
    error_conceptual_grave: "",
    idea_a_repasar: "",
  },
};

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function AnalysisFormPanel({
  gameType,
  gmGameId,
  pgn,
  whitePlayer,
  blackPlayer,
  analysisId,
  initialForm,
  initialFeedback,
  submitDisabled,
  onComplete,
  hideFeedback,
  onFeedbackChange,
  openBlock,
  controlledValues,
  demoMode,
  onDemoSubmit,
}: AnalysisFormPanelProps) {
  const { trackAnalysis } = useGMConsultation();
  const [form, setForm] = useState<AnalysisFormState>(() => ({
    ...EMPTY_FORM,
    ...(initialForm ?? {}),
  }));
  const [status, setStatus] = useState<
    "idle" | "loading" | "processing" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] =
    useState<UserGameAnalysisResponse | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({});

  // Feedback activo: tras el polling tiene prioridad el recién evaluado.
  const activeFeedback = useMemo<GeminiFeedback | null>(() => {
    if (analysisResult?.gemini_feedback) {
      try {
        return JSON.parse(analysisResult.gemini_feedback) as GeminiFeedback;
      } catch {
        return null;
      }
    }
    return initialFeedback ?? null;
  }, [analysisResult, initialFeedback]);

  // Emitimos el feedback al padre para que lo renderice al final de la página.
  const onFeedbackChangeRef = useRef(onFeedbackChange);
  useEffect(() => {
    onFeedbackChangeRef.current = onFeedbackChange;
  });
  useEffect(() => {
    onFeedbackChangeRef.current?.(activeFeedback);
  }, [activeFeedback]);

  const draftKey = useMemo(() => {
    if (analysisId) return `${DRAFT_KEY_PREFIX}${analysisId}`;
    if (gameType === "GM" && gmGameId) return `${DRAFT_KEY_PREFIX}gm_${gmGameId}`;
    return `${DRAFT_KEY_PREFIX}user_${hashCode(pgn ?? "")}`;
  }, [analysisId, gameType, gmGameId, pgn]);

  // En modo tour, el bloque abierto lo controla el padre.
  const openState = openBlock != null ? { [openBlock]: true } : openBlocks;

  const toggleBlock = (key: string) => {
    if (openBlock != null) return;
    setOpenBlocks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // En modo tour, los textareas muestran los valores de ejemplo (solo lectura).
  const values = controlledValues ?? form;
  const readOnly = controlledValues != null;

  // Pre-fill the form when an existing analysis (histórico) is loaded.
  useEffect(() => {
    if (initialForm) {
      setForm({
        fases: initialForm.fases,
        momentos: initialForm.momentos,
        factores: initialForm.factores,
        conclusiones: initialForm.conclusiones,
      });
    }
  }, [initialForm]);

  // Load draft on mount (only for pending/new analysis without server form data).
  useEffect(() => {
    if (initialForm) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft: DraftData = JSON.parse(raw);
        setForm({
          fases: draft.fases,
          momentos: draft.momentos,
          factores: draft.factores,
          conclusiones: draft.conclusiones,
        });
        setDraftSavedAt(draft.savedAt);
      }
    } catch {
      // ignore corrupted draft
    }
  }, [draftKey, initialForm]);

  const handleSaveDraft = useCallback(() => {
    const draft: DraftData = { ...form, savedAt: new Date().toISOString() };
    localStorage.setItem(draftKey, JSON.stringify(draft));
    setDraftSavedAt(draft.savedAt);
  }, [form, draftKey]);

  const handleClearDraft = useCallback(() => {
    localStorage.removeItem(draftKey);
    setDraftSavedAt(null);
  }, [draftKey]);

  const { playNotifySound, playErrorSound } = useChessSounds();
  const analysisIdRef = useRef<number | null>(null);
  const { submit: submitAnalysis, isPolling } = useChessAnalysis(
    async (resp) => {
      if (resp.status === "completed" && analysisIdRef.current != null) {
        try {
          const full = await getGameAnalysis(analysisIdRef.current);
          setAnalysisResult(full);
          setStatus("success");
          playNotifySound();
          toast.success("Auditoría del Gran Maestro completada.");
        } catch {
          setError("No se pudo obtener la auditoría completa de la partida.");
          setStatus("error");
        }
      } else if (resp.status === "failed") {
        setError(
          resp.error_message ||
            "La evaluación del Gran Maestro falló. Inténtalo de nuevo.",
        );
        setStatus("error");
        playErrorSound();
        toast.error(
          resp.error_message ||
            "La evaluación del Gran Maestro falló. Inténtalo de nuevo.",
        );
      }
    },
    () => {
      setError(
        "La evaluación está tardando más de lo esperado. Recarga la página para reintentar.",
      );
      setStatus("error");
      playErrorSound();
      toast.error(
        "La evaluación está tardando más de lo esperado. Recarga la página para reintentar.",
      );
    },
  );

  const handleSubmit = async () => {
    setStatus("loading");
    setError(null);

    try {
      const submitData: UserGameAnalysisSubmit = {
        gm_game_id: gameType === "GM" ? gmGameId : null,
        game_type: gameType,
        white_player: whitePlayer,
        black_player: blackPlayer,
        pgn: gameType === "USER" ? pgn : undefined,
        analysis_id: analysisId ?? undefined,
        fases_analisis: form.fases,
        momentos_criticos: form.momentos,
        factores_posicionales: form.factores,
        conclusiones_plan: form.conclusiones,
      };

      // Envío asíncrono (HTTP 202) + polling adaptativo vía useChessAnalysis.
      const submittedId = await submitAnalysis(submitData);
      if (submittedId == null) {
        setError("Error al enviar análisis");
        setStatus("error");
        return;
      }
      analysisIdRef.current = submittedId;
      handleClearDraft();
      onComplete?.();

      // Notificación flotante inmediata + seguimiento global (badge y polling).
      toast.info(
        "El GM está analizando tu duda. Puedes seguir utilizando la app.",
        { duration: 5000 },
      );
      trackAnalysis(submittedId, `/historico/${submittedId}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error al enviar análisis";
      setError(message);
      setStatus("error");
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Formulario de Autodiagnóstico</h2>

      {/* Bloque 1: Fases */}
      <Card>
        <button
          type="button"
          data-tour="block-1"
          onClick={() => toggleBlock("fases")}
          className="flex w-full items-center justify-between p-4 text-left cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Bloque 1 — Fases</span>
            {!openState["fases"] && (
              <span className="text-xs text-muted-foreground ml-1">
                (Apertura · Medio Juego · Final)
              </span>
            )}
          </div>
          {openState["fases"] ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        {openState["fases"] && (
          <CardContent className="pt-0 pb-4 px-4 space-y-4 border-t">
            <div>
              <Label htmlFor="apertura" className="block text-sm font-medium mb-1">
                Apertura
              </Label>
              <Textarea
                id="apertura"
                value={values.fases.apertura} readOnly={readOnly}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    fases: { ...prev.fases, apertura: e.target.value },
                  }))
                }
                placeholder="Analiza la apertura: ideas principales, variantes, evaluación..."
                rows={3}
                className="min-h-[80px]"
              />
            </div>
            <div>
              <Label htmlFor="medio_juego" className="block text-sm font-medium mb-1">
                Medio Juego
              </Label>
              <Textarea
                id="medio_juego"
                value={values.fases.medio_juego} readOnly={readOnly}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    fases: { ...prev.fases, medio_juego: e.target.value },
                  }))
                }
                placeholder="Planes, rupturas, maniobras, debilidades explotadas..."
                rows={3}
                className="min-h-[80px]"
              />
            </div>
            <div>
              <Label htmlFor="final" className="block text-sm font-medium mb-1">
                Final
              </Label>
              <Textarea
                id="final"
                value={values.fases.final} readOnly={readOnly}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    fases: { ...prev.fases, final: e.target.value },
                  }))
                }
                placeholder="Técnica de final, conversión de ventajas, conceptos clave..."
                rows={3}
                className="min-h-[80px]"
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Bloque 2: Preguntas Críticas */}
      <Card>
        <button
          type="button"
          data-tour="block-2"
          onClick={() => toggleBlock("criticas")}
          className="flex w-full items-center justify-between p-4 text-left cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Bloque 2 — Preguntas Críticas</span>
            {!openState["criticas"] && (
              <span className="text-xs text-muted-foreground ml-1">
                (Pieza · Amenaza)
              </span>
            )}
          </div>
          {openState["criticas"] ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        {openState["criticas"] && (
          <CardContent className="pt-0 pb-4 px-4 space-y-4 border-t">
            <div>
              <Label htmlFor="pieza_a_mejorar" className="block text-sm font-medium mb-1">
                ¿Qué pieza pude haber mejorado?
              </Label>
              <Textarea
                id="pieza_a_mejorar"
                value={values.momentos.pieza_a_mejorar} readOnly={readOnly}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    momentos: { ...prev.momentos, pieza_a_mejorar: e.target.value },
                  }))
                }
                placeholder="¿Qué pieza está peor situada? ¿Por qué? ¿Cómo mejorarla?"
                rows={3}
                className="min-h-[80px]"
              />
            </div>
            <div>
              <Label htmlFor="amenaza_rival" className="block text-sm font-medium mb-1">
                ¿Cuál era la amenaza real del rival?
              </Label>
              <Textarea
                id="amenaza_rival"
                value={values.momentos.amenaza_rival} readOnly={readOnly}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    momentos: { ...prev.momentos, amenaza_rival: e.target.value },
                  }))
                }
                placeholder="¿Cuál es la amenaza real del oponente en el momento crítico?"
                rows={3}
                className="min-h-[80px]"
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Bloque 3: Factores Posicionales */}
      <Card>
        <button
          type="button"
          data-tour="block-3"
          onClick={() => toggleBlock("posicionales")}
          className="flex w-full items-center justify-between p-4 text-left cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg"
        >
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Bloque 3 — Factores Posicionales</span>
            {!openState["posicionales"] && (
              <span className="text-xs text-muted-foreground ml-1">
                (Material · Rey · Espacio)
              </span>
            )}
          </div>
          {openState["posicionales"] ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        {openState["posicionales"] && (
          <CardContent className="pt-0 pb-4 px-4 space-y-4 border-t">
            <div>
              <Label htmlFor="material" className="block text-sm font-medium mb-1">
                Material
              </Label>
              <Textarea
                id="material"
                value={values.factores.material} readOnly={readOnly}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    factores: { ...prev.factores, material: e.target.value },
                  }))
                }
                placeholder="Balance material, calidad de piezas, peones débiles/fuertes..."
                rows={3}
                className="min-h-[80px]"
              />
            </div>
            <div>
              <Label htmlFor="seguridad_rey" className="block text-sm font-medium mb-1">
                Seguridad del Rey
              </Label>
              <Textarea
                id="seguridad_rey"
                value={values.factores.seguridad_rey} readOnly={readOnly}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    factores: { ...prev.factores, seguridad_rey: e.target.value },
                  }))
                }
                placeholder="Enroque, debilidades en la cobertura, ataques directos..."
                rows={3}
                className="min-h-[80px]"
              />
            </div>
            <div>
              <Label htmlFor="espacio" className="block text-sm font-medium mb-1">
                Espacio
              </Label>
              <Textarea
                id="espacio"
                value={values.factores.espacio} readOnly={readOnly}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    factores: { ...prev.factores, espacio: e.target.value },
                  }))
                }
                placeholder="Control del centro, expansión, casillas débiles, peones pasados..."
                rows={3}
                className="min-h-[80px]"
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Bloque 4: Conclusiones */}
      <Card>
        <button
          type="button"
          data-tour="block-4"
          onClick={() => toggleBlock("conclusiones")}
          className="flex w-full items-center justify-between p-4 text-left cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg"
        >
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Bloque 4 — Conclusiones</span>
            {!openState["conclusiones"] && (
              <span className="text-xs text-muted-foreground ml-1">
                (Plan · Error · Idea)
              </span>
            )}
          </div>
          {openState["conclusiones"] ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        {openState["conclusiones"] && (
          <CardContent className="pt-0 pb-4 px-4 space-y-4 border-t">
            <div>
              <Label htmlFor="conclusiones" className="block text-sm font-medium mb-1">
                Conclusiones
              </Label>
              <Textarea
                id="conclusiones"
                value={values.conclusiones.plan_estrategico} readOnly={readOnly}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    conclusiones: { ...prev.conclusiones, plan_estrategico: e.target.value },
                  }))
                }
                placeholder="Escribe aquí todas tus conclusiones: plan estratégico, error conceptual grave e idea a repasar..."
                rows={8}
                className="min-h-[200px]"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Incluye el plan, el error conceptual que cometiste y la idea concreta a repasar.
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Action Buttons */}
      {!demoMode && (
      <div className="flex flex-col sm:flex-row gap-3 print:hidden">
        <Button
          onClick={handleSaveDraft}
          variant="outline"
          className="flex-1 py-3"
          size="lg"
          disabled={status === "loading"}
        >
          <Save className="mr-2 h-4 w-4" />
          Guardar Borrador
        </Button>
        {draftSavedAt && (
          <Button
            onClick={handleClearDraft}
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            disabled={status === "loading"}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      )}

      {!demoMode && draftSavedAt && (
        <Badge variant="secondary" className="text-xs w-fit">
          <Save className="mr-1 h-3 w-3" />
          Borrador guardado{" "}
          {new Date(draftSavedAt).toLocaleTimeString("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Badge>
      )}

      <Button
        onClick={() => {
          if (demoMode) {
            onDemoSubmit?.();
            return;
          }
          handleSubmit();
        }}
        data-tour="submit"
        disabled={status === "loading" || isPolling || submitDisabled}
        title={
          submitDisabled
            ? "Este análisis ya ha sido evaluado correctamente"
            : undefined
        }
        className="w-full py-3 text-lg font-semibold bg-primary hover:bg-primary/90 print:hidden"
        size="lg"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Enviando al Gran Maestro...
          </>
        ) : isPolling ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            El GM está analizando tu duda...
          </>
        ) : (
          "Enviar a Evaluación del Gran Maestro"
        )}
      </Button>

      {submitDisabled && (
        <div className="p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 text-sm text-green-700 dark:text-green-300 flex items-center gap-2 print:hidden">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Este análisis ya ha sido evaluado correctamente por el Gran Maestro. El envío
          está deshabilitado.
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          <p className="font-medium">Error:</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Results / Auditoría de Gemini */}
      {!hideFeedback && activeFeedback && (
        <div className="space-y-4">
          <Separator />
          <h2 className="text-xl font-semibold text-primary">
            Auditoría del Gran Maestro
          </h2>
          <GeminiFeedbackDisplay feedback={activeFeedback} />
        </div>
      )}
    </div>
  );
}

// Separate component for the feedback display
export function GeminiFeedbackDisplay({ feedback }: { feedback: GeminiFeedback }) {
  const {
    feedback_fases,
    respuestas_preguntas_criticas,
    matriz_posicional,
    auditoria_conclusiones,
  } = feedback;

  return (
    <div className="space-y-4">
      {/* Plan Badge */}
      <div
        className={cn(
          "p-4 rounded-lg border text-center font-medium",
          auditoria_conclusiones.plan_correcto
            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
            : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
        )}
      >
        <div className="flex items-center justify-center gap-2">
          {auditoria_conclusiones.plan_correcto ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
          <span className="text-lg">
            {auditoria_conclusiones.plan_correcto
              ? "Plan Estratégico CORRECTO"
              : "Plan Estratégico INCORRECTO"}
          </span>
        </div>
      </div>

      {/* Feedback por Fases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            Feedback por Fases
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Apertura</p>
            <p className="text-sm mt-1">{feedback_fases.apertura}</p>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Medio Juego</p>
            <p className="text-sm mt-1">{feedback_fases.medio_juego}</p>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Final</p>
            <p className="text-sm mt-1">{feedback_fases.final}</p>
          </div>
        </CardContent>
      </Card>

      {/* Preguntas Críticas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Corrección Preguntas Críticas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Pieza a Mejorar</p>
            <p className="text-sm mt-1">
              {respuestas_preguntas_criticas.mejora_piezas}
            </p>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Amenaza Real del Rival</p>
            <p className="text-sm mt-1">
              {respuestas_preguntas_criticas.amenaza_real}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Matriz Posicional */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            Matriz Posicional
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Material</p>
            <p className="text-sm mt-1">{matriz_posicional.material}</p>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Seguridad Rey</p>
            <p className="text-sm mt-1">{matriz_posicional.rey}</p>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Espacio</p>
            <p className="text-sm mt-1">{matriz_posicional.espacio}</p>
          </div>
        </CardContent>
      </Card>

      {/* Auditoría Conclusiones */}
      <Card className="border-amber-200 dark:border-amber-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-4 w-4" />
            Auditoría de Conclusiones
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
            <p className="font-medium text-sm">Evaluación del Error</p>
            <p className="text-sm mt-1">
              {auditoria_conclusiones.evaluacion_error}
            </p>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
            <p className="font-medium text-sm">Concepto a Reforzar</p>
            <p className="text-sm mt-1">
              {auditoria_conclusiones.concepto_reforzar}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
