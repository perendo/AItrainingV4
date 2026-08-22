import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardControls } from "./BoardControls";

describe("BoardControls", () => {
  it("renderiza ambos botones", () => {
    render(
      <BoardControls
        onShowSolution={() => {}}
        onNextExercise={() => {}}
        isSolved={false}
        isReady={true}
      />,
    );
    expect(screen.getByRole("button", { name: /mostrar soluci/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /siguiente ejercicio/i })).toBeInTheDocument();
  });

  it("desactiva 'Mostrar Solución' cuando no está listo", () => {
    render(
      <BoardControls
        onShowSolution={() => {}}
        onNextExercise={() => {}}
        isSolved={false}
        isReady={false}
      />,
    );
    expect(screen.getByRole("button", { name: /mostrar soluci/i })).toBeDisabled();
  });

  it("desactiva 'Mostrar Solución' cuando ya está resuelto", () => {
    render(
      <BoardControls
        onShowSolution={() => {}}
        onNextExercise={() => {}}
        isSolved={true}
        isReady={true}
      />,
    );
    expect(screen.getByRole("button", { name: /mostrar soluci/i })).toBeDisabled();
  });

  it("desactiva 'Siguiente Ejercicio' hasta resolver", () => {
    render(
      <BoardControls
        onShowSolution={() => {}}
        onNextExercise={() => {}}
        isSolved={false}
        isReady={true}
      />,
    );
    expect(screen.getByRole("button", { name: /siguiente ejercicio/i })).toBeDisabled();
  });

  it("habilita 'Siguiente Ejercicio' al resolver y dispara los callbacks", async () => {
    const user = userEvent.setup();
    const onShowSolution = jest.fn();
    const onNextExercise = jest.fn();

    render(
      <BoardControls
        onShowSolution={onShowSolution}
        onNextExercise={onNextExercise}
        isSolved={true}
        isReady={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: /siguiente ejercicio/i }));
    expect(onNextExercise).toHaveBeenCalledTimes(1);
  });
});
