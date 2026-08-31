"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lightbulb, AlertCircle, CheckCircle, RotateCcw } from "lucide-react";
import { PgnViewer } from "./PgnViewer";
import { BoardControls } from "./BoardControls";
import { useChessSounds } from "@/hooks/useChessSounds";

const DynamicChessboard = dynamic(
  () => import("react-chessboard").then((mod) => ({ default: mod.Chessboard })),
  { ssr: false }
);

type PuzzleStatus = "loading" | "ready" | "incorrect" | "solved" | "finished" | "showing_solution" | "showing_solution_after_failure" | "finished_after_failure" | "finished_showing_solution";

interface InteractiveChessBoardProps {
  fen: string;
  solutionMoves: string[];
  orientation: "white" | "black";
  pgn?: string;
  comments?: string;
  onComplete: () => void;
  onNext: () => void;
}

export function InteractiveChessBoard({
  fen,
  solutionMoves,
  orientation,
  pgn,
  comments,
  onComplete,
  onNext,
}: InteractiveChessBoardProps) {
  const [game, setGame] = useState(new Chess(fen));
  const [userMoveHistory, setUserMoveHistory] = useState<string[]>([]);
  const [viewIndex, setViewIndex] = useState(0); 
  const [status, setStatus] = useState<PuzzleStatus>("ready");
  const [message, setMessage] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  // Orientación del tablero. Arranca con la perspectiva del ejercicio (p.ej.
  // el usuario juega con negras) pero siempre se puede alternar manualmente.
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">(
    orientation
  );

  const { playMoveSound, playErrorSound } = useChessSounds();

  const positions = useMemo(() => {
    const g = new Chess(fen);
    const fens = [fen];
    for (const move of userMoveHistory) {
      try {
        g.move({ from: move.substring(0,2), to: move.substring(2,4), promotion: move.length > 4 ? move.substring(4) : undefined });
        fens.push(g.fen());
      } catch(e) {
        console.error("Invalid move in history:", move);
      }
    }
    return fens;
  }, [fen, userMoveHistory]);

  const currentFen = positions[viewIndex];

  useEffect(() => {
    const newGame = new Chess(fen);
    setGame(newGame);
    setUserMoveHistory([]);
    setViewIndex(0);
    setLastMove(null);
    setStatus("ready");
    setBoardOrientation(orientation);
  }, [fen, orientation]);

  const toggleOrientation = () => {
    setBoardOrientation((o) => (o === "white" ? "black" : "white"));
  };


  const playSolutionAfterFailure = () => {
    let moveIndex = viewIndex;

    const playNextSolutionMove = () => {
      if (moveIndex >= solutionMoves.length) {
        setStatus("finished_after_failure");
        return;
      }
      const move = solutionMoves[moveIndex];
      const newHistory = [...userMoveHistory.slice(0, viewIndex), ...solutionMoves.slice(viewIndex, moveIndex + 1)];
      setUserMoveHistory(newHistory);
      setViewIndex(newHistory.length);
      setLastMove([move.substring(0,2), move.substring(2,4)]);
      playMoveSound();
      
      moveIndex++;
      setTimeout(playNextSolutionMove, 500);
    }
    playNextSolutionMove();
  }

  const onDrop = (sourceSquare: string, targetSquare: string, piece: string): boolean => {
    if (status !== "ready") return false;

    const gameCopy = new Chess(currentFen);
    const isPromotion = piece.toUpperCase().endsWith("P") && (targetSquare.endsWith("1") || targetSquare.endsWith("8"));
    
    let move;
    try {
      move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });
    } catch (e) {
      return false;
    }

    if (move === null) return false;

    const uciMove = `${sourceSquare}${targetSquare}${isPromotion ? "q" : ""}`;
    const truncatedHistory = userMoveHistory.slice(0, viewIndex);
    const expectedMove = solutionMoves[truncatedHistory.length];

    if (!expectedMove || uciMove !== expectedMove) {
      setMessage("INCORRECTO");
      setStatus("showing_solution_after_failure");
      playErrorSound();
      setTimeout(() => playSolutionAfterFailure(), 500);
      return true; 
    }

    const newHistory = [...truncatedHistory, uciMove];
    setUserMoveHistory(newHistory);
    setLastMove([sourceSquare, targetSquare]);
    setViewIndex(newHistory.length);
    playMoveSound();

    if (newHistory.length >= solutionMoves.length) {
      setStatus("solved");
      setMessage("CORRECTO");
      onComplete();
      return true;
    }
    
    setTimeout(() => {
      const computerMoveUci = solutionMoves[newHistory.length];
      if (computerMoveUci) {
        const nextHistory = [...newHistory, computerMoveUci];
        gameCopy.move({ from: computerMoveUci.substring(0, 2), to: computerMoveUci.substring(2, 4), promotion: "q" });
        setUserMoveHistory(nextHistory);
        setLastMove([computerMoveUci.substring(0, 2), computerMoveUci.substring(2, 4)]);
        setViewIndex(nextHistory.length);
        setStatus("ready");
        playMoveSound();
      }
    }, 500);

    return true;
  };

  const handleShowSolution = () => {
    setStatus("showing_solution");
    let moveIndex = 0;

    const playNextMove = () => {
      if (moveIndex >= solutionMoves.length) {
        setStatus("finished_showing_solution");
        return;
      }
      const uciMove = solutionMoves[moveIndex];
      const newHistory = solutionMoves.slice(0, moveIndex + 1);
      setUserMoveHistory(newHistory);
      setViewIndex(newHistory.length);
      setLastMove([uciMove.substring(0, 2), uciMove.substring(2, 4)]);
      playMoveSound();
      moveIndex++;
      setTimeout(playNextMove, 700);
    };
    playNextMove();
  };

  const handleGoToMove = (index: number) => setViewIndex(index);
  const handlePrev = () => setViewIndex(prev => Math.max(0, prev - 1));
  const handleNext = () => setViewIndex(prev => Math.min(userMoveHistory.length, prev + 1));

  const statusContent = useMemo(() => {
    switch (status) {
      case "showing_solution_after_failure":
      case "finished_after_failure":
        return (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-2xl font-bold">INCORRECTO</AlertTitle>
            <AlertDescription>Se ha mostrado la solución correcta.</AlertDescription>
          </Alert>
        );
      case "solved":
        return (
          <Alert variant="default" className="border-green-500 bg-green-100 text-green-700">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle className="text-2xl font-bold">CORRECTO</AlertTitle>
          </Alert>
        );
      case "showing_solution":
      case "finished_showing_solution":
         return (
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>Mostrando Solución</AlertTitle>
          </Alert>
        );
      default:
        return (
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>
              {new Chess(currentFen).turn() === "w" ? "Juegan Blancas" : "Juegan Negras"}
            </AlertTitle>
            <AlertDescription>Encuentra la mejor jugada.</AlertDescription>
          </Alert>
        );
    }
  }, [status, currentFen]);

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="w-full max-w-[720px]">
        <div className="flex justify-end pb-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Girar orientación del tablero"
            title="Girar el tablero"
            onClick={toggleOrientation}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
        <div className="w-full aspect-square">
        <DynamicChessboard
          position={currentFen}
          onPieceDrop={onDrop}
          boardOrientation={boardOrientation}
          customBoardStyle={{ borderRadius: "4px" }}
          customSquareStyles={lastMove ? {
            [lastMove[0]]: { backgroundColor: "rgba(255, 255, 0, 0.4)" },
            [lastMove[1]]: { backgroundColor: "rgba(255, 255, 0, 0.4)" },
          } : {}}
          arePiecesDraggable={status === 'ready'}
        />
        </div>
      </div>
      <div className="w-full lg:w-1/3 space-y-4">
        {statusContent}
        <Card>
          <CardContent className="p-4">
            <PgnViewer 
              fen={fen} 
              moves={userMoveHistory} 
              initialMoveNumber={new Chess(fen).moveNumber()}
              viewIndex={viewIndex}
              onGoToMove={handleGoToMove}
              onPrev={handlePrev}
              onNext={handleNext}
            />
            {comments && (
              <div className="mt-4 p-2 bg-secondary rounded-md">
                <h4 className="font-semibold mb-2">Comentarios</h4>
                <p className="text-sm text-muted-foreground">{comments}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <BoardControls
          onShowSolution={handleShowSolution}
          onNextExercise={onNext}
          isSolved={status === 'solved' || status === 'showing_solution' || status === 'showing_solution_after_failure' || status === 'finished_after_failure' || status === 'finished_showing_solution'}
          isReady={status === 'ready'}
        />
      </div>
    </div>
  );
}
