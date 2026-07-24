"use client";

import Link from "next/link";
import { TrainingTask } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Target, Clock, History } from "lucide-react";

interface TrainingTaskCardProps {
  task: TrainingTask;
}

const categoryIcons = {
  "Táctica y Capturas": <BookOpen className="h-5 w-5 mr-2" />,
  "Estrategia y Posicional": <Target className="h-5 w-5 mr-2" />,
  "Seguridad del Rey y Finales": <Clock className="h-5 w-5 mr-2" />,
  "Análisis de Partida de GM": <History className="h-5 w-5 mr-2" />,
};

export function TrainingTaskCard({ task }: TrainingTaskCardProps) {
  const progress = task.target_count > 0 ? (task.current_count / task.target_count) * 100 : 0;
  const isGmGameAnalysis = task.category === "Análisis de Partida de GM";

  const renderActionButton = () => {
    if (isGmGameAnalysis && task.gm_game) {
      return (
        <Link href={`/partidas/${task.gm_game.id}?isGmGame=true`} passHref>
          <Button className="w-full">Start Analysis</Button>
        </Link>
      );
    }

    return (
      <Link href={`/entrenamiento/${task.id}`} passHref>
        <Button disabled={task.is_completed} className="w-full">
          {task.current_count > 0 && !task.is_completed ? "Continue" : "Start"}
        </Button>
      </Link>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          {categoryIcons[task.category] || <BookOpen className="h-5 w-5 mr-2" />}
          {task.category}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">{task.description}</p>
        <div className="flex justify-between items-center">
          <Badge variant={task.is_completed ? "default" : "secondary"}>
            {task.is_completed ? "Completed" : "Pending"}
          </Badge>
          <span className="text-sm font-semibold">
            {task.current_count} / {task.target_count}
          </span>
        </div>
        {!isGmGameAnalysis && (
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div
                className="bg-primary h-2.5 rounded-full"
                style={{ width: `${progress}%` }}
            ></div>
            </div>
        )}
      </CardContent>
      <CardFooter>
        {renderActionButton()}
      </CardFooter>
    </Card>
  );
}
