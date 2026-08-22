"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChessSounds } from "@/hooks/useChessSounds";

const DynamicChessboard = dynamic(
  () => import("react-chessboard").then((mod) => ({ default: mod.Chessboard })),
  { ssr: false }
);

/* ------------------------------------------------------------------ */
/* Parser de PGN con Línea Principal, variantes (RAV) y comentarios.  */
/* ------------------------------------------------------------------ */

export interface PgnMoveNode {
  san: string;
  moveNumber: number;
  color: "w" | "b";
  /** Nº de semi-jugada desde el inicio (0 = posición inicial). */
  ply: number;
  /** FEN de la posición ANTERIOR a aplicar esta jugada. */
  fenBefore: string;
  /** FEN tras aplicar esta jugada. */
  fen: string;
  /** Comentario de posición situado justo antes de la jugada. */
  commentBefore?: string;
  /** Comentarios colocados después de la jugada. */
  commentsAfter: string[];
  /** Variantes que parten de esta jugada (cada una es una línea). */
  variations: PgnMoveNode[][];
  parent: PgnMoveNode | null;
  /** Siguiente jugada de la misma línea (null si es la última). */
  next: PgnMoveNode | null;
  /** true si la jugada pertenece a una variante (no a la línea principal). */
  inVariation: boolean;
}

export interface LichessReplayData {
  startFen: string;
  mainLine: PgnMoveNode[];
  totalPlies: number;
}

interface PgnParseCtx {
  tokens: string[];
  i: number;
}

function extractPgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of pgn.split(/\r?\n/)) {
    const m = /^\s*\[([A-Za-z0-9_]+)\s+"([^"]*)"\]/.exec(line);
    if (m) headers[m[1]] = m[2];
  }
  return headers;
}

function tokenizePgnMovetext(movetext: string): string[] {
  return movetext.match(/\{[^{}]*\}|\(|\)|[^\s]+/g) || [];
}

function parseLine(
  ctx: PgnParseCtx,
  game: Chess,
  parent: PgnMoveNode | null,
  inVariation: boolean,
  /** Nodo al que pertenece esta variante (null para la línea principal). */
  variationOf: PgnMoveNode | null = null
): PgnMoveNode[] {
  const nodes: PgnMoveNode[] = [];
  let pendingComment: string | undefined;

  while (ctx.i < ctx.tokens.length) {
    const tok = ctx.tokens[ctx.i];

    if (tok === ")") {
      ctx.i += 1;
      return nodes;
    }

    if (tok === "(") {
      ctx.i += 1;
      const attachTo = nodes[nodes.length - 1];
      if (attachTo) {
        // La variante reemplaza la jugada `attachTo`, así que parte de la
        // posición ANTERIOR a esa jugada.
        const varGame = new Chess(attachTo.fenBefore);
        const variation = parseLine(ctx, varGame, attachTo, true, attachTo);
        if (variation.length > 0) attachTo.variations.push(variation);
      } else {
        // Variación sin jugada previa: se consume sin enlazar.
        parseLine(ctx, new Chess(game.fen()), null, true, null);
      }
      continue;
    }

    if (tok.startsWith("{") && tok.endsWith("}")) {
      ctx.i += 1;
      const comment = tok.slice(1, -1).trim();
      if (nodes.length === 0) pendingComment = comment;
      else nodes[nodes.length - 1].commentsAfter.push(comment);
      continue;
    }

    if (/^\d+\.{1,3}$/.test(tok) || /^\.{1,3}$/.test(tok)) {
      ctx.i += 1;
      continue;
    }

    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) {
      ctx.i += 1;
      continue;
    }

    // Movimiento (SAN), posiblemente con número de jugada pegado (1.e4).
    ctx.i += 1;
    let san = tok;
    const prefixed = /^(\d+\.{1,3})+(.+)$/.exec(tok);
    if (prefixed) san = prefixed[prefixed.length - 1];

    const fenBefore = game.fen();
    let applied: { san: string; color: "w" | "b" } | null = null;
    try {
      const move = game.move(san);
      if (move) applied = { san: move.san, color: move.color };
    } catch {
      applied = null;
    }
    if (!applied) continue;

    const isFirstInLine = nodes.length === 0;
    const nodeParent = isFirstInLine ? parent : nodes[nodes.length - 1];
    // El primer movimiento de una variante ocupa el mismo número de jugada
    // que la jugada a la que sustituye en la línea principal.
    const ply = isFirstInLine && variationOf
      ? variationOf.ply
      : nodeParent
        ? nodeParent.ply + 1
        : 1;

    const node: PgnMoveNode = {
      san: applied.san,
      moveNumber: Math.floor((ply - 1) / 2) + 1,
      color: applied.color,
      ply,
      fenBefore,
      fen: game.fen(),
      commentBefore: pendingComment,
      commentsAfter: [],
      variations: [],
      parent: nodeParent,
      next: null,
      inVariation,
    };
    pendingComment = undefined;
    if (nodes.length > 0) nodes[nodes.length - 1].next = node;
    nodes.push(node);
  }
  return nodes;
}

export function parsePgnMoves(pgn: string): LichessReplayData | null {
  try {
    const headers = extractPgnHeaders(pgn);
    const startFen = headers["FEN"] || new Chess().fen();
    const game = new Chess(startFen);

    const movetext = pgn
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("["))
      .join(" ");

    const ctx: PgnParseCtx = { tokens: tokenizePgnMovetext(movetext), i: 0 };
    const mainLine = parseLine(ctx, game, null, false);
    if (mainLine.length === 0) return null;

    return {
      startFen,
      mainLine,
      totalPlies: mainLine[mainLine.length - 1].ply,
    };
  } catch {
    return null;
  }
}

/** Devuelve las cabeceras [Etiqueta "Valor"] de un PGN. */
export function parsePgnHeaders(pgn: string | null): Record<string, string> {
  if (!pgn) return {};
  try {
    return extractPgnHeaders(pgn);
  } catch {
    return {};
  }
}

function nodePath(node: PgnMoveNode): PgnMoveNode[] {
  const path: PgnMoveNode[] = [];
  let cur: PgnMoveNode | null = node;
  while (cur) {
    path.unshift(cur);
    cur = cur.parent;
  }
  return path;
}

/* ------------------------------------------------------------------ */
/* Componente                                                          */
/* ------------------------------------------------------------------ */

interface LichessReplayProps {
  pgn: string;
  title?: string;
  orientation?: "white" | "black";
  emptyMessage?: string;
  /** "stacked": tablero encima de la notación. "side": notación a la derecha. */
  layout?: "stacked" | "side";
  autoplayIntervalMs?: number;
  targetPly?: number;
}

export function LichessReplay({
  pgn,
  title = "Tablero Interactivo",
  orientation = "white",
  emptyMessage = "No hay movimientos que mostrar.",
  layout = "stacked",
  autoplayIntervalMs = 500,
  targetPly,
}: LichessReplayProps) {
  const data = useMemo(() => parsePgnMoves(pgn), [pgn]);
  const mainLine = useMemo(() => data?.mainLine ?? [], [data]);
  const totalPlies = data?.totalPlies ?? 0;
  const startFen = data?.startFen ?? new Chess().fen();

  const [currentPath, setCurrentPath] = useState<PgnMoveNode[]>([]);
  const [playing, setPlaying] = useState(false);
  // Orientación del tablero. Arranca con la perspectiva recibida (p.ej. la
  // del jugador con negras) pero siempre se puede alternar manualmente.
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">(
    orientation
  );

  const { playMoveSound } = useChessSounds();

  const pathRef = useRef<PgnMoveNode[]>([]);
  useEffect(() => {
    pathRef.current = currentPath;
  }, [currentPath]);

  const playingRef = useRef(false);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // Reiniciar al cambiar de partida.
  useEffect(() => {
    setCurrentPath([]);
    setPlaying(false);
    setBoardOrientation(orientation);
  }, [pgn, orientation]);

  const goToPly = useCallback((ply: number) => {
    setPlaying(false);
    if (ply === 0) {
      setCurrentPath([]);
      return;
    }
    const target = mainLine.find((n) => n.ply === ply) || mainLine[mainLine.length - 1];
    if (target) {
      setCurrentPath(nodePath(target));
    }
  }, [mainLine]);

  useEffect(() => {
    if (targetPly !== undefined) {
      goToPly(targetPly);
    }
  }, [targetPly, goToPly]);

  const currentPly = currentPath[currentPath.length - 1]?.ply ?? 0;

  // Sonido de jugada al avanzar (manual, autoplay o navegación). Se silencia
  // al cambiar de partida para evitar un sonido fantasma con el ply anterior.
  const prevPlyRef = useRef<number>(0);
  const prevPgnRef = useRef<string>(pgn);
  useEffect(() => {
    if (prevPgnRef.current !== pgn) {
      prevPgnRef.current = pgn;
      prevPlyRef.current = currentPly;
      return;
    }
    if (currentPly > prevPlyRef.current) {
      playMoveSound();
    }
    prevPlyRef.current = currentPly;
  }, [currentPly, pgn, playMoveSound]);

  const isAtEnd =
    mainLine.length > 0 &&
    currentPath[currentPath.length - 1] === mainLine[mainLine.length - 1];
  const isAtEndRef = useRef(false);
  useEffect(() => {
    isAtEndRef.current = isAtEnd;
  }, [isAtEnd]);

  const manualNext = useCallback(
    (path: PgnMoveNode[]): PgnMoveNode[] | null => {
      const last = path[path.length - 1];
      if (!last) return mainLine.length ? [mainLine[0]] : null;
      if (last.next) return [...path, last.next];
      if (last.variations.length > 0) return [...path, last.variations[0][0]];
      if (!last.inVariation) return null;
      let cur = last.parent;
      while (cur) {
        if (cur.next) return [...path, cur.next];
        if (cur.variations.length > 0) return [...path, cur.variations[0][0]];
        if (!cur.inVariation) return null;
        cur = cur.parent;
      }
      return null;
    },
    [mainLine]
  );

  const autoplayStep = useCallback(
    (path: PgnMoveNode[]): PgnMoveNode[] | null => {
      const last = path[path.length - 1];
      if (!last) return mainLine.length ? [mainLine[0]] : null;
      if (last.next) return [...path, last.next];
      if (!last.inVariation) return null;
      let cur = last.parent;
      while (cur) {
        if (cur.next) return [...path, cur.next];
        if (!cur.inVariation) return null;
        cur = cur.parent;
      }
      return null;
    },
    [mainLine]
  );

  // Autoplay: una jugada cada 500ms, se detiene al final de la partida.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const next = autoplayStep(pathRef.current);
      if (!next) {
        setPlaying(false);
        return;
      }
      setCurrentPath(next);
    }, autoplayIntervalMs);
    return () => window.clearInterval(id);
  }, [playing, autoplayIntervalMs, autoplayStep]);

  const goToNode = useCallback((node: PgnMoveNode) => {
    setPlaying(false);
    setCurrentPath(nodePath(node));
  }, []);

  const goPrev = useCallback(() => {
    setPlaying(false);
    setCurrentPath((p) => (p.length ? p.slice(0, -1) : p));
  }, []);

  const goNext = useCallback(() => {
    setPlaying(false);
    setCurrentPath((p) => manualNext(p) ?? p);
  }, [manualNext]);

  const goToStart = useCallback(() => {
    setPlaying(false);
    setCurrentPath([]);
  }, []);

  const goToEnd = useCallback(() => {
    setPlaying(false);
    if (mainLine.length) setCurrentPath([...mainLine]);
  }, [mainLine]);

  const handlePlayPause = useCallback(() => {
    // Si se pulsa Play estando en el final, se vuelve al inicio y se reproduce.
    const next = !playingRef.current;
    if (next && isAtEndRef.current) setCurrentPath([]);
    setPlaying(next);
  }, []);

  const toggleOrientation = useCallback(() => {
    setBoardOrientation((o) => (o === "white" ? "black" : "white"));
  }, []);

  // Navegación por teclado: ← retroceder, → avanzar, Espacio play/pausa.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        setCurrentPath((p) => (p.length ? p.slice(0, -1) : p));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        setCurrentPath((p) => manualNext(p) ?? p);
      } else if (e.key === " ") {
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [manualNext, handlePlayPause]);

  const currentFen = currentPath[currentPath.length - 1]?.fen ?? startFen;

  const navBar = (
    <div className="flex items-center justify-center gap-1.5 py-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Ir al inicio"
        title="Ir al inicio"
        onClick={goToStart}
        disabled={currentPly === 0}
      >
        <SkipBack className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Retroceder jugada"
        title="Retroceder jugada"
        onClick={goPrev}
        disabled={currentPly === 0}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="default"
        size="icon"
        aria-label={playing ? "Pausar partida" : "Reproducir partida"}
        title={playing ? "Pausar partida" : "Reproducir partida"}
        onClick={handlePlayPause}
        disabled={totalPlies === 0}
      >
        {playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Avanzar jugada"
        title="Avanzar jugada"
        onClick={goNext}
        disabled={isAtEnd}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Ir al final"
        title="Ir al final"
        onClick={goToEnd}
        disabled={isAtEnd}
      >
        <SkipForward className="h-4 w-4" />
      </Button>
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
  );

  const currentNode = currentPath[currentPath.length - 1] ?? null;

  const moveList = totalPlies === 0 ? (
    <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  ) : (
    <div className="max-h-[420px] overflow-y-auto pr-1 text-sm">
      <MoveLine
        nodes={mainLine}
        depth={0}
        currentNode={currentNode}
        onMove={goToNode}
      />
    </div>
  );

  const boardColumn = (
    <div className={cn(layout === "side" ? "w-full lg:w-[52%] lg:shrink-0" : "w-full")}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div
            className={cn(
              "w-full aspect-square mx-auto p-3",
              layout === "stacked" && "max-w-[720px]"
            )}
          >
            <DynamicChessboard
              position={currentFen}
              boardOrientation={boardOrientation}
              customBoardStyle={{ borderRadius: "4px" }}
              arePiecesDraggable={false}
            />
          </div>
        </CardContent>
      </Card>
      {navBar}
    </div>
  );

  const notationColumn = (
    <div className={cn("w-full", layout === "side" && "lg:flex-1 lg:min-w-0")}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg">Notación de la Partida</CardTitle>
            {totalPlies > 0 && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {currentPly} / {totalPlies}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>{moveList}</CardContent>
      </Card>
    </div>
  );

  if (layout === "side") {
    return (
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        {boardColumn}
        {notationColumn}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {boardColumn}
      {notationColumn}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Render de la notación (flujo continuo + variantes indentadas)      */
/* ------------------------------------------------------------------ */

function MoveLine({
  nodes,
  depth,
  currentNode,
  onMove,
}: {
  nodes: PgnMoveNode[];
  depth: number;
  currentNode: PgnMoveNode | null;
  onMove: (node: PgnMoveNode) => void;
}) {
  return (
    <div
      data-variant-line={depth > 0 ? "true" : undefined}
      className={cn(
        "flex flex-wrap items-start gap-x-1 gap-y-2",
        depth > 0 &&
          "mt-1 ml-4 rounded-md border-l-2 border-border bg-muted/40 px-2 py-1 text-xs dark:bg-white/[0.04]"
      )}
    >
      {nodes.map((node) => {
        const isCurrent = currentNode === node;
        return (
          <Fragment key={node.ply}>
            {node.color === "w" && (
              <span className="mr-0.5 font-semibold text-muted-foreground">
                {node.moveNumber}.
              </span>
            )}
            <span className="inline-flex flex-col items-start">
              {node.commentBefore && (
                <span
                  data-move-comment="before"
                  className="mb-0.5 max-w-[220px] text-[10px] italic leading-tight text-muted-foreground"
                >
                  {node.commentBefore}
                </span>
              )}
              <button
                type="button"
                onClick={() => onMove(node)}
                className={cn(
                  "cursor-pointer rounded px-1 py-0.5 transition-colors",
                  isCurrent
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                {node.san}
              </button>
              {node.commentsAfter.map((comment, i) => (
                <span
                  key={i}
                  data-move-comment="after"
                  className="mt-0.5 max-w-[220px] text-[10px] leading-tight text-muted-foreground"
                >
                  {comment}
                </span>
              ))}
            </span>
            {node.variations.length > 0 && (
              <span className="w-full">
                {node.variations.map((variation, i) => (
                  <MoveLine
                    key={`${node.ply}-v${i}`}
                    nodes={variation}
                    depth={depth + 1}
                    currentNode={currentNode}
                    onMove={onMove}
                  />
                ))}
              </span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
