"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ChevronLeft, Crown, UserRound, FileDown, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getGameAnalysis, getGmGameById } from "@/lib/api";
import {
  UserGameAnalysisResponse,
  GeminiFeedback,
  GMGameResponse,
  gameAnalysisStatus,
  GameAnalysisStatus,
} from "@/lib/types";
import { ReplayBoard } from "@/components/analysis/ReplayBoard";
import { parsePgnHeaders } from "@/components/analysis/LichessReplay";
import {
  AnalysisFormPanel,
  GeminiFeedbackDisplay,
  AnalysisFormState,
} from "@/components/analysis/AnalysisFormPanel";
import { PrintAnalysisReport } from "@/components/analysis/PrintAnalysisReport";


function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getPgnHeaders(pgn: string | null): Record<string, string> {
  return parsePgnHeaders(pgn);
}

function getHeader(headers: Record<string, string>, key: string): string {
  const found = Object.keys(headers).find(
    (k) => k.toLowerCase() === key.toLowerCase()
  );
  return found ? headers[found] : "";
}

function StatusBadge({ status }: { status: GameAnalysisStatus }) {
  const config = {
    pending: {
      label: "Pendiente de Análisis",
      classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    },
    audit_failed: {
      label: "Pendiente de reenvío por error",
      classes:
        "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    },
    evaluated_correct: {
      label: "Evaluado Correcto",
      classes: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    },
    evaluated_incorrect: {
      label: "Evaluado Incorrecto",
      classes: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    },
  }[status];

  return (
    <Badge className={config.classes}>
      {status === "audit_failed" && <AlertTriangle className="mr-1 h-3 w-3" />}
      {config.label}
    </Badge>
  );
}

export default function HistoricoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const analysisId = Number(params.analysisId);

  const [analysis, setAnalysis] = useState<UserGameAnalysisResponse | null>(null);
  const [pgn, setPgn] = useState<string | null>(null);
  const [gmGame, setGmGame] = useState<GMGameResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<GeminiFeedback | null>(null);

  const handleFeedback = useCallback(
    (f: GeminiFeedback | null) => setFeedback(f),
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGameAnalysis(analysisId);
      setAnalysis(data);

      if (data.pgn) {
        setPgn(data.pgn);
        setGmGame(null);
      } else if (data.game_type === "GM" && data.game_id) {
        const gm = await getGmGameById(String(data.game_id));
        setGmGame(gm);
        setPgn(gm.pgn);
      } else {
        setPgn(null);
        setGmGame(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el análisis.");
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  useEffect(() => {
    if (!Number.isNaN(analysisId)) load();
  }, [analysisId, load]);

  const initialForm = useMemo<AnalysisFormState | null>(() => {
    if (!analysis) return null;
    const fases = parseJson<{ apertura: string; medio_juego: string; final: string }>(
      analysis.fases_analisis
    );
    const momentos = parseJson<{ pieza_a_mejorar: string; amenaza_rival: string }>(
      analysis.momentos_criticos
    );
    const factores = parseJson<{ material: string; seguridad_rey: string; espacio: string }>(
      analysis.factores_posicionales
    );
    const conclusiones = parseJson<{
      plan_estrategico: string;
      error_conceptual_grave: string;
      idea_a_repasar: string;
    }>(analysis.conclusiones_plan);

    if (!fases || !momentos || !factores || !conclusiones) return null;
    return { fases, momentos, factores, conclusiones };
  }, [analysis]);

  const initialFeedback = useMemo<GeminiFeedback | null>(
    () => (analysis ? parseJson<GeminiFeedback>(analysis.gemini_feedback) : null),
    [analysis]
  );

  const headers = useMemo(() => getPgnHeaders(pgn), [pgn]);

  const result = useMemo<string>(() => {
    if (gmGame?.result) return gmGame.result;
    const pgnResult = getHeader(headers, "Result");
    if (pgnResult && pgnResult !== "*") return pgnResult;
    return "Resultado no disponible";
  }, [gmGame, headers]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 print:hidden">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Cargando análisis...</p>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 print:hidden">
        <p className="text-destructive text-lg font-medium">
          {error || "Análisis no encontrado"}
        </p>
        <Button onClick={() => router.push("/historico")}>
          Volver al Histórico
        </Button>
      </div>
    );
  }

  const white = analysis.white_player || "Blancas";
  const black = analysis.black_player || "Negras";
  const status = gameAnalysisStatus(analysis);
  const alreadyEvaluatedCorrect = status === "evaluated_correct";
  const gameType = analysis.game_type === "GM" ? "GM" : "USER";
  const whiteElo = getHeader(headers, "WhiteElo") || undefined;
  const blackElo = getHeader(headers, "BlackElo") || undefined;
  const whiteTitle = getHeader(headers, "WhiteTitle") || undefined;
  const blackTitle = getHeader(headers, "BlackTitle") || undefined;

  return (
    <>
      <div className="space-y-6 print:hidden">
        <Button variant="ghost" onClick={() => router.push("/historico")} className="w-fit">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Volver al Histórico
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {white} vs {black}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {gmGame
                ? `${gmGame.event} · ${gmGame.year} · ${gmGame.result} · GM: ${gmGame.gm_name}`
                : `Analizado el ${new Date(analysis.created_at).toLocaleString("es-ES")}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => window.print()}
              className="gap-2"
            >
              <FileDown className="h-4 w-4" />
              Exportar a PDF
            </Button>
            <Badge variant="outline" className="gap-1 text-xs">
              {gameType === "GM" ? (
                <Crown className="h-3 w-3 text-primary" />
              ) : (
                <UserRound className="h-3 w-3 text-primary" />
              )}
              {gameType === "GM" ? "Partida de GM" : "Mi Partida / Liga"}
            </Badge>
            <StatusBadge status={status} />
          </div>
        </div>

        {status === "pending" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            Esta partida aún no se ha enviado al Gran Maestro. Completa el formulario de
            autodiagnóstico y pulsa &quot;Enviar a Evaluación del Gran Maestro&quot;.
          </div>
        )}

        {status === "audit_failed" && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-200">
            <p className="font-medium">La auditoría del Gran Maestro no se completó.</p>
            <p className="mt-1">
              {analysis.error_message ||
                "El Gran Maestro no pudo completar la auditoría: la IA no respondió tras varios intentos."}{" "}
              Tus respuestas están guardadas: revisa el formulario y vuelve a pulsar
              &quot;Enviar a Evaluación del Gran Maestro&quot; cuando quieras reintentarlo.
            </p>
          </div>
        )}

        {pgn ? (
          <div className="space-y-8">
            {/* Layout de 2 columnas igual que el análisis de partida de GM */}
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Columna izquierda: tablero (55%) */}
              <div className="w-full lg:w-[55%]">
                <ReplayBoard pgn={pgn} />
              </div>

              {/* Columna derecha: formulario de autodiagnóstico (45%) */}
              <div className="w-full lg:w-[45%]">
                <AnalysisFormPanel
                  gameType={gameType}
                  gmGameId={gameType === "GM" ? analysis.game_id : null}
                  pgn={pgn}
                  whitePlayer={white}
                  blackPlayer={black}
                  analysisId={analysis.id}
                  initialForm={initialForm}
                  initialFeedback={initialFeedback}
                  submitDisabled={alreadyEvaluatedCorrect}
                  onComplete={() => load()}
                  hideFeedback
                  onFeedbackChange={handleFeedback}
                />
              </div>
            </div>

            {/* Informe del GM: siempre al final, a todo ancho */}
            {feedback && (
              <div className="space-y-4">
                <Separator />
                <h2 className="text-xl font-semibold text-primary">
                  {analysis?.analysis_mode === "ai"
                    ? "Análisis del Gran Maestro (IA)"
                    : "Informe del Gran Maestro"}
                </h2>
                <GeminiFeedbackDisplay
                  feedback={feedback}
                  mode={analysis?.analysis_mode ?? null}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border bg-white p-10 text-center shadow-sm dark:bg-slate-900">
            <p className="text-muted-foreground">
              No hay un PGN disponible para esta partida.
            </p>
          </div>
        )}
      </div>

      <PrintAnalysisReport
        white={white}
        black={black}
        whiteTitle={whiteTitle}
        blackTitle={blackTitle}
        whiteElo={whiteElo}
        blackElo={blackElo}
        result={result}
        analysisDate={formatDate(analysis.created_at)}
        gameType={gameType}
        pgn={pgn}
        form={initialForm}
        feedback={initialFeedback}
        mode={analysis?.analysis_mode ?? null}
      />
    </>
  );
}
