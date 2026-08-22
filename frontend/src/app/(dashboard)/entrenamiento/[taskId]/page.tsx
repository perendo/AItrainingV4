"use client";

import { PuzzleResponse } from "@/lib/types";
import { getNextPuzzle, completeTrainingTask } from "@/lib/api";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Chess } from "chess.js";
import { InteractiveChessBoard } from "@/components/training/InteractiveChessBoard";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function PuzzlePage() {
  const [puzzle, setPuzzle] = useState<PuzzleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const params = useParams();
  const taskId = params.taskId as string;
  const reportContentRef = useRef<HTMLDivElement>(null);

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

  const handleComplete = async () => {
    try {
      await completeTrainingTask(taskId);
    } catch (err) {
      console.error("Failed to mark task as complete:", err);
    }
  };

  const handleExportToPDF = () => {
    const input = reportContentRef.current;
    if (!input) {
      console.error("No se encontró el contenido para exportar.");
      return;
    }

    // Ocultamos temporalmente cualquier botón dentro del área a exportar
    const buttons = input.querySelectorAll('button');
    buttons.forEach(btn => btn.style.display = 'none');

    html2canvas(input, { scale: 2, useCORS: true }).then(canvas => {
      // Volvemos a mostrar los botones por si acaso
      buttons.forEach(btn => btn.style.display = 'block');

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      const imgHeight = pdfWidth / ratio;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`informe-puzzle-${puzzle?.id || taskId}.pdf`);
    });
  };
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
    <div className="space-y-6" >
      <div ref={reportContentRef}>
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
      <Button onClick={handleExportToPDF} className="mt-4">
        Exportar a PDF
      </Button>
    </div>
  );
}
