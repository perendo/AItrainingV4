"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch, ApiError } from "@/lib/api";
import type { GameResponse, TaskResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 2500;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function PartidasPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [task, setTask] = useState<TaskResponse | null>(null);
  const [games, setGames] = useState<GameResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Referencia viva de la tarea para el intervalo de polling sin recrearlo.
  const taskRef = useRef<TaskResponse | null>(null);
  taskRef.current = task;

  const fetchGames = useCallback(async () => {
    try {
      const data = await apiFetch<GameResponse[]>("/api/v1/games/");
      setGames(data);
    } catch {
      // Silencioso: la lista se reintenta en la próxima subida o recarga.
    }
  }, []);

  // Carga inicial del historial de partidas analizadas.
  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  // Polling de la tarea en segundo plano (backend responde 202 + task_id).
  useEffect(() => {
    const currentTask = taskRef.current;
    if (!currentTask?.id) return;
    if (
      currentTask.status === "completed" ||
      currentTask.status === "failed"
    )
      return;

    const interval = setInterval(async () => {
      const current = taskRef.current;
      if (
        !current ||
        current.status === "completed" ||
        current.status === "failed"
      ) {
        clearInterval(interval);
        return;
      }
      try {
        const updated = await apiFetch<TaskResponse>(
          `/api/v1/games/tasks/${current.id}`
        );
        setTask(updated);
        if (updated.status === "completed") {
          clearInterval(interval);
          fetchGames();
        } else if (updated.status === "failed") {
          clearInterval(interval);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearInterval(interval);
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [task?.id, fetchGames]);

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const created = await apiFetch<TaskResponse>(
          "/api/v1/games/upload-pgn",
          {
            method: "POST",
            body: formData,
          }
        );
        setTask(created);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
        }
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const taskActive =
    task &&
    (task.status === "pending" || task.status === "processing");
  const progressValue =
    task?.status === "completed"
      ? 100
      : task?.status === "processing"
        ? 65
        : task?.status === "pending"
          ? 10
          : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Mis partidas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sube tu archivo PGN para analizarlo con Stockfish y detectar tus
          errores. El análisis se procesa en segundo plano.
        </p>
      </div>

      {/* Zona de subida Drag & Drop */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Subir partidas (PGN)</CardTitle>
          <CardDescription>
            Arrastra un archivo .pgn o .txt, o haz clic para seleccionarlo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="button"
            tabIndex={0}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              isDragging
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                : "border-slate-300 hover:border-blue-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            } ${isUploading ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pgn,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
            {isUploading ? (
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-blue-500" />
            ) : (
              <UploadCloud className="mb-3 h-8 w-8 text-slate-400" />
            )}
            <p className="text-sm font-medium">
              {isUploading
                ? "Subiendo archivo..."
                : "Arrastra tu PGN aquí o haz clic para buscar"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Formatos admitidos: .pgn, .txt
            </p>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Estado del análisis en segundo plano */}
      {task && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
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
                Análisis: {task.filename}
              </CardTitle>
            </div>
            <CardDescription>
              Estado:{" "}
              <span className="font-medium uppercase">{task.status}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              {taskActive ? (
                <div className="animate-progress-indeterminate bg-blue-500" />
              ) : (
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progressValue}%`,
                    backgroundColor:
                      task.status === "failed" ? "#ef4444" : "#3b82f6",
                  }}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Procesadas" value={task.processed} />
              <Stat label="Errores" value={task.errors_found} />
              <Stat label="Duplicadas" value={task.skipped_duplicate} />
              <Stat label="No jugadas" value={task.skipped_not_user} />
            </div>

            {task.status === "failed" && task.error_message && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {task.error_message}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Historial de partidas analizadas */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Historial ({games.length})
        </h2>

        {games.length === 0 ? (
          <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground shadow-sm dark:bg-slate-900">
            Aún no tienes partidas analizadas. Sube un PGN para empezar.
          </div>
        ) : (
          <div className="grid gap-4">
            {games.map((game) => (
              <Card key={game.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-slate-400" />
                    <div>
                      <p className="font-medium">
                        {game.white_player}{" "}
                        <span className="text-muted-foreground">vs</span>{" "}
                        {game.black_player}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(game.created_at)} · Tu color:{" "}
                        {game.player_color || "—"} · Resultado:{" "}
                        {game.result || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      {game.errors.length} errores
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3 text-center dark:bg-slate-900">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
