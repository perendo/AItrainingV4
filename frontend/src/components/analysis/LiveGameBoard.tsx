"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  MessageSquarePlus,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useChessSounds } from "@/hooks/useChessSounds";
import type { TaskResponse } from "@/lib/types";

const DynamicChessboard = dynamic(
  () => import("react-chessboard").then((mod) => ({ default: mod.Chessboard })),
  { ssr: false }
);

function resultFor(g: Chess): string {
  if (g.isCheckmate()) return g.turn() === "w" ? "0-1" : "1-0";
  if (g.isDraw()) return "1/2-1/2";
  return "*";
}

const RESULT_OPTIONS = [
  { value: "auto", label: "Auto (detectar)" },
  { value: "1-0", label: "1-0  Blancas" },
  { value: "0-1", label: "0-1  Negras" },
  { value: "1/2-1/2", label: "1/2-1/2  Tablas" },
  { value: "*", label: "*  Sin resultado" },
];

export function LiveGameBoard() {
  const router = useRouter();
  const gameRef = useRef(new Chess());
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const { playMoveSound } = useChessSounds();
  const [fen, setFen] = useState(gameRef.current.fen());
  const [whitePlayer, setWhitePlayer] = useState("");
  const [blackPlayer, setBlackPlayer] = useState("");
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameResult, setGameResult] = useState("auto");
  const [comments, setComments] = useState<Record<number, string>>({});
  const [commentText, setCommentText] = useState("");

  const moves = useMemo(() => {
    return gameRef.current.history({ verbose: true });
  }, [fen]);

  // Usar gameRef.current (no new Chess(fen)) para que el historial de
  // jugadas persista y chess.js detecte la triple repetición. new Chess(fen)
  // reconstruye la posición sin historial, así que solo funciona la regla de
  // 50 movimientos (que viene en el FEN). Al depender de [fen], se recalcula
  // en cada jugada.
  const game = useMemo(() => gameRef.current, [fen]);

  const groupedMoves = useMemo(() => {
    const groups: Array<{
      moveNumber: number;
      white?: { san: string; idx: number };
      black?: { san: string; idx: number };
    }> = [];
    moves.forEach((move, i) => {
      const moveNumber = Math.floor(i / 2) + 1;
      if (move.color === "w") {
        groups.push({ moveNumber, white: { san: move.san, idx: i } });
      } else {
        const last = groups[groups.length - 1];
        if (last && last.moveNumber === moveNumber) {
          last.black = { san: move.san, idx: i };
        } else {
          groups.push({ moveNumber, black: { san: move.san, idx: i } });
        }
      }
    });
    return groups;
  }, [moves]);

  const effectiveResult = useMemo(() => {
    if (gameResult !== "auto") return gameResult;
    return resultFor(game);
  }, [gameResult, game]);

  const pgnPreview = useMemo(() => {
    try {
      const history = gameRef.current.history();
      if (history.length === 0) return "";
      const parts: string[] = [];
      for (let i = 0; i < history.length; i++) {
        const san = history[i];
        if (i % 2 === 0) {
          parts.push(`${Math.floor(i / 2) + 1}.`);
        }
        parts.push(san);
        if (comments[i]) {
          parts.push(`{${comments[i]}}`);
        }
      }
      parts.push(effectiveResult);
      return parts.join(" ");
    } catch {
      return "";
    }
  }, [fen, whitePlayer, blackPlayer, comments, effectiveResult]);

  const status = useMemo(() => {
    if (game.isCheckmate()) {
      return game.turn() === "w" ? "Jaque mate — ganan Negras" : "Jaque mate — ganan Blancas";
    }
    if (game.isDraw()) return "Tablas";
    return game.turn() === "w" ? "Juegan Blancas" : "Juegan Negras";
  }, [game]);

  const addComment = useCallback(() => {
    const text = commentText.trim();
    if (!text || moves.length === 0) return;
    const idx = moves.length - 1;
    setComments((prev) => ({ ...prev, [idx]: text }));
    setCommentText("");
  }, [commentText, moves.length]);

  const lastMoveIdx = moves.length > 0 ? moves.length - 1 : -1;
  const existingComment = lastMoveIdx >= 0 ? comments[lastMoveIdx] : undefined;

  const [pgnInput, setPgnInput] = useState("");

  const loadPgnFromText = useCallback(
    (text: string) => {
      if (!text.trim()) return false;
      const g = new Chess();
      try {
        g.loadPgn(text);
      } catch {
        return false;
      }
      const history = g.history();
      if (history.length === 0) return false;
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
      setComments({});
      setGameResult("auto");
      setPgnInput("");
      return true;
    },
    []
  );

  const handlePgnBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      const text = e.currentTarget.value;
      if (text.trim() && text !== pgnPreview) {
        loadPgnFromText(text);
      } else {
        setPgnInput("");
      }
    },
    [pgnPreview, loadPgnFromText]
  );

  const handlePgnChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPgnInput(e.currentTarget.value);
    },
    []
  );

  // Ctrl+V global (fuera de inputs): delega en loadPgnFromText
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const text = e.clipboardData?.getData("text") || "";
      if (loadPgnFromText(text)) e.preventDefault();
    },
    [loadPgnFromText]
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  // Sincronizar pgnInput con pgnPreview cuando no hay input del usuario
  useEffect(() => {
    if (!pgnInput) setPgnInput(pgnPreview);
  }, [pgnPreview, pgnInput]);

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
    setComments({});
    setGameResult("auto");
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
      g.setHeader("Result", effectiveResult);

      const h = g.getHeaders();
      const headerLines = [
        `[Event "${h.Event || ""}"]`,
        `[Site "${h.Site || ""}"]`,
        `[Date "${h.Date || ""}"]`,
        `[White "${h.White || ""}"]`,
        `[Black "${h.Black || ""}"]`,
        `[Result "${effectiveResult}"]`,
        "",
      ].join("\n");

      const history = g.history();
      const pgnParts: string[] = [];
      for (let i = 0; i < history.length; i++) {
        const san = history[i];
        if (i % 2 === 0) {
          pgnParts.push(`${Math.floor(i / 2) + 1}.`);
        }
        pgnParts.push(san);
        if (comments[i]) {
          pgnParts.push(`{${comments[i]}}`);
        }
      }
      pgnParts.push(effectiveResult);

      const pgn = `${headerLines}\n${pgnParts.join(" ")}`;

      const blob = new Blob([pgn], { type: "application/x-chess-pgn" });
      const filename = `1v1_${whiteName}_vs_${blackName}_${today}.pgn`;
      const file = new File([blob], filename, { type: "application/x-chess-pgn" });

      const formData = new FormData();
      formData.append("file", file);

      await apiFetch<TaskResponse>("/api/v1/games/upload-pgn", {
        method: "POST",
        body: formData,
      });

      router.push("/partidas");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Error al registrar la partida.");
      }
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
              <div
                ref={boardContainerRef}
                className="w-full aspect-square max-w-[720px] mx-auto"
              >
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
              <CardTitle className="text-lg">Resultado</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                id="game-result"
                value={gameResult}
                onChange={(e) => setGameResult(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {RESULT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Notación (PGN)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {hasMoves ? (
                <div className="text-sm max-h-48 overflow-y-auto space-y-1">
                  {groupedMoves.map((group, i) => (
                    <div key={i}>
                      <div className="flex flex-wrap gap-x-2 gap-y-1">
                        <span className="font-bold mr-1">{group.moveNumber}.</span>
                        {group.white && <span>{group.white.san}</span>}
                        {group.black && <span>{group.black.san}</span>}
                      </div>
                      {group.white && comments[group.white.idx] && (
                        <p className="ml-6 text-xs italic text-muted-foreground">
                          {comments[group.white.idx]}
                        </p>
                      )}
                      {group.black && comments[group.black.idx] && (
                        <p className="ml-6 text-xs italic text-muted-foreground">
                          {comments[group.black.idx]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aún no hay movimientos. Mueve una pieza para comenzar.
                </p>
              )}

              {hasMoves && (
                <div className="flex gap-2">
                  <Input
                    ref={commentInputRef}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addComment();
                      }
                    }}
                    placeholder={
                      existingComment
                        ? `Último comentario: "${existingComment}"`
                        : "Comentario para la última jugada..."
                    }
                    className="text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={addComment}
                    disabled={!commentText.trim()}
                    title="Añadir comentario"
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <Textarea
                value={pgnInput}
                onChange={handlePgnChange}
                onBlur={handlePgnBlur}
                rows={6}
                placeholder="Pega un PGN aquí y pulsa Tab/Click fuera para cargarlo..."
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
                Finalizar y Guardar
              </>
            )}
          </Button>

          {hasMoves && !saving && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Play className="h-3 w-3" />
              Al finalizar, la partida se analizará con Stockfish y se guardará en tu historial de partidas.
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
              Puedes pegar un PGN con Ctrl+V.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
