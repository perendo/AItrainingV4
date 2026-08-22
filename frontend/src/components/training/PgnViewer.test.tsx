import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PgnViewer } from "./PgnViewer";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function setup(props: Partial<Parameters<typeof PgnViewer>[0]> = {}) {
  const onGoToMove = jest.fn();
  const onPrev = jest.fn();
  const onNext = jest.fn();

  const utils = render(
    <PgnViewer
      fen={START_FEN}
      moves={["e2e4", "e7e5"]}
      initialMoveNumber={1}
      viewIndex={0}
      onGoToMove={onGoToMove}
      onPrev={onPrev}
      onNext={onNext}
      {...props}
    />,
  );

  // Los botones de navegación (ChevronLeft/ChevronRight) contienen un <svg>.
  const getNavButtons = () =>
    screen.getAllByRole("button").filter((b) => b.querySelector("svg") !== null);

  return { onGoToMove, onPrev, onNext, getNavButtons, ...utils };
}

describe("PgnViewer", () => {
  it("convierte los movimientos UCI a SAN", () => {
    setup();
    expect(screen.getByRole("button", { name: "e4" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "e5" })).toBeInTheDocument();
  });

  it("muestra el número de jugada", () => {
    setup();
    expect(screen.getAllByText("1.").length).toBeGreaterThanOrEqual(1);
  });

  it("desactiva el botón anterior en el primer movimiento", () => {
    const { getNavButtons } = setup({ viewIndex: 0 });
    expect(getNavButtons()[0]).toBeDisabled();
    expect(getNavButtons()[1]).toBeEnabled();
  });

  it("desactiva el botón siguiente en el último movimiento", () => {
    const { getNavButtons } = setup({ viewIndex: 2 });
    expect(getNavButtons()[1]).toBeDisabled();
  });

  it("dispara onGoToMove con el índice correcto al pulsar un movimiento", async () => {
    const user = userEvent.setup();
    const { onGoToMove } = setup();

    await user.click(screen.getByRole("button", { name: "e4" }));
    expect(onGoToMove).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole("button", { name: "e5" }));
    expect(onGoToMove).toHaveBeenCalledWith(2);
  });

  it("el botón inicial llama a onGoToMove(0)", async () => {
    const user = userEvent.setup();
    const { onGoToMove } = setup();

    await user.click(screen.getByRole("button", { name: "1." }));
    expect(onGoToMove).toHaveBeenCalledWith(0);
  });

  it("dispara onPrev y onNext", async () => {
    const user = userEvent.setup();
    const { onPrev, onNext, getNavButtons } = setup({ viewIndex: 1 });

    await user.click(getNavButtons()[0]);
    expect(onPrev).toHaveBeenCalledTimes(1);

    await user.click(getNavButtons()[1]);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
