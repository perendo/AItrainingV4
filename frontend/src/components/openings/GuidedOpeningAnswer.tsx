"use client";

import ReactMarkdown from "react-markdown";
import { BookOpen, Loader2, RotateCcw, Send, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type GuidedConsultationStatus =
  | "idle"
  | "processing"
  | "completed"
  | "failed";

export interface GuidedOpeningAnswerProps {
  /** Jugada (SAN) que sacó de la teoría (null si se terminó a mano). */
  deviationMove?: string | null;
  /** Estado de la consulta automática al Gran Maestro. */
  consultationStatus: GuidedConsultationStatus;
  /** Respuesta del Gran Maestro sobre el propósito de la jugada. */
  consultationAnswer?: string | null;
  onRetryConsultation?: () => void;
  /** Contestación del usuario (un único bloque de texto). */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  submitting?: boolean;
  onSubmit: () => void;
}

export function GuidedOpeningAnswer({
  deviationMove,
  consultationStatus,
  consultationAnswer,
  onRetryConsultation,
  value,
  onChange,
  disabled = false,
  submitting = false,
  onSubmit,
}: GuidedOpeningAnswerProps) {
  const jugadaLabel = deviationMove ?? "tu última jugada";
  const preguntaTitulo = deviationMove
    ? `¿Qué se pretende con ${deviationMove}?`
    : "¿Cuál era la idea de tu última jugada?";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Has salido del libro de aperturas. El Gran Maestro te explica qué se pretendía con{" "}
        {jugadaLabel} en esta posición y, a continuación, escribes{" "}
        <strong>tu propia contestación</strong> en un único bloque de texto para que la audite y
        te corrija los momentos críticos.
      </p>

      {/* Consulta automática al Gran Maestro */}
      <div className="rounded-lg border bg-muted/30 p-4">
        {consultationStatus === "idle" && (
          <div className="text-sm text-muted-foreground">
            <p>¿Quieres preguntar al Gran Maestro qué se pretende con {jugadaLabel}?</p>
            {onRetryConsultation && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 gap-2"
                onClick={onRetryConsultation}
              >
                <Sparkles className="h-4 w-4" />
                Consultar al Gran Maestro
              </Button>
            )}
          </div>
        )}

        {consultationStatus === "processing" && (
          <div className="flex items-start gap-3">
            <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">
                El Gran Maestro está analizando la posición…
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                En un momento te explicará qué se pretende con {jugadaLabel} en esta posición. Tu
                contestación se puede escribir mientras tanto.
              </p>
            </div>
          </div>
        )}

        {consultationStatus === "completed" && (
          <div>
            <p className="flex items-center gap-2 pb-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4 text-primary" />
              {preguntaTitulo}
            </p>
            <div className="report-markdown max-h-72 space-y-2 overflow-y-auto pr-1 text-sm">
              {consultationAnswer ? (
                <ReactMarkdown>{consultationAnswer}</ReactMarkdown>
              ) : (
                <p className="text-muted-foreground">_(sin respuesta)_</p>
              )}
            </div>
          </div>
        )}

        {consultationStatus === "failed" && (
          <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p>El Gran Maestro no pudo responder la consulta automática.</p>
              {onRetryConsultation && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 gap-2"
                  onClick={onRetryConsultation}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reintentar consulta
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Contestación del usuario (un solo bloque de texto) */}
      <div className="space-y-2">
        <Label htmlFor="ga_contestacion" className="mb-1 block text-sm font-medium">
          Tu contestación
        </Label>
        <Textarea
          id="ga_contestacion"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`¿Qué pretendías conseguir con ${jugadaLabel}? Escribe tu idea en un único bloque de texto.`}
          rows={4}
          className="min-h-[110px]"
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Un único bloque de texto: explica qué buscabas con la jugada para que el Gran Maestro
          audite tu razonamiento y te señale los momentos críticos reales.
        </p>
        <Button
          size="lg"
          className="w-full gap-2"
          disabled={disabled || submitting}
          onClick={onSubmit}
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Auditando tu contestación…
            </>
          ) : (
            <>
              <Send className="h-5 w-5" />
              Enviar mi contestación al Gran Maestro
            </>
          )}
        </Button>
      </div>
    </div>
  );
}