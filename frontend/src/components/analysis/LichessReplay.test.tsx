import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LichessReplay } from "./LichessReplay";

// El tablero es un import dinámico (SSR disabled); lo sustituimos para jsdom.
jest.mock("react-chessboard", () => ({
  Chessboard: () => <div data-testid="chessboard" />,
}));

// Resolver next/dynamic de forma síncrona evita el warning de act() al
// cargar el tablero de forma asíncrona durante el test.
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const { Chessboard } = require("react-chessboard");
    return Chessboard;
  },
}));

const PGN = "1. e4 e5 2. Nf3 Nc6";

const PGN_VARIANTS =
  "1. e4 {Idea principal} e5 (1... Nf6 2. Nc3 {variante sólida}) 2. Nf3 Nc6";

describe("LichessReplay", () => {
  it("muestra la línea principal en un flujo continuo con números de jugada", () => {
    render(<LichessReplay pgn={PGN} />);
    expect(screen.getByRole("button", { name: "e4" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "e5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nf3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nc6" })).toBeInTheDocument();
    expect(screen.getAllByText("1.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2.").length).toBeGreaterThanOrEqual(1);
  });

  it("muestra las variantes dentro de bloques indentados (data-variant-line)", () => {
    render(<LichessReplay pgn={PGN_VARIANTS} />);
    const variantMove = screen.getByRole("button", { name: "Nf6" });
    const line = variantMove.closest("[data-variant-line]");
    expect(line).not.toBeNull();
    expect(line!.getAttribute("data-variant-line")).toBe("true");
  });

  it("muestra los comentarios debajo de la jugada exacta", () => {
    render(<LichessReplay pgn={PGN_VARIANTS} />);
    const comment = screen.getByText("Idea principal");
    expect(comment).toBeInTheDocument();
    expect(comment.getAttribute("data-move-comment")).toBe("after");
    expect(screen.getByText("variante sólida")).toBeInTheDocument();
  });

  it("incluye la botonera estilo Lichess [|<] [<] [Play] [>] [>|]", () => {
    render(<LichessReplay pgn={PGN} />);
    expect(
      screen.getByRole("button", { name: "Ir al inicio" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retroceder jugada" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reproducir partida" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Avanzar jugada" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir al final" })).toBeInTheDocument();
  });

  it("navega al pulsar una jugada y con los botones", async () => {
    const user = userEvent.setup();
    render(<LichessReplay pgn={PGN} />);
    expect(screen.getByText("0 / 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "e4" }));
    expect(screen.getByText("1 / 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Avanzar jugada" }));
    expect(screen.getByText("2 / 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retroceder jugada" }));
    expect(screen.getByText("1 / 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ir al final" }));
    expect(screen.getByText("4 / 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ir al inicio" }));
    expect(screen.getByText("0 / 4")).toBeInTheDocument();
  });

  it("el autoplay avanza una jugada cada 500ms y se detiene al final", () => {
    jest.useFakeTimers();
    render(<LichessReplay pgn={PGN} />);
    const play = screen.getByRole("button", { name: "Reproducir partida" });

    fireEvent.click(play);
    expect(
      screen.getByRole("button", { name: "Pausar partida" })
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByText("1 / 4")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByText("2 / 4")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByText("3 / 4")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByText("4 / 4")).toBeInTheDocument();

    // Alcanzado el final, el autoplay se detiene automáticamente.
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(
      screen.getByRole("button", { name: "Reproducir partida" })
    ).toBeInTheDocument();
    expect(screen.getByText("4 / 4")).toBeInTheDocument();

    jest.useRealTimers();
  });

  it("play estando en el final reinicia desde el inicio", () => {
    jest.useFakeTimers();
    render(<LichessReplay pgn={PGN} />);
    fireEvent.click(screen.getByRole("button", { name: "Ir al final" }));
    expect(screen.getByText("4 / 4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reproducir partida" }));
    expect(screen.getByText("0 / 4")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByText("1 / 4")).toBeInTheDocument();

    jest.useRealTimers();
  });

  it("navega por teclado: flechas retroceder/avanzar y espacio play/pausa", () => {
    render(<LichessReplay pgn={PGN} />);
    expect(screen.getByText("0 / 4")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("1 / 4")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2 / 4")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 4")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: " " });
    expect(
      screen.getByRole("button", { name: "Pausar partida" })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: " " });
    expect(
      screen.getByRole("button", { name: "Reproducir partida" })
    ).toBeInTheDocument();
  });

  it("no captura las flechas cuando el foco está en un input", () => {
    render(
      <div>
        <input aria-label="mi input" />
        <LichessReplay pgn={PGN} />
      </div>
    );
    const input = screen.getByLabelText("mi input");
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(screen.getByText("0 / 4")).toBeInTheDocument();
  });

  it("el layout 'side' coloca la notación a la derecha del tablero", () => {
    render(<LichessReplay pgn={PGN} layout="side" />);
    expect(screen.getByText("Notación de la Partida")).toBeInTheDocument();
    expect(screen.getByTestId("chessboard")).toBeInTheDocument();
  });
});
