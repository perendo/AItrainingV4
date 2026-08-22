"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Loader2,
  UploadCloud,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiFetch, ApiError } from "@/lib/api";
import {
  fetchLichessGames,
  analyzeLichessGame,
  combinePgnStream,
  LichessGamePreview,
  LichessResult,
} from "@/lib/lichess";
import type { TaskResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 2500;

function ResultBadge({ result }: { result: LichessResult }) {
  const classes: Record<LichessResult, string> = {
    Victoria:
      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    Derrota: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    Tablas:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    "Sin terminar":
      "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <Badge className={cn("gap-1 text-xs font-medium", classes[result])}>
      {result}
    </Badge>
  );
}

export function LichessImport() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [games, setGames] = useState<LichessGamePreview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [task, setTask] = useState<TaskResponse | null>(null);
  const taskRef = useRef<TaskResponse | null>(null);
  taskRef.current = task;

  const resetResults = () => {
    setGames(null);
    setTask(null);
  };

  const handleImport = async () => {
    const name = username.trim();
    if (!name) {
      setError("Introduce el nombre de usuario de Lichess.");
      return;
    }
    setLoading(true);
    setError(null);
    resetResults();
    try {
      const list = await fetchLichessGames(name);
      if (list.length === 0) {
        setError(
          `El usuario "${name}" no tiene partidas públicas recientes para importar.`
        );
        return;
      }
      setGames(list);
      // Descarga + guardado en BD + análisis del Entrenador IA en segundo plano.
      const combined = combinePgnStream(list);
      const created = await analyzeLichessGame(name, combined);
      setTask(created);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al importar de Lichess."
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchTaskStatus = useCallback(async (taskId: number) => {
    try {
      const updated = await apiFetch<TaskResponse>(
        `/api/v1/games/tasks/${taskId}`
      );
      setTask(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setTask((prev) => (prev ? { ...prev, status: "failed" } : prev));
      }
    }
  }, []);

  // Polling del análisis en segundo plano (backend responde 202 + task_id).
  useEffect(() => {
    const current = taskRef.current;
    if (!current?.id) return;
    if (
      current.status === "completed" ||
      current.status === "failed"
    )
      return;

    const interval = setInterval(async () => {
      const latest = taskRef.current;
      if (
        !latest ||
        latest.status === "completed" ||
        latest.status === "failed"
      ) {
        clearInterval(interval);
        return;
      }
      await fetchTaskStatus(latest.id);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [task?.id, fetchTaskStatus]);

  const analyzing =
    task?.status === "pending" || task?.status === "processing";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-primary" />
          Importar de Lichess
        </CardTitle>
        <CardDescription>
          Descarga automáticamente las últimas 10 partidas públicas de un
          usuario de Lichess, las guarda en tu base de datos y las analiza con
          el Entrenador IA (Stockfish) en segundo plano.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleImport()}
            placeholder="Usuario de Lichess (ej: magnuscarlsen)"
            aria-label="Usuario de Lichess"
            disabled={loading}
          />
          <Button
            onClick={handleImport}
            disabled={loading}
            className="shrink-0"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Importar de Lichess
          </Button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Descargando las últimas 10 partidas de Lichess...
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!loading && games && games.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {games.length} partida{games.length === 1 ? "" : "s"} descargadas
              de <span className="text-foreground">{username.trim()}</span> y
              enviadas al Entrenador IA:
            </p>
            <div className="grid gap-2">
              {games.map((game, index) => (
                <div
                  key={`${game.white}-${game.black}-${game.resultRaw}-${index}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate">
                        Tú ({game.playerColor === "white" ? "Blancas" : "Negras"})
                      </span>
                      <span className="text-muted-foreground">vs</span>
                      <span className="font-medium truncate">{game.rival}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {game.date}
                      </span>
                      <span>{game.event || game.timeControl}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <ResultBadge result={game.result} />
                    <Badge variant="outline" className="text-xs">
                      {game.speed}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {task && (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                {task.status === "completed" && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
                {task.status === "failed" && (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                {(task.status === "pending" ||
                  task.status === "processing") && (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                )}
                Análisis con Stockfish
              </p>
              <span className="text-xs font-medium uppercase text-muted-foreground">
                {task.status}
              </span>
            </div>

            {analyzing && (
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className="animate-progress-indeterminate bg-blue-500" />
              </div>
            )}

            {task.status === "completed" && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className="text-xs">Procesadas: {task.processed}</Badge>
                <Badge className="text-xs">Errores: {task.errors_found}</Badge>
                <Badge className="text-xs">
                  Duplicadas: {task.skipped_duplicate}
                </Badge>
                <Badge className="text-xs">
                  No jugadas: {task.skipped_not_user}
                </Badge>
              </div>
            )}

            {task.status === "failed" && task.error_message && (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {task.error_message}
              </p>
            )}

            {task.status === "completed" && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <FileText className="h-4 w-4 shrink-0 mt-0.5" />
                Las partidas analizadas quedan guardadas en «Mis partidas». Si
                el usuario de Lichess no coincide con tu perfil (nombre o nick
                online), las partidas se descartarán como «No jugadas».
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
