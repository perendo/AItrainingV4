"use client";

import { Badge } from "@/components/ui/badge";
import { Save } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ReplayBoard } from "./ReplayBoard";
import { AnalysisFormPanel, GeminiFeedbackDisplay } from "./AnalysisFormPanel";
import { GeminiFeedback } from "@/lib/types";
import { useCallback, useState } from "react";

interface GMGameAnalysisViewProps {
  gmGame: {
    id: string;
    white: string;
    black: string;
    pgn: string;
    gm_name: string;
    event?: string;
    year?: number;
    result?: string;
  };
  onComplete?: () => void;
}

export function GMGameAnalysisView({
  gmGame,
  onComplete,
}: GMGameAnalysisViewProps) {
  const [feedback, setFeedback] = useState<GeminiFeedback | null>(null);
  const [feedbackMode, setFeedbackMode] = useState<string | null>(null);
  const handleFeedback = useCallback(
    (f: GeminiFeedback | null, mode?: string | null) => {
      setFeedback(f);
      setFeedbackMode(mode ?? null);
    },
    [],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Análisis de Partida GM: {gmGame.white} vs {gmGame.black}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {gmGame.event} · {gmGame.year} · {gmGame.result} · GM:{" "}
            {gmGame.gm_name}
          </p>
        </div>
        <Badge variant="secondary" className="text-xs w-fit">
          <Save className="mr-1 h-3 w-3" />
          Partida de GM
        </Badge>
      </div>

      {/* Main Layout: 2 Columns */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT COLUMN: Board (55%) */}
        <div className="w-full lg:w-[55%]">
          <ReplayBoard pgn={gmGame.pgn} />
        </div>

        {/* RIGHT COLUMN: Form (45%) */}
        <div className="w-full lg:w-[45%]">
          <AnalysisFormPanel
            gameType="GM"
            gmGameId={gmGame.id}
            pgn={gmGame.pgn}
            whitePlayer={gmGame.white}
            blackPlayer={gmGame.black}
            onComplete={onComplete}
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
            {feedbackMode === "ai"
              ? "Análisis del Gran Maestro (IA)"
              : "Informe del Gran Maestro"}
          </h2>
          <GeminiFeedbackDisplay feedback={feedback} mode={feedbackMode} />
        </div>
      )}
    </div>
  );
}
