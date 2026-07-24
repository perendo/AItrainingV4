"use client";
import { Chess } from "chess.js";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PgnViewerProps {
  fen: string;
  moves: string[];
  initialMoveNumber: number;
  viewIndex: number;
  onGoToMove: (moveIndex: number) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function PgnViewer({ fen, moves, initialMoveNumber, viewIndex, onGoToMove, onPrev, onNext }: PgnViewerProps) {
  const game = new Chess(fen);
  const sanMoves: string[] = [];
  
  moves.forEach(move => {
    try {
      const sanMove = game.move({ from: move.substring(0, 2), to: move.substring(2, 4), promotion: move.length === 5 ? move.substring(4) : undefined });
      if (sanMove) {
        sanMoves.push(sanMove.san);
      }
    } catch (e) {
      // This can happen if moves are invalid, though they shouldn't be.
      // We'll log it but not crash.
      console.error("Error processing move in PgnViewer:", e);
    }
  });

  const turn = new Chess(fen).turn();
  const moveOffset = turn === 'w' ? 0 : 1;

  const groupedMoves: {
    moveNumber: number;
    whiteMove?: { san: string; historyIndex: number; };
    blackMove?: { san: string; historyIndex: number; };
  }[] = [];

  sanMoves.forEach((san, index) => {
    const historyIndex = index + 1;
    const isWhiteMove = (historyIndex - 1 + moveOffset) % 2 === 0;
    const moveNumber = Math.floor((historyIndex - 1 + moveOffset) / 2) + initialMoveNumber;

    if (isWhiteMove) {
      // If it's a white move, create a new group
      groupedMoves.push({
        moveNumber: moveNumber,
        whiteMove: { san, historyIndex },
      });
    } else {
      // If it's a black move, add it to the last group
      let lastGroup = groupedMoves[groupedMoves.length - 1];
      if (lastGroup && lastGroup.moveNumber === moveNumber) {
        lastGroup.blackMove = { san, historyIndex };
      } else {
        // This case should only happen if the first move is black,
        // and initialMoveNumber correctly reflects the state before black's move.
        // It means we need to start a new group with a black move.
        groupedMoves.push({
          moveNumber: moveNumber,
          blackMove: { san, historyIndex },
        });
      }
    }
  });


  return (
    <div>
      <h4 className="font-semibold mb-2">Movimientos</h4>
      <div className="flex justify-center items-center gap-2 mb-2">
        <Button onClick={onPrev} disabled={viewIndex === 0} variant="outline" size="icon">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button onClick={onNext} disabled={viewIndex === moves.length} variant="outline" size="icon">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="text-sm">
        <div className="flex flex-wrap gap-x-2 gap-y-1 mb-1"> {/* For the initial button */}
          <button
              onClick={() => onGoToMove(0)}
              className={cn(
                "p-1 rounded-md cursor-pointer",
                viewIndex === 0 && "bg-blue-200"
              )}
          >
              {turn === 'b' ? `${initialMoveNumber}. ...` : `${initialMoveNumber}.`}
          </button>
        </div>
        {groupedMoves.map((group, groupIndex) => (
          <div key={groupIndex} className="flex flex-wrap gap-x-2 gap-y-1 mb-1">
            <span className="font-bold mr-1">{group.moveNumber}.</span>
            {group.whiteMove && (
              <button
                onClick={() => onGoToMove(group.whiteMove!.historyIndex)}
                className={cn(
                  "p-1 rounded-md cursor-pointer hover:bg-gray-200",
                  viewIndex === group.whiteMove!.historyIndex && "bg-blue-200 font-bold"
                )}
              >
                {group.whiteMove.san}
              </button>
            )}
            {group.blackMove && (
              <button
                onClick={() => onGoToMove(group.blackMove!.historyIndex)}
                className={cn(
                  "p-1 rounded-md cursor-pointer hover:bg-gray-200",
                  viewIndex === group.blackMove!.historyIndex && "bg-blue-200 font-bold"
                )}
              >
                {group.blackMove.san}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
