"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileText, ChevronRight, Crown, UserRound, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listGameAnalyses } from "@/lib/api";
import {
  UserGameAnalysisResponse,
  gameAnalysisStatus,
  GameAnalysisStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: GameAnalysisStatus }) {
  const config = {
    pending: {
      label: "Pendiente de Análisis",
      classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
      icon: Clock,
    },
    evaluated_correct: {
      label: "Evaluado Correcto",
      classes: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
      icon: null,
    },
    evaluated_incorrect: {
      label: "Evaluado Incorrecto",
      classes: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
      icon: null,
    },
  }[status];

  const Icon = config.icon;
  return (
    <Badge className={cn("gap-1 text-xs font-medium", config.classes)}>
      {Icon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}

export function AnalysisHistoryList() {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<UserGameAnalysisResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listGameAnalyses();
      setAnalyses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el historial.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Cargando historial...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-red-50 p-6 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-10 text-center shadow-sm dark:bg-slate-900">
        <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="font-medium">Aún no hay análisis registrados.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Analiza una partida de GM, pega un PGN propio o juega una partida 1v1 para
          empezar.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {analyses.map((analysis) => {
        const white = analysis.white_player || "Blancas";
        const black = analysis.black_player || "Negras";
        const status = gameAnalysisStatus(analysis);
        return (
          <button
            key={analysis.id}
            type="button"
            onClick={() => router.push(`/historico/${analysis.id}`)}
            className="text-left"
          >
            <Card className="transition-colors hover:border-primary/50 hover:bg-muted/30">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="font-medium">
                      {white}{" "}
                      <span className="text-muted-foreground">vs</span>{" "}
                      {black}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(analysis.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge
                    variant="outline"
                    className="gap-1 text-xs"
                  >
                    {analysis.game_type === "GM" ? (
                      <Crown className="h-3 w-3 text-primary" />
                    ) : (
                      <UserRound className="h-3 w-3 text-primary" />
                    )}
                    {analysis.game_type === "GM" ? "GM" : "PROPIA / LIGA"}
                  </Badge>
                  <StatusBadge status={status} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
