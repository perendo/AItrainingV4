import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EndgameCatalogPage from "./page";
import { getEndgameLessons } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  getEndgameLessons: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}));

const lesson = (
  slug: string,
  status: "not_started" | "in_progress" | "mastered"
) => ({
  slug,
  title: `Lección ${slug}`,
  difficulty: "beginner",
  target_result: "draw",
  has_audio: false,
  status,
});

const CATALOG = {
  peones: [
    lesson("oposicion", "not_started"),
    lesson("cuadrado", "in_progress"),
    lesson("rey-fantasma", "mastered"),
  ],
  torres: [lesson("lucena", "mastered"), lesson("philidor", "mastered")],
};

describe("EndgameCatalogPage — filtro de ocultar completadas", () => {
  beforeEach(() => {
    (getEndgameLessons as jest.Mock).mockResolvedValue(CATALOG);
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("muestra todas las lecciones y el recuento pendientes/total por defecto", async () => {
    render(<EndgameCatalogPage />);

    expect(await screen.findByText("Lección oposicion")).toBeInTheDocument();
    expect(screen.getByText("Lección rey-fantasma")).toBeInTheDocument();
    expect(screen.getByTestId("pending-count")).toHaveTextContent(
      "2 / 5 lecciones pendientes"
    );
    // El toggle arranca desactivado.
    expect(screen.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("al activar el filtro oculta las dominadas y vacía secciones con mensaje", async () => {
    const user = userEvent.setup();
    render(<EndgameCatalogPage />);
    await screen.findByText("Lección oposicion");

    await user.click(screen.getByRole("switch"));

    // Peones: solo quedan las dos no dominadas.
    expect(screen.getByText("Lección oposicion")).toBeInTheDocument();
    expect(screen.getByText("Lección cuadrado")).toBeInTheDocument();
    expect(screen.queryByText("Lección rey-fantasma")).not.toBeInTheDocument();

    // Torres: sección entera dominada → mensaje amable en lugar del grid.
    expect(screen.queryByText("Lección lucena")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Has dominado todos los finales de esta sección/)
    ).toBeInTheDocument();

    // Badge de bloque con ratio visible/total.
    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText("0/2")).toBeInTheDocument();

    // La preferencia queda persistida.
    expect(window.localStorage.getItem("endgame_hide_completed")).toBe("true");
  });

  it("restaura la preferencia desde localStorage al montar", async () => {
    window.localStorage.setItem("endgame_hide_completed", "true");
    render(<EndgameCatalogPage />);

    await waitFor(() => {
      expect(screen.getByRole("switch")).toHaveAttribute(
        "aria-checked",
        "true"
      );
    });
    expect(screen.queryByText("Lección rey-fantasma")).not.toBeInTheDocument();
  });

  it("al desactivar el filtro vuelven a aparecer todas las lecciones", async () => {
    const user = userEvent.setup();
    render(<EndgameCatalogPage />);
    await screen.findByText("Lección oposicion");

    await user.click(screen.getByRole("switch"));
    expect(screen.queryByText("Lección rey-fantasma")).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch"));
    expect(screen.getByText("Lección rey-fantasma")).toBeInTheDocument();
    expect(window.localStorage.getItem("endgame_hide_completed")).toBe("false");
  });
});
