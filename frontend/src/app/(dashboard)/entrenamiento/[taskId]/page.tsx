"use client";

import { PuzzleResponse } from "@/lib/types";
import { completeTrainingTask, getNextPuzzle } from "@/lib/api";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Chess } from "chess.js";
import { InteractiveChessBoard } from "@/components/training/InteractiveChessBoard";

export default function PuzzlePage() {
  const [puzzle, setPuzzle] = useState<PuzzleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const params = useParams();
  const taskId = params.taskId as string;

  const fetchPuzzle = useCallback(() => {
    if (taskId) {
      setLoading(true);
      setError(null);
      getNextPuzzle(taskId)
        .then((data) => {
          setPuzzle(data);
        })
        .catch((err) => {
          console.error(err);
          setError("Failed to load the next puzzle. Please try again or go back to the dashboard.");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [taskId]);

  useEffect(() => {
    fetchPuzzle();
  }, [fetchPuzzle]);

  const processedPuzzle = useMemo(() => {
    if (!puzzle) return null;

    const moves = puzzle.moves.split(" ");
    if (moves.length === 0) return null;

    const game = new Chess(puzzle.fen);
    const firstMoveUci = moves[0];
    const moveResult = game.move({ from: firstMoveUci.substring(0, 2), to: firstMoveUci.substring(2, 4), promotion: firstMoveUci.length === 5 ? firstMoveUci.substring(4) : undefined });

    if (moveResult === null) {
        console.error("Failed to process first move of puzzle:", puzzle);
        return null;
    }

    return {
      initialFen: game.fen(),
      solution: moves.slice(1),
      orientation: game.turn() === 'w' ? 'black' : 'white' as "white" | "black",
    };
  }, [puzzle]);

  const handleComplete = useCallback(async () => {
    try {
      await completeTrainingTask(taskId);
    } catch (error) {
      console.error("Failed to mark task as complete:", error);
      setError("Could not save your progress. Please try again.");
    }
  }, [taskId]);

  if (loading) {
    return <div>Loading puzzle...</div>;
  }

  if (error) {
    return (
      <div className="text-center">
        <p className="text-red-500">{error}</p>
        <Button onClick={fetchPuzzle} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  if (!puzzle || !processedPuzzle) {
    return <div>Puzzle not found or could not be processed.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Training Exercise</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Solve the puzzle to improve your skills. Rating: {puzzle.rating}
        </p>
      </div>
      <InteractiveChessBoard
        fen={processedPuzzle.initialFen}
        solutionMoves={processedPuzzle.solution}
        orientation={processedPuzzle.orientation}
        onComplete={handleComplete}
        onNext={fetchPuzzle}
        comments={`Themes: ${puzzle.themes}`}
      />
    </div>
  );
}
