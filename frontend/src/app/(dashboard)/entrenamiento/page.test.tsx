import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EntrenamientoPage from "./page";
import { generateWeeklyPlan, getPendingTasks } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  generateWeeklyPlan: jest.fn(),
  getPendingTasks: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: jest.fn(),
  }),
}));

describe("EntrenamientoPage", () => {
  beforeEach(() => {
    (getPendingTasks as jest.Mock).mockResolvedValue([]);
    (generateWeeklyPlan as jest.Mock).mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should render training dashboard and generate button", async () => {
    render(<EntrenamientoPage />);
    expect(screen.getByText("Training Dashboard")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Generar Nuevo Ejercicio/i })
    ).toBeInTheDocument();
  });

  it("should call generateWeeklyPlan and refresh when button is clicked", async () => {
    render(<EntrenamientoPage />);
    const button = screen.getByRole("button", { name: /Generar Nuevo Ejercicio/i });

    fireEvent.click(button);

    await waitFor(() => {
      expect(generateWeeklyPlan).toHaveBeenCalledTimes(1);
    });
  });

  it("should handle error during exercise generation", async () => {
    (generateWeeklyPlan as jest.Mock).mockRejectedValueOnce(
      new Error("Generation failed")
    );

    render(<EntrenamientoPage />);
    const button = screen.getByRole("button", { name: /Generar Nuevo Ejercicio/i });

    fireEvent.click(button);

    expect(
      await screen.findByText("Generation failed")
    ).toBeInTheDocument();
  });
});
