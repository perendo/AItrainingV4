import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrainingTaskList } from "./TrainingTaskList";
import { getPendingTasks, generateWeeklyPlan } from "@/lib/api";
import type { TrainingTask } from "@/lib/types";

jest.mock("@/lib/api", () => ({
  getPendingTasks: jest.fn(),
  generateWeeklyPlan: jest.fn(),
}));

const mockedGetPendingTasks = getPendingTasks as jest.Mock;
const mockedGenerateWeeklyPlan = generateWeeklyPlan as jest.Mock;

const sampleTask: TrainingTask = {
  id: 1,
  category: "Táctica y Capturas",
  description: "Resolución de tácticas",
  current_count: 0,
  target_count: 10,
  is_completed: false,
};

describe("TrainingTaskList", () => {
  beforeEach(() => {
    mockedGetPendingTasks.mockReset();
    mockedGenerateWeeklyPlan.mockReset();
  });

  it("muestra un spinner mientras carga", () => {
    mockedGetPendingTasks.mockReturnValue(new Promise(() => {}));
    const { container } = render(<TrainingTaskList />);
    // RotateCw es un SVG con aria-hidden, no tiene rol de imagen.
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("muestra un mensaje de error si falla la carga", async () => {
    mockedGetPendingTasks.mockRejectedValue(new Error("network down"));
    render(<TrainingTaskList />);

    expect(
      await screen.findByText("Failed to load training tasks. Please try again later."),
    ).toBeInTheDocument();
  });

  it("muestra estado vacío y permite generar un plan", async () => {
    const user = userEvent.setup();
    mockedGetPendingTasks.mockResolvedValue([]);
    mockedGenerateWeeklyPlan.mockResolvedValue({});

    render(<TrainingTaskList />);

    expect(await screen.findByText("No Pending Tasks")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /generate new plan/i }));

    expect(mockedGenerateWeeklyPlan).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockedGetPendingTasks).toHaveBeenCalledTimes(2));
  });

  it("renderiza la lista de tareas pendientes", async () => {
    mockedGetPendingTasks.mockResolvedValue([sampleTask]);
    render(<TrainingTaskList />);

    expect(await screen.findByText("Táctica y Capturas")).toBeInTheDocument();
    expect(screen.getByText("Resolución de tácticas")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renderiza varias tareas", async () => {
    mockedGetPendingTasks.mockResolvedValue([
      sampleTask,
      { ...sampleTask, id: 2, category: "Estrategia y Posicional" },
    ]);
    render(<TrainingTaskList />);

    expect(await screen.findByText("Táctica y Capturas")).toBeInTheDocument();
    expect(screen.getByText("Estrategia y Posicional")).toBeInTheDocument();
  });
});
