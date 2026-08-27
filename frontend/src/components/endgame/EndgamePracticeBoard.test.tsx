import { render, screen, waitFor, act } from "@testing-library/react";
import { EndgamePracticeBoard } from "./EndgamePracticeBoard";

// El Chessboard real es dinámico; lo sustituimos por un componente que captura
// el manejador onPieceDrop para poder "hacer jugadas" desde el test.
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

// Stockfish con respuestas preconfiguradas: el rey negro repite e5/e6 para que
// la posición inicial (R+T vs R suficiente material) aparezca tres veces.
const stockfishQueue = ["e5e6", "e6e5", "e5e6", "e6e5"];

jest.mock("@/lib/api", () => ({
  getStockfishMove: jest.fn(() =>
    Promise.resolve({ move_uci: stockfishQueue.shift() ?? "e5e6" })
  ),
  updateEndgameProgress: jest.fn(() => Promise.resolve()),
}));

const lesson = {
  slug: "triple-repetition",
  title: "Triple repetición",
  difficulty: "beginner",
  target_result: "draw",
  // Material suficiente (R vs R) para que NO salte la regla de material
  // insuficiente: solo la triple repetición debe declarar tablas.
  initial_fen: "8/8/8/4k3/8/R7/8/K7 w - - 0 1",
  pgn_content: "",
} as unknown as Parameters<typeof EndgamePracticeBoard>[0]["lesson"];

async function makeUserMove(from: string, to: string) {
  await act(async () => {
    latestDrop?.(from, to, "wR");
  });
}

describe("EndgamePracticeBoard — triple repetición", () => {
  beforeEach(() => {
    stockfishQueue.length = 0;
    stockfishQueue.push("e5e6", "e6e5", "e5e6", "e6e5");
    latestDrop = null;
  });

  it("detecta tablas por triple repetición (usa el historial real, no el FEN)", async () => {
    render(<EndgamePracticeBoard lesson={lesson} />);

    // El tablero se activa tras requestAnimationFrame.
    await waitFor(() => expect(latestDrop).toBeInstanceOf(Function));

    // Secuencia que devuelve la posición inicial 3 veces (torre blanca a3-a4
    // y rey negro e5-e6,来回): tras la 4ª respuesta de Stockfish, la posición
    // inicial aparece por 3ª vez -> triple repetición.
    const userMoves: Array<[string, string]> = [
      ["a3", "a4"],
      ["a4", "a3"],
      ["a3", "a4"],
      ["a4", "a3"],
    ];

    for (let i = 0; i < userMoves.length; i++) {
      await makeUserMove(userMoves[i][0], userMoves[i][1]);
      // Tras la respuesta de Stockfish vuelve a ser turno del usuario.
      if (i < userMoves.length - 1) {
        await waitFor(() =>
          expect(screen.getByText("Tu turno")).toBeInTheDocument()
        );
      }
    }

    // Tras la 4ª jugada de Stockfish la posición inicial aparece por 3ª vez.
    await waitFor(() =>
      expect(screen.getByText("¡Tablas!")).toBeInTheDocument()
    );
  });

  it("detecta tablas por la regla de 50 jugadas (reloj de medias jugadas)", async () => {
    // Material suficiente (R vs R) y halfmove clock en 99: una jugada legal sin
    // captura ni peón lleva el contador a 100 -> tablas por la regla de 50.
    const lesson50 = {
      ...lesson,
      slug: "cincuenta-movimientos",
      initial_fen: "8/8/8/4k3/8/R7/8/K7 w - - 99 50",
    };

    render(<EndgamePracticeBoard lesson={lesson50} />);

    await waitFor(() => expect(latestDrop).toBeInstanceOf(Function));

    // Torre a3-a4: no es peón ni captura, así el reloj sube 99 -> 100.
    await act(async () => {
      latestDrop?.("a3", "a4", "wR");
    });

    await waitFor(() =>
      expect(screen.getByText("¡Tablas!")).toBeInTheDocument()
    );
  });
});
