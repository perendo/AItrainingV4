import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EndgameLessonPlayer } from "./EndgameLessonPlayer";

// Los visores son pesados (chessboard dinámico, fetch de Stockfish): se
// sustituyen porque aquí solo se prueba el cambio de pestaña.
jest.mock("./PgnStudyViewer", () => ({
  PgnStudyViewer: () => <div data-testid="pgn-study-viewer" />,
}));

jest.mock("./EndgamePracticeBoard", () => ({
  EndgamePracticeBoard: () => <div data-testid="practice-board" />,
}));

jest.mock("@/lib/api", () => ({
  updateEndgameProgress: jest.fn(() => Promise.resolve()),
}));

const lesson = {
  slug: "regla-del-cuadrado",
  title: "Regla del cuadrado",
  difficulty: "beginner",
  target_result: "draw",
  initial_fen: "6k1/8/8/8/8/8/P7/7K w - - 0 1",
  pgn_content: '[FEN "6k1/8/8/8/8/8/P7/7K w - - 0 1"]\n\n1. a4 Kf7',
} as unknown as Parameters<typeof EndgameLessonPlayer>[0]["lesson"];

describe("EndgameLessonPlayer", () => {
  it("muestra la teoría por defecto y el botón de retorno a la Academia", () => {
    render(<EndgameLessonPlayer lesson={lesson} />);

    expect(screen.getByTestId("pgn-study-viewer")).toBeInTheDocument();
    expect(screen.queryByTestId("practice-board")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Volver a la Academia/ })
    ).toHaveAttribute("href", "/entrenamiento/finales");
  });

  it("permite cambiar a Práctica y volver a Teoría (cadena cloneElement intacta)", async () => {
    const user = userEvent.setup();
    render(<EndgameLessonPlayer lesson={lesson} />);

    await user.click(screen.getByRole("button", { name: /Práctica/ }));
    expect(screen.getByTestId("practice-board")).toBeInTheDocument();
    expect(screen.queryByTestId("pgn-study-viewer")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Teoría/ }));
    expect(screen.getByTestId("pgn-study-viewer")).toBeInTheDocument();
  });
});
