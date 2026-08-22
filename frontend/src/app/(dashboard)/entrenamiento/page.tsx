"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrainingTaskList } from "@/components/training/TrainingTaskList";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles, Loader2 } from "lucide-react";
import { generateWeeklyPlan } from "@/lib/api";

export default function EntrenamientoPage() {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleGenerateExercise = async () => {
    try {
      setGenerating(true);
      setError(null);
      await generateWeeklyPlan();
      setRefreshKey((prev) => prev + 1);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al generar el nuevo ejercicio. Por favor, inténtalo de nuevo.";
      setError(message);
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Training Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Aquí tienes tus tareas pendientes. Selecciona una para empezar o genera un nuevo ejercicio con IA.
          </p>
        </div>
        <div>
          <Button
            onClick={handleGenerateExercise}
            disabled={generating}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando ejercicio con IA...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-amber-300" />
                Generar Nuevo Ejercicio
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <TrainingTaskList key={refreshKey} />
    </div>
  );
}
