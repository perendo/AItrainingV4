import { render, screen, waitFor, act } from "@testing-library/react";
import { OpeningStockfishBoard } from "./OpeningStockfishBoard";

let latestDrop: ((from: string, to: string, piece?: string) => boolean) | null =
  null;

jest.mock("react-chessboard", () => ({
  Chessboard: (props: {
    onPieceDrop?: (from: string, to: string, piece?: string) => boolean;
    position?: string;
  }) => {
    latestDrop = props.onPieceDrop ?? null;
    return <div data-testid="board" data-position={props.position} />;
  },
}));

jest.mock("@/lib/api", () => ({
  getStockfishMove: jest.fn(() =>
    Promise.resolve({ move_uci: "e7e5", move_san: "e5", fen_after: "" })
  ),
}));

const OUT_OF_THEORY_FEN =
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

const BASE_MOVES = [
  { san: "e4" },
  { san: "e5" },
];

async function makeUserMove(from: string, to: string, piece = "wN") {
  await act(async () => {
    latestDrop?.(from, to, piece);
  });
}

describe("OpeningStockfishBoard — partida completa contra el motor", () => {
  beforeEach(() => {
    latestDrop = null;
  });

  it("notifica el PGN completo (apertura + medio juego) con el tablero persistente", async () => {
    const onPgnChange = jest.fn();

    render(
      <OpeningStockfishBoard
        initialFen={OUT_OF_THEORY_FEN}
        userColor="w"
        basePgnMoves={BASE_MOVES}
        openingName="Apertura Italiana"
        ecoCode="C50"
        userName="Pedro Rendo"
        onPgnChange={onPgnChange}
        onGameEnded={jest.fn()}
        onSave={jest.fn()}
        onAbandon={jest.fn()}
      />,
    );

    await waitFor(() => expect(latestDrop).toBeInstanceOf(Function));

    // Una jugada de medio juego del usuario (caballo b1-c3).
    await makeUserMove("b1", "c3");
    await waitFor(() => expect(onPgnChange.mock.calls.length).toBeGreaterThan(0));

    const pgn = onPgnChange.mock.calls[onPgnChange.mock.calls.length - 1][0] as string;
    // Incluye la apertura...
    expect(pgn).toContain("1. e4 e5");
    // ...y la continuación del medio juego contra Stockfish.
    expect(pgn).toContain("Nc3");
    // Los nombres y colores del usuario aparecen en los headers.
    expect(pgn).toContain('[White "Pedro Rendo"]');
    expect(pgn).toContain('[Black "Stockfish"]');
    expect(pgn).toContain('[Opening "C50 – Apertura Italiana"]');
  });

  it("guarda con onSave() usando el PGN ya notificado", async () => {
    const onSave = jest.fn();

    render(
      <OpeningStockfishBoard
        initialFen={OUT_OF_THEORY_FEN}
        userColor="w"
        basePgnMoves={BASE_MOVES}
        userName="Alumno"
        onPgnChange={jest.fn()}
        onGameEnded={jest.fn()}
        onSave={onSave}
        onAbandon={jest.fn()}
      />,
    );

    await waitFor(() => expect(latestDrop).toBeInstanceOf(Function));
    await makeUserMove("b1", "c3");

    await act(async () => {
      screen.getByText("Guardar partida y ver informe").click();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    // El guardado ya no recibe el PGN por argumento: el padre usa el notificado.
    expect(onSave).toHaveBeenCalledWith();
  });

  it("al abandonar pasa un PGN con derrota forzada del usuario (gana el motor)", async () => {
    const onAbandon = jest.fn();

    render(
      <OpeningStockfishBoard
        initialFen={OUT_OF_THEORY_FEN}
        userColor="w"
        basePgnMoves={BASE_MOVES}
        userName="Alumno"
        onPgnChange={jest.fn()}
        onGameEnded={jest.fn()}
        onSave={jest.fn()}
        onAbandon={onAbandon}
      />,
    );

    await waitFor(() => expect(latestDrop).toBeInstanceOf(Function));
    await makeUserMove("b1", "c3");

    await act(async () => {
      screen.getByText(/Abandonar partida/).click();
    });

    expect(onAbandon).toHaveBeenCalledTimes(1);
    const abandonPgn = onAbandon.mock.calls[0][0] as string;
    // El usuario juega blancas y abandona, así que el resultado es 0-1 (el motor gana).
    expect(abandonPgn).toContain("1. e4 e5");
    expect(abandonPgn).toContain("[Result \"0-1\"]");
    expect(abandonPgn).toContain('[White "Alumno"]');
  });

  it("muestra el turno del usuario cuando le toca mover", async () => {
    render(
      <OpeningStockfishBoard
        initialFen={OUT_OF_THEORY_FEN}
        userColor="w"
        basePgnMoves={BASE_MOVES}
        userName="Alumno"
        onPgnChange={jest.fn()}
        onGameEnded={jest.fn()}
        onSave={jest.fn()}
        onAbandon={jest.fn()}
      />,
    );

    await waitFor(() => expect(latestDrop).toBeInstanceOf(Function));
    expect(screen.getByText(/Juegan tus blancas/)).toBeInTheDocument();
  });
});
