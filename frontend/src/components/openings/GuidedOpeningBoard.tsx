"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Lightbulb,
  Flag,
  BrainCircuit,
  ChessKnight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UseGuidedOpeningReturn } from "@/hooks/useGuidedOpening";

const DynamicChessboard = dynamic(
  () => import("react-chessboard").then((mod) => ({ default: mod.Chessboard })),
  { ssr: false },
);

interface GuidedOpeningBoardProps {
  guided: UseGuidedOpeningReturn;
}

export function GuidedOpeningBoard({ guided }: GuidedOpeningBoardProps) {
  const { fen, isUserTurn, bookBusy, moves, lastMove } = guided;

  const groupedMoves = useMemo(() => {
    const groups: Array<{
      moveNumber: number;
      white?: { san: string; by: "user" | "book" };
      black?: { san: string; by: "user" | "book" };
    }> = [];
    moves.forEach((move, i) => {
      const moveNumber = Math.floor(i / 2) + 1;
      if (move.side === "w") {
        groups.push({ moveNumber, white: { san: move.san, by: move.by } });
      } else {
        const last = groups[groups.length - 1];
        if (last && last.moveNumber === moveNumber) {
          last.black = { san: move.san, by: move.by };
        } else {
          groups.push({ moveNumber, black: { san: move.san, by: move.by } });
        }
      }
    });
    return groups;
  }, [moves]);

  const statusText = bookBusy
    ? "El libro de aperturas está pensando…"
    : guided.phase === "playing"
      ? isUserTurn
        ? `Juegan tus ${guided.userColor === "w" ? "blancas" : "negras"}`
        : "El libro de aperturas responde…"
      : guided.phase === "paused"
        ? "La teórica terminó en esta posición."
        : "Partida finalizada";

  const totalWeight = useMemo(
    () => (guided.hint ?? []).reduce((acc, m) => acc + m.weight, 0),
    [guided.hint],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="w-full aspect-square max-w-[720px] mx-auto">
            <DynamicChessboard
              position={fen}
              boardOrientation={guided.orientation}
              onPieceDrop={(from, to, piece) => {
                void guided.playUserMove(from, to, piece);
                return true;
              }}
              arePiecesDraggable
              isDraggablePiece={({ piece }) => {
                if (!isUserTurn || bookBusy) return false;
                return piece?.[0] === guided.userColor;
              }}
              customBoardStyle={{ borderRadius: "4px" }}
              customSquareStyles={
                lastMove
                  ? {
                      [lastMove[0]]: { backgroundColor: "rgba(255, 255, 0, 0.4)" },
                      [lastMove[1]]: { backgroundColor: "rgba(255, 255, 0, 0.4)" },
                    }
                  : {}
              }
            />
          </div>
          <p className="mt-3 flex items-center justify-center gap-2 text-center text-sm font-medium">
            {bookBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-primary">{statusText}</span>
              </>
            ) : (
              <span className="text-primary">{statusText}</span>
            )}
          </p>
        </CardContent>
      </Card>

      {guided.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {guided.error}
        </div>
      )}

      {/* Pista del libro */}
      <Card>
        <CardContent className="space-y-3 p-4">
          {guided.hint === null ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!isUserTurn || guided.hintLoading}
                onClick={() => void guided.requestHint()}
                className="gap-2"
              >
                {guided.hintLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                )}
                Pedir pista del libro
              </Button>
              <span className="text-xs text-muted-foreground">
                Consulta qué jugada aconseja la teoría para la posición actual.
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  <BrainCircuit className="mr-1 inline h-4 w-4 text-primary" />
                  La teoría sugiere:
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={guided.clearHint}
                  className="text-xs"
                >
                  Ocultar pista
                </Button>
              </div>
              {guided.hint.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay jugadas en el libro para esta posición.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {guided.hint.map((m, i) => {
                    const pct = totalWeight > 0 ? Math.round((m.weight / totalWeight) * 100) : 0;
                    return (
                      <Badge
                        key={m.uci}
                        variant={i === 0 ? "default" : "secondary"}
                        className={cn("gap-1 px-3 py-1 text-sm", i === 0 && "border-primary")}
                      >
                        <ChessKnight className="h-3.5 w-3.5" />
                        {m.san}
                        <span className="font-normal opacity-80">· ~{pct}%</span>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Registro de jugadas */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-sm font-medium">
            Registro de jugadas{" "}
            <span className="font-normal text-muted-foreground">
              (tus jugadas marcadas)
            </span>
          </p>
          {groupedMoves.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay movimientos.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto text-sm space-y-1">
              {groupedMoves.map((group, i) => (
                <div key={i} className="flex flex-wrap gap-x-2 gap-y-1">
                  <span className="font-bold mr-1">{group.moveNumber}.</span>
                  {group.white && (
                    <span
                      className={cn(
                        group.white.by === "user" && "font-semibold text-primary",
                      )}
                    >
                      {group.white.san}
                    </span>
                  )}
                  {group.black && (
                    <span
                      className={cn(
                        group.black.by === "user" && "font-semibold text-primary",
                      )}
                    >
                      {group.black.san}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {guided.phase === "playing" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={guided.finishHere} className="ml-auto gap-2">
            <Flag className="h-4 w-4" />
            Terminar aquí
          </Button>
          <p className="w-full text-xs text-muted-foreground lg:w-auto">
            Termina la partida y pasa al autodiagnóstico aunque sigas en teoría.
          </p>
        </div>
      )}
    </div>
  );
}