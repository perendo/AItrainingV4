"use client";

import { useState, useEffect } from "react";
import { getPendingTasks, generateWeeklyPlan } from "@/lib/api";
import { TrainingTask } from "@/lib/types";
import { TrainingTaskCard } from "./TrainingTaskCard";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PlusCircle, RotateCw } from "lucide-react";

export function TrainingTaskList() {
  const [tasks, setTasks] = useState<TrainingTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const pendingTasks = await getPendingTasks();
      setTasks(pendingTasks);
    } catch (err) {
      setError("Failed to load training tasks. Please try again later.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleGeneratePlan = async () => {
    setIsLoading(true);
    try {
      await generateWeeklyPlan();
      await fetchTasks();
    } catch (err) {
      setError("Failed to generate a new plan. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RotateCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center p-8 border-dashed border-2 rounded-lg">
        <h3 className="text-xl font-semibold">No Pending Tasks</h3>
        <p className="text-muted-foreground mt-2 mb-4">
          You don&apos;t have any pending tasks. Generate a new weekly plan to get started.
        </p>
        <Button onClick={handleGeneratePlan}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Generate New Plan
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {tasks.map((task) => (
        <TrainingTaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
