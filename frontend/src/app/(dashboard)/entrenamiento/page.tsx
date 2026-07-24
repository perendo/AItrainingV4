"use client";

import { TrainingTaskList } from "@/components/training/TrainingTaskList";

export default function EntrenamientoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Training Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Here are your pending tasks. Select one to get started.
        </p>
      </div>
      <TrainingTaskList />
    </div>
  );
}
