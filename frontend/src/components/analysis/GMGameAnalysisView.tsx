"use client";

import { Badge } from "@/components/ui/badge";
import { Save } from "lucide-react";
import { ReplayBoard } from "./ReplayBoard";
import { AnalysisFormPanel } from "./AnalysisFormPanel";

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
          />
        </div>
      </div>
    </div>
  );
}
