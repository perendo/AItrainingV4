"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  BookOpen,
  Lightbulb,
  Target,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AuditGameAnalysisResponse, CriticalMoment } from "@/lib/types";

function EvalChip({ value }: { value: number }) {
  const abs = Math.abs(value);
  const tone = abs < 0.35 ? "neutral" : value > 0 ? "green" : "red";
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        tone === "green" && "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
        tone === "red" && "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
        tone === "neutral" && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
      )}
    >
      <Icon className="h-3 w-3" />
      {value >= 0 ? "+" : ""}
      {value.toFixed(2)}
    </span>
  );
}

function CriticalMomentItem({ moment }: { moment: CriticalMoment }) {
  return (
    <li className="rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">Ply {moment.ply}</span>
        <Badge variant="secondary" className="font-mono">
          {moment.san_move}
        </Badge>
        <EvalChip value={moment.eval_change} />
      </div>
      <p className="mt-1.5 text-muted-foreground">{moment.explanation}</p>
    </li>
  );
}

interface GuidedOpeningFeedbackProps {
  feedback: AuditGameAnalysisResponse;
}

/**
 * Informe del Gran Maestro de una Partida Guiada de Apertura: rechazo
 * (Capa A) y análisis general de la IA con momentos críticos (Capa B).
 * Se usa tanto en la página de estudio como en el detalle del histórico.
 */
export function GuidedOpeningFeedbackDisplay({ feedback }: GuidedOpeningFeedbackProps) {
  const { eco_code, opening_name, is_user_analysis_sufficient, tutor_feedback, general_ai_analysis } = feedback;

  return (
    <div className="space-y-4">
      {/* Veredicto */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-xl border p-4",
          is_user_analysis_sufficient
            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
            : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
        )}
      >
        {is_user_analysis_sufficient ? (
          <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
        ) : (
          <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
        )}
        <div className="flex-1">
          <p
            className={cn(
              "font-semibold",
              is_user_analysis_sufficient
                ? "text-green-800 dark:text-green-200"
                : "text-red-800 dark:text-red-200",
            )}
          >
            {is_user_analysis_sufficient
              ? "Autodiagnóstico suficiente"
              : "Autodiagnóstico insuficiente"}
          </p>
          <p className="text-sm text-muted-foreground">
            {is_user_analysis_sufficient
              ? "Tu lectura de la partida guiada estuvo en línea con la teoría."
              : "La corrección del tutor te muestra qué afirmaste y qué ocurre realmente."}
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <BookOpen className="h-3.5 w-3.5 text-primary" />
          {eco_code} – {opening_name}
        </Badge>
      </div>

      {/* Capa A: Tutor pedagógico */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Lightbulb className="h-4 w-4" />
            Capa A · Corrección del tutor
          </p>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Resumen de tu diagnóstico
            </p>
            <p className="mt-1 text-sm">{tutor_feedback.user_summary}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Error conceptual
            </p>
            <p className="mt-1 text-sm">{tutor_feedback.conceptual_error}</p>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              Regla de oro (repasa esta idea)
            </p>
            <p className="mt-1 text-sm font-medium">{tutor_feedback.takeaway_lesson}</p>
          </div>
        </CardContent>
      </Card>

      {/* Capa B: Análisis general de IA */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" />
            Capa B · Análisis general de la IA
          </p>
          <p className="text-sm">{general_ai_analysis.summary}</p>

          {general_ai_analysis.critical_moments.length > 0 && (
            <>
              <Separator />
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Target className="h-3.5 w-3.5" />
                Momentos críticos según Stockfish
              </p>
              <ul className="space-y-2">
                {general_ai_analysis.critical_moments.map((m, i) => (
                  <CriticalMomentItem key={i} moment={m} />
                ))}
              </ul>
            </>
          )}

          {general_ai_analysis.strategic_plans.length > 0 && (
            <>
              <Separator />
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" />
                Planes estratégicos que debes conocer
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {general_ai_analysis.strategic_plans.map((plan, i) => (
                  <li key={i}>{plan}</li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}