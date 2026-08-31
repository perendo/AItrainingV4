"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Swords,
  Brain,
  RotateCcw,
  Save,
  CheckCircle,
  XCircle,
  Flag,
} from "lucide-react";
import { useChessSounds } from "@/hooks/useChessSounds";
import { getStockfishMove } from "@/lib/api";
import { buildGuidedOpeningPgn } from "@/lib/pgn";

const DynamicChessboard = dynamic(
  () => import("react-chessboard").then((mod) => ({ default: mod.Chessboard })),
  { ssr: false },
);

type StockfishGameStatus =
  | "ready"
  | "thinking"
  | "won"
  | "lost"
  | "draw"
  | "stalemate"
  | "error";

export interface OpeningStockfishBoardProps {
  /** FEN inicial del medio juego (el out_of_theory_fen de la teórica). */
  initialFen: string;
  /** Color con el que juega el usuario. */
  userColor: "w" | "b";
  /** Jugadas SAN de la apertura (para componer el PGN completo al guardar). */
  basePgnMoves: { san: string }[];
  openingName?: string;
  ecoCode?: string;
  /** Nombre real del usuario que jugará, para el registro del histórico. */
  userName: string;
  /** Hook que permite saber si el GM ya terminó la auditoría (para el banner). */
  auditDone?: boolean;
  /**
   * Notifica cada cambio de la partida: el PGN completo (apertura + medio juego)
   * y el resultado real de la partida. El padre lo guarda para poder perseguirlo
   * cuando el usuario guarda o abandona.
   */
  onPgnChange: (pgn: string, result: string) => void;
  /**
   * Se dispara una única vez cuando la partida termina de forma natural
   * (jaque mate, ahogado, regla de 50 jugadas o triple repetición). Recibe el
   * PGN completo final y su resultado para que el padre lo registre
   * automáticamente en el histórico.
   */
  onGameEnded: (pgn: string, result: string) => void;
  /** Guarda la partida completa con su resultado real y sale del tablero. */
  onSave: () => void;
  /**
   * Abandona la partida: se registra en el histórico con derrota del usuario
   * (el motor gana automáticamente). Recibe el PGN con ese resultado forzado.
   */
  onAbandon: (pgn: string) => void;
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

function describeResult(status: StockfishGameStatus): string {
  switch (status) {
    case "won":
      return "¡Has ganado la partida!";
    case "lost":
      return "Stockfish te ha ganado. Inténtalo de nuevo.";
    case "draw":
    case "stalemate":
      return "La partida terminó en tablas.";
    default:
      return "";
  }
}

export function OpeningStockfishBoard({
  initialFen,
  userColor,
  basePgnMoves,
  openingName,
  ecoCode,
  userName,
  auditDone = false,
  onPgnChange,
  onGameEnded,
  onSave,
  onAbandon,
}: OpeningStockfishBoardProps) {
  const gameRef = useRef(safeChess(initialFen));
  const engineColor = userColor === "w" ? "b" : "w";

  const [position, setPosition] = useState(initialFen);
  const [status, setStatus] = useState<StockfishGameStatus>("ready");
  const [skillLevel, setSkillLevel] = useState("8");
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [boardReady, setBoardReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [continuationMoves, setContinuationMoves] = useState<string[]>([]);

  const { playMoveSound, playErrorSound, playNotifySound } = useChessSounds();

  const orientation = userColor === "b" ? "black" : "white";
  const resultRef = useRef<"1-0" | "0-1" | "1/2-1/2" | "*">("*");
  const gameOverRef = useRef(false);
  const gameEndNotifiedRef = useRef(false);

  // La partida completa arranca con la posición inicial; las jugadas del
  // medio juego se añaden sobre la instancia persistente que parte del FEN
  // de salida de la teórica. Para componer el PGN completo reconstruimos el
  // juego desde el inicio con todas las jugadas SAN.
  const applyPath = useCallback((fen: string) => {
    const g = safeChess(fen);
    gameRef.current = g;
    setPosition(g.fen());
    setLastMove(null);
    setContinuationMoves([]);
    setStatus("ready");
    setErrorMessage(null);
    gameOverRef.current = false;
    resultRef.current = "*";
    gameEndNotifiedRef.current = false;
  }, []);

  useEffect(() => {
    const g = safeChess(initialFen);
    gameRef.current = g;
    setPosition(initialFen);
    setStatus("ready");
    setLastMove(null);
    setErrorMessage(null);
    setBoardReady(false);
    setContinuationMoves([]);
    gameOverRef.current = false;
    gameEndNotifiedRef.current = false;
    requestAnimationFrame(() => setBoardReady(true));
  }, [initialFen]);

  // `position` no se usa en el cuerpo pero es la señal reactiva del turno:
  // gameRef es un ref no reactivo y el turno debe recalcularse tras cada
  // jugada (que actualiza `position`). La regla de dependencias exhaustivas se
  // desactiva porque es intencional.
  /* eslint-disable react-hooks/exhaustive-deps */
  const isUserTurn = useMemo(() => {
    return gameRef.current.turn() === userColor;
  }, [userColor, position]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Detectar resultado de la partida usando la instancia persistente para
  // conservar el historial de posiciones (triple repetición y regla de 50).
  const detectGameResult = useCallback(
    (game: Chess): StockfishGameStatus | null => {
      if (!game.isGameOver()) return null;
      if (game.isCheckmate()) {
        const loser = game.turn(); // el color con el turno es el mateado
        if (loser === engineColor) {
          resultRef.current = "1-0";
          return "won";
        }
        resultRef.current = "0-1";
        return "lost";
      }
      if (game.isStalemate()) {
        resultRef.current = "1/2-1/2";
        return "stalemate";
      }
      if (game.isDraw()) {
        resultRef.current = "1/2-1/2";
        return "draw";
      }
      resultRef.current = "*";
      return "draw";
    },
    [engineColor],
  );

  // Componer el PGN completo (apertura + medio juego) a partir de la lista de
  // jugadas del medio juego y de un resultado dado. Se usa tanto para el PGN
  // "en vivo" (resultado real) como para el abandono (resultado forzado).
  const buildCompletePgn = useCallback(
    (sanList: string[], result: string) => {
      const allMoves: { san: string }[] = [
        ...basePgnMoves,
        ...sanList.map((san) => ({ san })),
      ];
      const white = userColor === "w" ? userName : "Stockfish";
      const black = userColor === "b" ? userName : "Stockfish";
      return buildGuidedOpeningPgn({
        moves: allMoves,
        whitePlayer: white,
        blackPlayer: black,
        openingName,
        ecoCode,
        result,
      });
    },
    [basePgnMoves, userColor, userName, openingName, ecoCode],
  );

  const finalize = useCallback(
    (game: Chess, latestSan?: string) => {
      const result = detectGameResult(game);
      if (result) {
        setStatus(result);
        playNotifySound();
        gameOverRef.current = true;
        // Avisa al padre una sola vez (al terminar la partida de forma natural)
        // para que registre el resultado real en el histórico automáticamente.
        // `continuationMoves` es el estado anterior a la última jugada, así que
        // se añade `latestSan` en su lista para no perder la jugada final.
        if (!gameEndNotifiedRef.current) {
          gameEndNotifiedRef.current = true;
          const finalSanList = latestSan
            ? [...continuationMoves, latestSan]
            : continuationMoves;
          onGameEnded(
            buildCompletePgn(finalSanList, resultRef.current),
            resultRef.current,
          );
        }
      }
      return result;
    },
    [
      detectGameResult,
      playNotifySound,
      onGameEnded,
      continuationMoves,
      buildCompletePgn,
    ],
  );

  const fetchStockfishMove = useCallback(async (fen: string) => {
    setStatus("thinking");
    setErrorMessage(null);
    try {
      const response = await getStockfishMove(
        fen,
        parseInt(skillLevel, 10),
        0.5,
      );

      const game = gameRef.current;
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
      setContinuationMoves((prev) => [...prev, move.san]);
      playMoveSound();

      if (finalize(game, move.san)) return;

      setStatus("ready");
    } catch (err) {
      console.error("[OpeningStockfish] Error del motor:", err);
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Error al conectar con Stockfish.",
      );
    }
  }, [skillLevel, playMoveSound, finalize]);

  // Si al iniciar le toca mover al motor, que juegue la primera jugada.
  useEffect(() => {
    if (!boardReady || status !== "ready") return;
    if (gameRef.current.turn() !== userColor) {
      void fetchStockfishMove(gameRef.current.fen());
    }
  }, [boardReady, status, userColor, fetchStockfishMove]);

  const onPromotionPieceSelect = useCallback((piece?: string) => !!piece, []);

  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece?: string): boolean => {
      if (status !== "ready" || !isUserTurn) return false;

      const isPawnPiece = !!piece && piece.toUpperCase().endsWith("P");
      const isPromotionTarget =
        targetSquare[1] === "1" || targetSquare[1] === "8";
      if (isPawnPiece && isPromotionTarget) return true;

      const promotionChar =
        !isPawnPiece && piece ? piece[1].toLowerCase() : undefined;

      const game = gameRef.current;
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

      gameRef.current = game;
      setPosition(game.fen());
      setLastMove([sourceSquare, targetSquare]);
      setContinuationMoves((prev) => [...prev, move.san]);
      playMoveSound();

      if (finalize(game, move.san)) return true;

      void fetchStockfishMove(game.fen());
      return true;
    },
    [status, isUserTurn, finalize, fetchStockfishMove, playMoveSound],
  );

  // Componer el PGN "en vivo" (apertura + medio juego) con el resultado real.
  const fullPgn = useMemo(
    () => buildCompletePgn(continuationMoves, resultRef.current),
    [continuationMoves, buildCompletePgn],
  );

  // Mantiene al padre al día del PGN completo y del resultado real, para que
  // pueda registrarlo en el histórico cuando el usuario guarde o abandone.
  useEffect(() => {
    onPgnChange(fullPgn, resultRef.current);
  }, [fullPgn, onPgnChange]);

  // Guardar la partida completa: el padre usa el último PGN notificado
  // (que ya refleja el resultado real de la partida).
  const handleSave = useCallback(() => {
    setSaving(true);
    setErrorMessage(null);
    try {
      onSave();
      playNotifySound();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "No se pudo guardar la partida.",
      );
      playErrorSound();
    } finally {
      setSaving(false);
    }
  }, [onSave, playNotifySound, playErrorSound]);

  // Abandonar: el motor gana automáticamente, así que se construye un PGN con
  // derrota forzada del usuario (resultado contrario a su color) y se lo pasa
  // al padre para que lo registre en el histórico antes de salir.
  const handleAbandon = useCallback(() => {
    const forcedLoss: "1-0" | "0-1" = userColor === "w" ? "0-1" : "1-0";
    const abandonPgn = buildCompletePgn(continuationMoves, forcedLoss);
    onAbandon(abandonPgn);
    playErrorSound();
  }, [continuationMoves, userColor, buildCompletePgn, onAbandon, playErrorSound]);

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

  const statusText = (() => {
    switch (status) {
      case "thinking":
        return "Stockfish está pensando…";
      case "won":
        return "¡Has ganado!";
      case "lost":
        return "Ha ganado Stockfish.";
      case "draw":
      case "stalemate":
        return "Tablas.";
      case "error":
        return errorMessage || "Error del motor.";
      default:
        return isUserTurn
          ? `Juegan tus ${userColor === "w" ? "blancas" : "negras"}`
          : "Turno del motor…";
    }
  })();

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Tablero */}
      <div className="w-full lg:w-[55%]">
        <div className="mb-2 flex items-center justify-between">
          <Badge variant={status === "ready" && isUserTurn ? "default" : "secondary"}>
            {status === "thinking" ? "Stockfish jugando…" : statusText}
          </Badge>
          {!gameOverRef.current && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => applyPath(initialFen)}
            >
              <RotateCcw className="h-4 w-4" />
              Reiniciar medio juego
            </Button>
          )}
        </div>
        <div className="aspect-square w-full overflow-hidden rounded-lg border">
          {boardReady ? (
            <DynamicChessboard
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
      <div className="w-full space-y-4 lg:w-[45%]">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm">
              <Swords className="h-5 w-5 text-primary" />
              <span className="font-semibold">
                Continúa contra Stockfish desde {openingName ?? "la posición de salida"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Juegas con{" "}
              <Badge variant="secondary">
                {userColor === "w" ? "Blancas" : "Negras"}
              </Badge>{" "}
              contra el motor. Aplica tu plan estratégico hasta el final: jaque
              mate, ahogado, regla de 50 jugadas o triple repetición se detectan
              automáticamente.
            </p>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="opening-skill-level"
              >
                Nivel de Stockfish
              </label>
              <select
                id="opening-skill-level"
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

            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                {errorMessage}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button
                className="w-full gap-2"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Save className="h-5 w-5" />
                )}
                Guardar partida y ver informe
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={saving}
                onClick={handleAbandon}
              >
                <Flag className="h-5 w-5" />
                Abandonar partida (gana el motor) y guardar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
