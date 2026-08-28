"use client";

import { useCallback, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { getBookMove } from "@/lib/api";
import { GuidedOpening } from "@/lib/openings";
import { BookMoveItem } from "@/lib/types";
import { START_FEN } from "@/lib/pgn";
import { useChessSounds } from "@/hooks/useChessSounds";

export type GuidedOpeningPhase = "setup" | "playing" | "paused" | "done";

export interface PlayedMove {
  san: string;
  side: "w" | "b";
  /** "book" = jugada preferida por el libro (o la línea de referencia de la apertura). */
  by: "user" | "book";
}

export interface TheoryEnd {
  /** Semicompás (1-based) en el que la posición dejó de estar en teoría. */
  ply: number;
  moveNumber: number;
  /** San de la última jugada (la que salió del libro), o null si se terminó a mano. */
  deviationMove: string | null;
  /** FEN de la última posición que seguía en el libro. */
  lastTheoryFen: string;
  /** FEN de salida de la teórica (la posición actual). */
  outOfTheoryFen: string;
  finishedManually: boolean;
}

export interface UseGuidedOpeningReturn {
  phase: GuidedOpeningPhase;
  fen: string;
  orientation: "white" | "black";
  opening: GuidedOpening | null;
  userColor: "w" | "b" | null;
  moves: PlayedMove[];
  lastMove: [string, string] | null;
  isUserTurn: boolean;
  bookBusy: boolean;
  theoryEnd: TheoryEnd | null;
  hint: BookMoveItem[] | null;
  hintLoading: boolean;
  error: string | null;
  start: (opening: GuidedOpening, color: "w" | "b") => void;
  playUserMove: (from: string, to: string, piece: string) => Promise<void>;
  requestHint: () => Promise<void>;
  clearHint: () => void;
  /** Termina la partida aquí aunque se siga en teoría. */
  finishHere: () => void;
  /** Transición a la fase final (feedback recibido), gestionada por la página. */
  markDone: () => void;
  reset: () => void;
}

/**
 * Maquina de estados de la Partida Guiada de Apertura.
 *
 * La lógica espeja EXACTAMENTE la del backend (`TheoryService.find_end_of_theory`):
 * tras cada jugada se consulta `POST /openings/book-move`; si la posición
 * resultante sigue en el libro y le toca mover al "libro", se aplica su
 * jugada principal automáticamente; si la posición ya no está en el libro,
 * la partida se pausa en el mismo punto que detectará el backend.
 */
export function useGuidedOpening(): UseGuidedOpeningReturn {
  const gameRef = useRef(new Chess());
  const fenRef = useRef<string>(START_FEN);
  const prevFenRef = useRef<string>(START_FEN);
  const userColorRef = useRef<"w" | "b">("w");
  const requestIdRef = useRef(0);
  const hintRequestRef = useRef(0);
  const { playMoveSound } = useChessSounds();

  const [phase, setPhase] = useState<GuidedOpeningPhase>("setup");
  const phaseRef = useRef<GuidedOpeningPhase>("setup");
  const [fen, setFen] = useState(START_FEN);
  const [opening, setOpening] = useState<GuidedOpening | null>(null);
  const [userColor, setUserColor] = useState<"w" | "b" | null>(null);
  const [moves, setMoves] = useState<PlayedMove[]>([]);
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [bookBusy, setBookBusy] = useState(false);
  const [theoryEnd, setTheoryEnd] = useState<TheoryEnd | null>(null);
  const [hint, setHint] = useState<BookMoveItem[] | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPlayerMove = useCallback(
    (g: Chess, from: string, to: string, by: "user" | "book", silent = false): boolean => {
      try {
        const isPromotion =
          by === "user" &&
          g.get(from as Square)?.type === "p" &&
          (to.endsWith("1") || to.endsWith("8"));
        const mv = g.move(
          to === from
            ? from
            : { from, to, promotion: isPromotion ? "q" : undefined },
        );
        if (!mv) return false;
        prevFenRef.current = fenRef.current;
        fenRef.current = g.fen();
        setMoves((prev) => [...prev, { san: mv.san, side: mv.color, by }]);
        setLastMove([mv.from, mv.to]);
        if (!silent) playMoveSound();
        return true;
      } catch {
        return false;
      }
    },
    [playMoveSound],
  );

  const applyBookMove = useCallback(
    (g: Chess, uci: string): boolean => {
      try {
        // chess.js v1.4 no acepta UCI como string en move(): se descompone
        // en from/to (y promoción opcional) para aplicarla correctamente.
        const mv = g.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length > 4 ? uci[4] : undefined,
        });
        if (!mv) return false;
        prevFenRef.current = fenRef.current;
        fenRef.current = g.fen();
        setMoves((prev) => [...prev, { san: mv.san, side: mv.color, by: "book" }]);
        setLastMove([mv.from, mv.to]);
        playMoveSound();
        return true;
      } catch {
        return false;
      }
    },
    [playMoveSound],
  );

  const setPhaseBoth = useCallback((p: GuidedOpeningPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const pauseAt = useCallback(
    (finishedManually: boolean) => {
      const g = gameRef.current;
      const hist = g.history();
      const ply = hist.length;
      setTheoryEnd({
        ply,
        moveNumber: Math.floor((ply - 1) / 2) + 1,
        deviationMove: hist.length > 0 ? hist[hist.length - 1] : null,
        lastTheoryFen: prevFenRef.current,
        outOfTheoryFen: g.fen(),
        finishedManually,
      });
      setBookBusy(false);
      setPhaseBoth("paused");
    },
    [setPhaseBoth],
  );

  // El libro consulta la posición actual: si ya no está en teoría se pausa;
  // si le toca al libro y hay jugada, la aplica y vuelve a consultar.
  const checkBook = useCallback(async (): Promise<void> => {
    const requestId = ++requestIdRef.current;
    const g = gameRef.current;

    if (g.isGameOver()) {
      pauseAt(false);
      return;
    }

    setBookBusy(true);
    try {
      const res = await getBookMove(fenRef.current);
      if (requestIdRef.current !== requestId) return;

      if (!res.in_theory) {
        pauseAt(false);
        return;
      }

      if (g.turn() === userColorRef.current) {
        // El usuario debe jugar ahora.
        setBookBusy(false);
        return;
      }

      // Le toca al libro: aplica su jugada principal y vuelve a evaluar.
      if (res.best_move) {
        if (!applyBookMove(g, res.best_move.uci)) {
          setError("El libro intentó hacer una jugada inválida.");
          setBookBusy(false);
          return;
        }
        setFen(g.fen());
        await checkBook();
      } else {
        setBookBusy(false);
      }
    } catch (e) {
      if (requestIdRef.current !== requestId) return;
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo consultar el libro de aperturas.",
      );
      setBookBusy(false);
    }
  }, [applyBookMove, pauseAt]);

  const start = useCallback(
    async (open: GuidedOpening, color: "w" | "b") => {
      gameRef.current = new Chess();
      fenRef.current = START_FEN;
      prevFenRef.current = START_FEN;
      userColorRef.current = color;
      requestIdRef.current += 1;
      hintRequestRef.current += 1;

      setOpening(open);
      setUserColor(color);
      setMoves([]);
      setLastMove(null);
      setTheoryEnd(null);
      setHint(null);
      setError(null);
      setBookBusy(false);
      setPhaseBoth("playing");

      // Reproduce la línea de referencia de la apertura hasta el FEN elegido.
      const g = gameRef.current;
      try {
        for (const san of open.line) {
          if (!applyPlayerMove(g, san, san, "book", true)) {
            throw new Error(`Jugada de apertura inválida: ${san}`);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al preparar la apertura.");
        return;
      }
      fenRef.current = g.fen();
      setFen(g.fen());
      await checkBook();
    },
    [applyPlayerMove, checkBook, setPhaseBoth],
  );

  const playUserMove = useCallback(
    async (from: string, to: string, piece: string): Promise<void> => {
      const g = gameRef.current;
      if (phaseRef.current !== "playing") return;
      if (g.turn() !== userColorRef.current) return;
      if (g.isGameOver()) return;

      const isPromotion =
        piece.toUpperCase().endsWith("P") &&
        (to.endsWith("1") || to.endsWith("8"));

      let mv;
      try {
        mv = g.move({ from, to, promotion: isPromotion ? "q" : undefined });
      } catch {
        return;
      }
      if (!mv) return;

      prevFenRef.current = fenRef.current;
      fenRef.current = g.fen();
      setMoves((prev) => [...prev, { san: mv.san, side: mv.color, by: "user" }]);
      setLastMove([mv.from, mv.to]);
      playMoveSound();
      setFen(g.fen());
      await checkBook();
    },
    [checkBook, playMoveSound],
  );

  const requestHint = useCallback(async (): Promise<void> => {
    const g = gameRef.current;
    if (g.turn() !== userColorRef.current) return;
    const id = ++hintRequestRef.current;
    setHintLoading(true);
    setError(null);
    try {
      const res = await getBookMove(fenRef.current, 5);
      if (id !== hintRequestRef.current) return;
      setHint(res.in_theory ? res.moves : []);
    } catch (e) {
      if (id !== hintRequestRef.current) return;
      setError(
        e instanceof Error ? e.message : "No se pudo consultar el libro de aperturas.",
      );
    } finally {
      if (id === hintRequestRef.current) setHintLoading(false);
    }
  }, []);

  const clearHint = useCallback(() => setHint(null), []);

  const finishHere = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    pauseAt(true);
  }, [pauseAt]);

  const markDone = useCallback(() => {
    setBookBusy(false);
    setPhaseBoth("done");
  }, [setPhaseBoth]);

  const reset = useCallback(() => {
    gameRef.current = new Chess();
    fenRef.current = START_FEN;
    prevFenRef.current = START_FEN;
    requestIdRef.current += 1;
    hintRequestRef.current += 1;
    setOpening(null);
    setUserColor(null);
    setMoves([]);
    setLastMove(null);
    setTheoryEnd(null);
    setHint(null);
    setError(null);
    setBookBusy(false);
    setFen(START_FEN);
    setPhaseBoth("setup");
  }, [setPhaseBoth]);

  const isUserTurn =
    phaseRef.current === "playing" &&
    !bookBusy &&
    fenRef.current !== "" &&
    !!userColorRef.current &&
    gameRef.current.turn() === userColorRef.current &&
    !gameRef.current.isGameOver();

  return {
    phase,
    fen,
    orientation: userColor === "b" ? "black" : "white",
    opening,
    userColor,
    moves,
    lastMove,
    isUserTurn,
    bookBusy,
    theoryEnd,
    hint,
    hintLoading,
    error,
    start,
    playUserMove,
    requestHint,
    clearHint,
    finishHere,
    markDone,
    reset,
  };
}