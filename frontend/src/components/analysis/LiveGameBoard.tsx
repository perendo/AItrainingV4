"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Undo2,
  RotateCcw,
  Flag,
  Loader2,
  Play,
  CheckCircle2,
} from "lucide-react";
import { saveAnalysisDraft } from "@/lib/api";
import { useChessSounds } from "@/hooks/useChessSounds";

const DynamicChessboard = dynamic(
  () => import("react-chessboard").then((mod) => ({ default: mod.Chessboard })),
  { ssr: false }
);

function resultFor(g: Chess): string {
  if (g.isCheckmate()) return g.turn() === "w" ? "0-1" : "1-0";
  if (g.isDraw()) return "1/2-1/2";
  return "*";
}

export function LiveGameBoard() {
  const router = useRouter();
  const gameRef = useRef(new Chess());
  const { playMoveSound } = useChessSounds();
  const [fen, setFen] = useState(gameRef.current.fen());
  const [whitePlayer, setWhitePlayer] = useState("");
  const [blackPlayer, setBlackPlayer] = useState("");
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moves = useMemo(() => {
    return gameRef.current.history({ verbose: true });
  }, [fen]);

  const game = useMemo(() => new Chess(fen), [fen]);

  const groupedMoves = useMemo(() => {
    const groups: Array<{
      moveNumber: number;
      white?: { san: string };
      black?: { san: string };
    }> = [];
    moves.forEach((move, i) => {
      const moveNumber = Math.floor(i / 2) + 1;
      if (move.color === "w") {
        groups.push({ moveNumber, white: { san: move.san } });
      } else {
        const last = groups[groups.length - 1];
        if (last && last.moveNumber === moveNumber) {
          last.black = { san: move.san };
        } else {
          groups.push({ moveNumber, black: { san: move.san } });
        }
      }
    });
    return groups;
  }, [moves]);

  const pgnPreview = useMemo(() => {
    try {
      const history = gameRef.current.history();
      if (history.length === 0) return "";
      const g = new Chess();
      for (const san of history) {
        g.move(san);
      }
      g.setHeader("White", whitePlayer.trim() || "Blancas");
      g.setHeader("Black", blackPlayer.trim() || "Negras");
      g.setHeader("Result", resultFor(g));
      return g.pgn();
    } catch {
      return "";
    }
  }, [fen, whitePlayer, blackPlayer]);

  const status = useMemo(() => {
    if (game.isCheckmate()) {
      return game.turn() === "w" ? "Jaque mate — ganan Negras" : "Jaque mate — ganan Blancas";
    }
    if (game.isDraw()) return "Tablas";
    return game.turn() === "w" ? "Juegan Blancas" : "Juegan Negras";
  }, [game]);

  // Ctrl+V para pegar PGN desde portapapeles
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const text = e.clipboardData?.getData("text") || "";
      if (!text.trim()) return;
      const g = new Chess();
      try {
        g.loadPgn(text);
      } catch {
        return;
      }
      const history = g.history();
      if (history.length === 0) return;
      e.preventDefault();
      gameRef.current = new Chess();
      for (const san of history) {
        gameRef.current.move(san);
      }
      const headers = g.getHeaders();
      const white = headers.White;
      const black = headers.Black;
      if (white && white !== "?" && white !== "Blancas") setWhitePlayer(white);
      if (black && black !== "?" && black !== "Negras") setBlackPlayer(black);
      setFen(gameRef.current.fen());
      setLastMove(null);
      setError(null);
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  const handleDrop = (
    sourceSquare: string,
    targetSquare: string,
    piece: string
  ): boolean => {
    if (game.isGameOver()) return false;

    const isPromotion =
      piece.toUpperCase().endsWith("P") &&
      (targetSquare.endsWith("1") || targetSquare.endsWith("8"));

    const g = gameRef.current;
    try {
      const move = g.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: isPromotion ? "q" : undefined,
      });
      if (!move) return false;
    } catch {
      return false;
    }

    setFen(g.fen());
    setLastMove([sourceSquare, targetSquare]);
    playMoveSound();
    return true;
  };

  const handleUndo = () => {
    const g = gameRef.current;
    g.undo();
    setFen(g.fen());
    setLastMove(null);
  };

  const handleReset = () => {
    gameRef.current = new Chess();
    setFen(gameRef.current.fen());
    setLastMove(null);
    setError(null);
  };

  const handleFinish = async () => {
    setSaving(true);
    setError(null);
    try {
      const g = gameRef.current;
      const whiteName = whitePlayer.trim() || "Blancas";
      const blackName = blackPlayer.trim() || "Negras";
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, ".");

      g.setHeader("Event", "Partida 1v1 Local");
      g.setHeader("Site", "EntrenadorIA");
      g.setHeader("Date", today);
      g.setHeader("White", whiteName);
      g.setHeader("Black", blackName);
      g.setHeader("Result", resultFor(g));

      const pgn = g.pgn();

      const analysis = await saveAnalysisDraft({
        game_type: "USER",
        white_player: whiteName,
        black_player: blackName,
        pgn,
      });

      router.push(`/historico/${analysis.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar la partida.");
      setSaving(false);
    }
  };

  const hasMoves = moves.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Jugar 1 contra 1</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Anota tu partida en vivo: mueve las piezas alternando turnos y el PGN se
          registra automáticamente. Ideal para pasar planillas de torneos de liga a mano.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Board */}
        <div className="w-full lg:w-[55%] space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="w-full aspect-square max-w-[720px] mx-auto">
                <DynamicChessboard
                  position={fen}
                  onPieceDrop={handleDrop}
                  boardOrientation="white"
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
              <p className="mt-3 text-center text-sm font-medium text-primary">
                {status}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleUndo} disabled={!hasMoves}>
                  <Undo2 className="mr-2 h-4 w-4" />
                  Deshacer
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reiniciar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Side panel */}
        <div className="w-full lg:w-[45%] space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Jugadores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="live_white" className="block text-sm font-medium mb-1">
                  Jugador de Blancas
                </Label>
                <Input
                  id="live_white"
                  value={whitePlayer}
                  onChange={(e) => setWhitePlayer(e.target.value)}
                  placeholder="Nombre de las Blancas..."
                />
              </div>
              <div>
                <Label htmlFor="live_black" className="block text-sm font-medium mb-1">
                  Jugador de Negras
                </Label>
                <Input
                  id="live_black"
                  value={blackPlayer}
                  onChange={(e) => setBlackPlayer(e.target.value)}
                  placeholder="Nombre de las Negras..."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Notación (PGN)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {hasMoves ? (
                <div className="text-sm max-h-40 overflow-y-auto">
                  {groupedMoves.map((group, i) => (
                    <div key={i} className="flex flex-wrap gap-x-2 gap-y-1 mb-1">
                      <span className="font-bold mr-1">{group.moveNumber}.</span>
                      {group.white && <span>{group.white.san}</span>}
                      {group.black && <span>{group.black.san}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aún no hay movimientos. Mueve una pieza para comenzar.
                </p>
              )}
              <Textarea
                readOnly
                value={pgnPreview}
                rows={6}
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>

          <Button
            onClick={handleFinish}
            disabled={saving || !hasMoves}
            className="w-full py-3 text-lg font-semibold"
            size="lg"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Registrando partida...
              </>
            ) : (
              <>
                <Flag className="mr-2 h-5 w-5" />
                Finalizar y Analizar esta partida
              </>
            )}
          </Button>

          {hasMoves && !saving && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Play className="h-3 w-3" />
              Al finalizar, la partida se guardará en el Histórico como &quot;Pendiente de Análisis&quot;
              para que la evalúes y la envíes al Gran Maestro.
            </p>
          )}

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {!hasMoves && !saving && (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              <CheckCircle2 className="mr-1 inline h-4 w-4 text-green-500" />
              El tablero permite arrastrar las piezas libremente alternando turnos.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
