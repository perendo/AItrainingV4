import { render, screen } from "@testing-library/react";
import { TrainingTaskCard } from "./TrainingTaskCard";
import type { TrainingTask } from "@/lib/types";

const baseTask: TrainingTask = {
  id: 1,
  category: "Táctica y Capturas",
  description: "Resolución de tácticas sobre: fork, pin",
  current_count: 3,
  target_count: 10,
  is_completed: false,
};

describe("TrainingTaskCard", () => {
  it("muestra categoría, descripción y progreso", () => {
    render(<TrainingTaskCard task={baseTask} />);
    expect(screen.getByText("Táctica y Capturas")).toBeInTheDocument();
    expect(screen.getByText("Resolución de tácticas sobre: fork, pin")).toBeInTheDocument();
    expect(screen.getByText("3 / 10")).toBeInTheDocument();
  });

  it("muestra badge Pending cuando no está completada", () => {
    render(<TrainingTaskCard task={baseTask} />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("muestra badge Completed cuando está completada", () => {
    render(<TrainingTaskCard task={{ ...baseTask, is_completed: true }} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("enlaza a /entrenamiento/{id} para una tarea normal", () => {
    render(<TrainingTaskCard task={baseTask} />);
    const link = screen.getByRole("link", { name: /continue/i });
    expect(link).toHaveAttribute("href", "/entrenamiento/1");
  });

  it("muestra 'Start' en una tarea sin progreso", () => {
    render(<TrainingTaskCard task={{ ...baseTask, current_count: 0 }} />);
    expect(screen.getByRole("link", { name: /start/i })).toHaveAttribute(
      "href",
      "/entrenamiento/1",
    );
  });

  it("desactiva el botón cuando la tarea está completada", () => {
    render(<TrainingTaskCard task={{ ...baseTask, is_completed: true }} />);
    const link = screen.getByRole("link", { name: /start/i });
    expect(link.querySelector("button")).toBeDisabled();
  });

  it("para tareas de GM enlaza a /partidas/{gmId}?isGmGame=true", () => {
    const gmTask: TrainingTask = {
      ...baseTask,
      category: "Análisis de Partida de GM",
      gm_game: {
        id: "gm-123",
        gm_name: "Capablanca",
        white: "Capablanca",
        black: "Marshall",
        event: "New York",
        year: 1918,
        result: "1-0",
        pgn: "1. e4 e5 2. Nf3",
      },
    };
    render(<TrainingTaskCard task={gmTask} />);
    expect(screen.getByRole("link", { name: /start analysis/i })).toHaveAttribute(
      "href",
      "/partidas/gm-123?isGmGame=true",
    );
  });

  it("no muestra barra de progreso en tareas de GM", () => {
    const gmTask: TrainingTask = {
      ...baseTask,
      category: "Análisis de Partida de GM",
      current_count: 0,
      target_count: 1,
    };
    const { container } = render(<TrainingTaskCard task={gmTask} />);
    // La barra de progreso usa un track con clase bg-gray-200 (el botón también
    // lleva bg-primary, así que no vale ese selector).
    expect(container.querySelector(".bg-gray-200")).not.toBeInTheDocument();
  });
});
