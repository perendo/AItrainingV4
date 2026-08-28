import { act, renderHook } from "@testing-library/react";
import { Chess } from "chess.js";
import { useGuidedOpening } from "./useGuidedOpening";
import { GUIDED_OPENINGS } from "@/lib/openings";
import { getBookMove } from "@/lib/api";
import type { BookMoveResponse } from "@/lib/types";

jest.mock("@/lib/api", () => ({
  getBookMove: jest.fn(),
}));

const mockGetBookMove = getBookMove as jest.MockedFunction<typeof getBookMove>;

function inTheory(
  bestMove: { san: string; uci: string; weight: number } | null,
): BookMoveResponse {
  return {
    in_theory: true,
    moves: bestMove ? [bestMove] : [],
    best_move: bestMove,
    fen_after: null,
  };
}

function outOfTheory(): BookMoveResponse {
  return { in_theory: false, moves: [], best_move: null, fen_after: null };
}

const italiana = GUIDED_OPENINGS.find((o) => o.id === "italiana")!;

describe("useGuidedOpening", () => {
  beforeEach(() => {
    mockGetBookMove.mockReset();
  });

  it("precarga la línea de la apertura y deja jugar al usuario cuando es su turno", async () => {
    mockGetBookMove.mockImplementation(async (fen) => {
      if (fen === italiana.fen) return inTheory(null);
      return outOfTheory();
    });

    const { result } = renderHook(() => useGuidedOpening());

    await act(async () => {
      await result.current.start(italiana, "w");
    });

    expect(result.current.phase).toBe("playing");
    expect(result.current.isUserTurn).toBe(true);
    expect(result.current.orientation).toBe("white");
    // La línea completa se traslada al registro (e4 e5 Nf3 Nc6 Bc4 Bc5).
    expect(result.current.moves.map((m) => m.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bc4",
      "Bc5",
    ]);
    expect(result.current.fen).toBe(italiana.fen);
    expect(mockGetBookMove).toHaveBeenCalledWith(italiana.fen);
  });

  it("el libro responde automáticamente cuando le toca y pausa si su jugada sale de teoría", async () => {
    // Usuario con negras: en la posición final (blanco a mover) el libro habla primero.
    mockGetBookMove.mockImplementation(async (fen) => {
      if (fen === italiana.fen) return inTheory({ san: "d3", uci: "d2d3", weight: 10 });
      return outOfTheory();
    });

    const { result } = renderHook(() => useGuidedOpening());

    await act(async () => {
      await result.current.start(italiana, "b");
    });

    expect(result.current.phase).toBe("paused");
    expect(result.current.moves.map((m) => m.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bc4",
      "Bc5",
      "d3",
    ]);
    expect(result.current.theoryEnd).toMatchObject({
      ply: 7,
      moveNumber: 4,
      deviationMove: "d3",
      lastTheoryFen: italiana.fen,
      finishedManually: false,
    });
    // El libro consultó primero la posición de partida y luego la posición tras d3.
    const g = new Chess(italiana.fen);
    g.move("d3");
    expect(mockGetBookMove.mock.calls.map((c) => c[0])).toEqual([
      italiana.fen,
      g.fen(),
    ]);
  });

  it("pausa tras el movimiento del usuario si la posición queda fuera de teoría", async () => {
    mockGetBookMove.mockImplementation(async (fen) => {
      if (fen === italiana.fen) return inTheory(null);
      return outOfTheory();
    });

    const { result } = renderHook(() => useGuidedOpening());

    await act(async () => {
      await result.current.start(italiana, "w");
    });

    await act(async () => {
      await result.current.playUserMove("d2", "d3", "wP");
    });

    expect(result.current.phase).toBe("paused");
    expect(result.current.moves.map((m) => m.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bc4",
      "Bc5",
      "d3",
    ]);
    expect(result.current.theoryEnd).toMatchObject({
      ply: 7,
      deviationMove: "d3",
      finishedManually: false,
    });
    expect(mockGetBookMove).toHaveBeenCalledTimes(2);
  });

  it("ignora los movimientos cuando el usuario no tiene el turno", async () => {
    // Usuario con negras para que el libro (blancas) tenga el turno y se bloquee el tablero.
    mockGetBookMove.mockImplementation(async (fen) => {
      if (fen === italiana.fen) return inTheory({ san: "d3", uci: "d2d3", weight: 10 });
      return outOfTheory();
    });

    const { result } = renderHook(() => useGuidedOpening());

    await act(async () => {
      await result.current.start(italiana, "b");
    });
    // El libro ya ha movido (d3) y la partida quedó pausada.
    expect(result.current.phase).toBe("paused");
    expect(result.current.isUserTurn).toBe(false);

    await act(async () => {
      await result.current.playUserMove("c7", "c6", "bP");
    });
    // La jugada de la pausa no cambia nada.
    expect(result.current.moves.map((m) => m.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bc4",
      "Bc5",
      "d3",
    ]);
  });

  it("terminar aquí registra el fin manual", async () => {
    mockGetBookMove.mockImplementation(async (fen) => {
      if (fen === italiana.fen) return inTheory(null);
      return outOfTheory();
    });

    const { result } = renderHook(() => useGuidedOpening());

    await act(async () => {
      await result.current.start(italiana, "w");
    });

    act(() => {
      result.current.finishHere();
    });

    expect(result.current.phase).toBe("paused");
    expect(result.current.theoryEnd?.finishedManually).toBe(true);
  });

  it("la pista del libro muestra las jugadas sugeridas", async () => {
    mockGetBookMove.mockImplementation(async (fen) => {
      if (fen === italiana.fen) return inTheory(null);
      return outOfTheory();
    });

    const { result } = renderHook(() => useGuidedOpening());

    await act(async () => {
      await result.current.start(italiana, "w");
    });

    mockGetBookMove.mockImplementation(async (fen, maxMoves) => {
      expect(fen).toBe(italiana.fen);
      expect(maxMoves).toBe(5);
      return inTheory({ san: "d3", uci: "d2d3", weight: 7 });
    });

    await act(async () => {
      await result.current.requestHint();
    });

    expect(result.current.hint).toEqual([{ san: "d3", uci: "d2d3", weight: 7 }]);

    act(() => {
      result.current.clearHint();
    });
    expect(result.current.hint).toBeNull();
  });

  it("markDone pasa a la fase done y reset devuelve a setup", async () => {
    mockGetBookMove.mockImplementation(async (fen) => {
      if (fen === italiana.fen) return inTheory(null);
      return outOfTheory();
    });

    const { result } = renderHook(() => useGuidedOpening());

    await act(async () => {
      await result.current.start(italiana, "w");
    });

    act(() => {
      result.current.markDone();
    });
    expect(result.current.phase).toBe("done");

    act(() => {
      result.current.reset();
    });
    expect(result.current.phase).toBe("setup");
    expect(result.current.opening).toBeNull();
    expect(result.current.moves).toHaveLength(0);
    expect(result.current.fen).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
  });

  it("un movimiento y luego un fallo del libro se reporta en error", async () => {
    mockGetBookMove.mockImplementation(async (fen) => {
      if (fen === italiana.fen) return inTheory(null);
      throw new Error("Red caída");
    });

    const { result } = renderHook(() => useGuidedOpening());

    await act(async () => {
      await result.current.start(italiana, "w");
    });

    await act(async () => {
      await result.current.playUserMove("d2", "d3", "wP");
    });

    expect(result.current.error).toBe("Red caída");
    // El giro del jugador se conserva en el registro aunque la consulta falle.
    expect(result.current.moves.map((m) => m.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bc4",
      "Bc5",
      "d3",
    ]);
  });
});