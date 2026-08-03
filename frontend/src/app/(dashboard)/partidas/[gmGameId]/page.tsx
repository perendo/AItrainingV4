"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getGmGameById, completeTrainingTask } from "@/lib/api";
import { GMGameResponse, TrainingTask } from "@/lib/types";
import { GMGameAnalysisView } from "@/components/analysis/GMGameAnalysisView";
import { getPendingTasks } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function GmGameAnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const gmGameId = params.gmGameId as string;

  const [gmGame, setGmGame] = useState<GMGameResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<number | null>(null);

  useEffect(() => {
    if (!gmGameId) return;

    setLoading(true);
    setError(null);

    getGmGameById(gmGameId)
      .then((game) => {
        setGmGame(game);
      })
      .catch((err) => {
        console.error("Failed to load GM game:", err);
        setError("No se pudo cargar la partida del Gran Maestro.");
      })
      .finally(() => setLoading(false));
  }, [gmGameId]);

  useEffect(() => {
    if (!gmGameId) return;

    getPendingTasks()
      .then((tasks) => {
        const match = tasks.find(
          (t) => t.gm_game?.id === gmGameId && t.category === "Análisis de Partida de GM"
        );
        if (match) setTaskId(match.id);
      })
      .catch(() => {});
  }, [gmGameId]);

  const handleComplete = async () => {
    if (taskId) {
      try {
        await completeTrainingTask(String(taskId));
      } catch (err) {
        console.error("Failed to mark task complete:", err);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Cargando partida del Gran Maestro...</p>
      </div>
    );
  }

  if (error || !gmGame) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-destructive text-lg font-medium">{error || "Partida no encontrada"}</p>
        <Button onClick={() => router.push("/entrenamiento")}>
          Volver a Entrenamiento
        </Button>
      </div>
    );
  }

  return (
    <GMGameAnalysisView
      gmGame={gmGame}
      onComplete={handleComplete}
    />
  );
}
