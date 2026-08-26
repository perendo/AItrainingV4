"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Loader2,
  RotateCcw,
  CheckCircle,
  XCircle,
  Swords,
  Brain,
} from "lucide-react";
import { useChessSounds } from "@/hooks/useChessSounds";
import { getStockfishMove, updateEndgameProgress } from "@/lib/api";
import type { EndgameLessonDetail } from "@/lib/types";

const DynamicChessboard = dynamic(
  () => import("react-chessboard").then((mod) => ({ default: mod.Chessboard })),
  { ssr: false }
);

type PracticeStatus =
  | "ready"
  | "thinking"
  | "won"
  | "lost"
  | "draw"
  | "stalemate"
  | "error";

interface EndgamePracticeBoardProps {
  lesson: EndgameLessonDetail;
  onMastered?: () => void;
}

const SKILL_LEVELS = [
  { value: "3", label: "Fácil (Nivel 3)" },
  { value: "8", label: "Intermedio (Nivel 8)" },
  { value: "13", label: "Avanzado (Nivel 13)" },
  { value: "18", label: "Experto (Nivel 18)" },
];

function safeChess(fen?: string): Chess {
  try {
    return new Chess(fen && fen.trim() ? fen : undefined);
  } catch {
    return new Chess();
  }
}

// Extrae el color ganador del tag [Result] del PGN ("1-0" -> blancas,
// "0-1" -> negras). Devuelve null si no hay resultado definido.
function getPgnWinner(pgn?: string | null): "white" | "black" | null {
  if (!pgn) return null;
  const match = pgn.match(/\[Result\s+"([^"]+)"\s*\]/i);
  if (!match) return null;
  if (match[1] === "1-0") return "white";
  if (match[1] === "0-1") return "black";
  return null;
}

// Determina qué color juega el usuario.
// - Si el objetivo es una victoria, el usuario juega el color ganador (según el
//   tag [Result] del PGN). Así Stockfish mueve el color contrario y, si le toca
//   según el FEN, abre la partida automáticamente.
// - Si el objetivo es tablas, el usuario juega el lado que mueve en la posición
//   inicial (pedagogía del libro).
function resolveUserColor(
  fen: string | undefined,
  targetResult: string | undefined,
  pgn?: string | null
): "white" | "black" {
  const turn = safeChess(fen).turn();
  if (targetResult === "win") {
    const winner = getPgnWinner(pgn);
    if (winner) return winner;
    // Sin PGN: por defecto asume 1-0 cuando mueven negras.
    return turn === "b" ? "white" : "black";
  }
  return turn === "w" ? "white" : "black";
}

function describeResult(
  target: string,
  status: PracticeStatus
): string {
  if (status === "won") {
    return target === "win"
      ? "¡Victoria! Has conseguido el objetivo de la lección."
      : "Has ganado la partida.";
  }
  if (status === "draw" || status === "stalemate") {
    return target === "draw"
      ? "¡Tablas! Has conseguido el objetivo de la lección."
      : "La partida terminó en tablas.";
  }
  if (status === "lost") return "Derrota. Intenta de nuevo con una estrategia diferente.";
  return "";
}

export function EndgamePracticeBoard({
  lesson,
  onMastered,
}: EndgamePracticeBoardProps) {
  const gameRef = useRef(safeChess(lesson.initial_fen));
  const masteredCalledRef = useRef(false);
  const lessonSlugRef = useRef(lesson.slug);

  const [position, setPosition] = useState(lesson.initial_fen);
  const [userColor, setUserColor] = useState<"white" | "black">(
    resolveUserColor(lesson.initial_fen, lesson.target_result)
  );
  const [orientation, setOrientation] = useState<"white" | "black">(userColor);
  const [status, setStatus] = useState<PracticeStatus>("ready");
  const [skillLevel, setSkillLevel] = useState("8");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [boardReady, setBoardReady] = useState(false);

  const { playMoveSound, playErrorSound } = useChessSounds();

  // Reset explícito al montar o cuando cambia la lección
  useEffect(() => {
    const game = safeChess(lesson.initial_fen);
    gameRef.current = game;
    setPosition(lesson.initial_fen);
    const uc = resolveUserColor(lesson.initial_fen, lesson.target_result, lesson.pgn_content);
    setUserColor(uc);
    setOrientation(uc);
    setLastMove(null);
    setMoveHistory([]);
    setStatus("ready");
    setErrorMessage(null);
    setBoardReady(false);
    masteredCalledRef.current = false;
    lessonSlugRef.current = lesson.slug;
    // Forzar re-render del tablero después de un tick
    requestAnimationFrame(() => setBoardReady(true));
  }, [lesson.slug, lesson.initial_fen, lesson.target_result, lesson.pgn_content]);

  const isUserTurn = useMemo(() => {
    return gameRef.current.turn() === userColor.charAt(0);
  }, [userColor, position]);

  // Detectar resultado de la partida
  const detectGameResult = useCallback(
    (game: Chess): PracticeStatus | null => {
      if (game.isGameOver()) {
        if (game.isCheckmate()) {
          // Tras un mate, el turno cambia al color que fue mateado.
          // Si game.turn() === userColor → al usuario le dieron mate → "lost"
          // Si game.turn() !== userColor → el usuario dio mate → "won"
          const loser = game.turn(); // color que tiene el turno = el que está en jaque mate
          return loser === userColor.charAt(0) ? "lost" : "won";
        }
        if (game.isStalemate()) return "stalemate";
        if (game.isDraw()) return "draw";
        return "draw";
      }
      return null;
    },
    [userColor]
  );

  // Llamar a Stockfish para que responda
  const fetchStockfishMove = useCallback(
    async (fen: string) => {
      setStatus("thinking");
      setErrorMessage(null);
      try {
        const response = await getStockfishMove(
          fen,
          parseInt(skillLevel, 10),
          0.5
        );

        const game = new Chess(fen);
        const move = game.move({
          from: response.move_uci.substring(0, 2),
          to: response.move_uci.substring(2, 4),
          promotion: response.move_uci.length > 4 ? response.move_uci[4] : undefined,
        });

        if (!move) {
          setStatus("error");
          setErrorMessage("Stockfish devolvió una jugada inválida.");
          return;
        }

        gameRef.current = game;
        setPosition(game.fen());
        setLastMove([move.from, move.to]);
        setMoveHistory((prev) => [...prev, response.move_uci]);
        playMoveSound();

        // Verificar si Stockfish ganó (mate contra el usuario)
        const result = detectGameResult(game);
        if (result) {
          setStatus(result);
          if (
            (result === "won" && lesson.target_result === "win") ||
            ((result === "draw" || result === "stalemate") &&
              lesson.target_result === "draw")
          ) {
            if (!masteredCalledRef.current) {
              masteredCalledRef.current = true;
              updateEndgameProgress(lesson.slug, "mastered", 0).catch((e) =>
                console.error("[EndgamePractice] Fallo al marcar mastered:", e),
              );
              onMastered?.();
            }
          }
          return;
        }

        setStatus("ready");
      } catch (err) {
        console.error("[PracticeBoard] Error de Stockfish:", err);
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Error al conectar con Stockfish."
        );
      }
    },
    [skillLevel, detectGameResult, playMoveSound, lesson.slug, lesson.target_result, onMastered]
  );

  // Si al iniciar le toca mover al motor (su color), que juegue la primera
  // jugada automáticamente.
  useEffect(() => {
    if (!boardReady || status !== "ready") return;
    if (gameRef.current.turn() !== userColor.charAt(0)) {
      fetchStockfishMove(gameRef.current.fen());
    }
  }, [boardReady, status, userColor, fetchStockfishMove]);

  // Cuando el usuario selecciona la pieza de promoción en el diálogo modal
  const onPromotionPieceSelect = useCallback((piece?: string) => {
    return !!piece;
  }, []);

  // Cuando el usuario hace una jugada
  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece?: string): boolean => {
      if (status !== "ready" || !isUserTurn) return false;

      const isPawnPiece = !!piece && piece.toUpperCase().endsWith("P");
      const isPromotionTarget =
        targetSquare[1] === "1" || targetSquare[1] === "8";

      // Si es una promoción pero aún no se ha elegido la pieza, no ejecutamos
      // la jugada: el diálogo de promoción (centrado) la gestionará y volverá
      // a llamar a onDrop con la pieza ya promocionada (p.ej. "wQ").
      if (isPawnPiece && isPromotionTarget) return true;

      const promotionChar =
        !isPawnPiece && piece ? piece[1].toLowerCase() : undefined;

      const game = new Chess(position);
      let move;
      try {
        move = game.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: promotionChar,
        });
      } catch {
        return false;
      }
      if (!move) return false;

      const uci = `${sourceSquare}${targetSquare}${move.promotion ? move.promotion : ""}`;
      gameRef.current = game;
      setPosition(game.fen());
      setLastMove([sourceSquare, targetSquare]);
      setMoveHistory((prev) => [...prev, uci]);
      playMoveSound();

      // Verificar si el usuario ganó
      const result = detectGameResult(game);
      if (result) {
        setStatus(result);
        if (
          (result === "won" && lesson.target_result === "win") ||
          ((result === "draw" || result === "stalemate") &&
            lesson.target_result === "draw")
        ) {
          if (!masteredCalledRef.current) {
            masteredCalledRef.current = true;
            updateEndgameProgress(lesson.slug, "mastered", 0).catch((e) =>
              console.error("[EndgamePractice] Fallo al marcar mastered:", e),
            );
            onMastered?.();
          }
        }
        return true;
      }

      // Pedir jugada a Stockfish
      fetchStockfishMove(game.fen());
      return true;
    },
    [status, isUserTurn, position, detectGameResult, fetchStockfishMove, playMoveSound, lesson.slug, lesson.target_result, onMastered]
  );

  const handleReset = useCallback(() => {
    const game = safeChess(lesson.initial_fen);
    gameRef.current = game;
    setPosition(lesson.initial_fen);
    const uc = resolveUserColor(lesson.initial_fen, lesson.target_result, lesson.pgn_content);
    setUserColor(uc);
    setOrientation(uc);
    setLastMove(null);
    setMoveHistory([]);
    setStatus("ready");
    setErrorMessage(null);
    masteredCalledRef.current = false;
  }, [lesson.initial_fen, lesson.target_result, lesson.pgn_content]);

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove[0]] = {
        boxShadow: "inset 0 0 0 4px rgba(59, 130, 246, 0.6)",
      };
      styles[lastMove[1]] = {
        boxShadow: "inset 0 0 0 4px rgba(59, 130, 246, 0.6)",
      };
    }
    return styles;
  }, [lastMove]);

  const statusAlert = useMemo(() => {
    switch (status) {
      case "thinking":
        return (
          <Alert>
            <Brain className="h-4 w-4 animate-pulse" />
            <AlertTitle>Stockfish está pensando...</AlertTitle>
            <AlertDescription>Calculando la mejor jugada.</AlertDescription>
          </Alert>
        );
      case "won":
        return (
          <Alert className="border-green-500 bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle className="text-lg font-bold">¡Victoria!</AlertTitle>
            <AlertDescription>{describeResult(lesson.target_result, status)}</AlertDescription>
          </Alert>
        );
      case "draw":
      case "stalemate":
        return lesson.target_result === "draw" ? (
          <Alert className="border-green-500 bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle className="text-lg font-bold">¡Tablas!</AlertTitle>
            <AlertDescription>{describeResult(lesson.target_result, status)}</AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-amber-500 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle className="text-lg font-bold">Tablas</AlertTitle>
            <AlertDescription>{describeResult(lesson.target_result, status)}</AlertDescription>
          </Alert>
        );
      case "lost":
        return (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle className="text-lg font-bold">Derrota</AlertTitle>
            <AlertDescription>{describeResult(lesson.target_result, status)}</AlertDescription>
          </Alert>
        );
      case "error":
        return (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{errorMessage || "Error desconocido."}</AlertDescription>
          </Alert>
        );
      default:
        return (
          <Alert>
            <Swords className="h-4 w-4" />
            <AlertTitle>
              Tu turno — Juegan {userColor === "white" ? "Blancas" : "Negras"}
            </AlertTitle>
            <AlertDescription>
              {lesson.target_result === "win"
                ? "Objetivo: ganar la posición."
                : lesson.target_result === "draw"
                ? "Objetivo: conseguir tablas."
                : "Juega la mejor jugada posible."}
            </AlertDescription>
          </Alert>
        );
    }
  }, [status, errorMessage, userColor, lesson.target_result]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Tablero */}
      <div className="w-full max-w-[640px]">
        <div className="mb-2 flex items-center justify-between">
          <Badge variant={isUserTurn && status === "ready" ? "default" : "secondary"}>
            {status === "thinking"
              ? "Stockfish jugando..."
              : isUserTurn
              ? "Tu turno"
              : "Turno del motor"}
          </Badge>
          <Button
            variant="outline"
            size="icon"
            aria-label="Girar tablero"
            title="Girar el tablero"
            onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
        <div className="aspect-square w-full overflow-hidden rounded-lg border">
          {boardReady ? (
            <DynamicChessboard
              key={`board-${lesson.slug}`}
              position={position}
              boardOrientation={orientation}
              onPieceDrop={onDrop}
              onPromotionPieceSelect={onPromotionPieceSelect}
              showPromotionDialog={true}
              promotionDialogVariant="modal"
              arePiecesDraggable={status === "ready" && isUserTurn}
              customSquareStyles={customSquareStyles}
              customBoardStyle={{ borderRadius: "0" }}
              animationDuration={300}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-muted/30">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Panel lateral */}
      <div className="w-full space-y-4 lg:w-80">
        {statusAlert}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Configuración</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="skill-level">
                Nivel de Stockfish
              </label>
              <select
                id="skill-level"
                value={skillLevel}
                onChange={(e) => setSkillLevel(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {SKILL_LEVELS.map((lvl) => (
                  <option key={lvl.value} value={lvl.value}>
                    {lvl.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleReset}
            >
              <RotateCcw className="h-4 w-4" />
              Reiniciar posición
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Historial de jugadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
              {moveHistory.length === 0 && (
                <p className="text-muted-foreground">Aún no hay jugadas.</p>
              )}
              {moveHistory.map((uci, i) => {
                const moveNum = Math.floor(i / 2) + 1;
                const isWhite = i % 2 === 0;
                return (
                  <div key={i} className="flex gap-2">
                    {isWhite && (
                      <span className="w-6 text-muted-foreground">{moveNum}.</span>
                    )}
                    {!isWhite && <span className="w-6" />}
                    <span>{uci}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
