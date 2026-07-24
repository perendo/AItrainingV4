"use client";

import { Button } from "@/components/ui/button";
import {
  Eye,
  StepForward,
} from "lucide-react";

interface BoardControlsProps {
  onShowSolution: () => void;
  onNextExercise: () => void;
  isSolved: boolean;
  isReady: boolean;
}

export function BoardControls({
  onShowSolution,
  onNextExercise,
  isSolved,
  isReady,
}: BoardControlsProps) {
  return (
    <div className="flex flex-col space-y-2">
        <div className="flex flex-col space-y-2">
            <Button onClick={onShowSolution} disabled={isSolved || !isReady} variant="outline">
                <Eye className="mr-2 h-4 w-4" />
                Mostrar Solución
            </Button>
            <Button onClick={onNextExercise} disabled={!isSolved}>
                <StepForward className="mr-2 h-4 w-4" />
                Siguiente Ejercicio
            </Button>
        </div>
    </div>
  );
}
