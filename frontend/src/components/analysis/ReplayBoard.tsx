"use client";

import { LichessReplay } from "./LichessReplay";

interface ReplayBoardProps {
  pgn: string;
  title?: string;
  orientation?: "white" | "black";
  emptyMessage?: string;
}

export function ReplayBoard({
  pgn,
  title = "Tablero Interactivo",
  orientation = "white",
  emptyMessage = "No hay movimientos que mostrar.",
}: ReplayBoardProps) {
  return (
    <LichessReplay
      pgn={pgn}
      title={title}
      orientation={orientation}
      emptyMessage={emptyMessage}
      layout="stacked"
    />
  );
}
