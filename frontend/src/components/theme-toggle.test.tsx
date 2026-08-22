import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "./theme-toggle";

function renderWithTheme() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="light">
      <ThemeToggle />
    </ThemeProvider>
  );
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("alterna entre modo claro y oscuro", async () => {
    const user = userEvent.setup();
    renderWithTheme();

    const toDark = await screen.findByRole("button", {
      name: "Cambiar a modo oscuro",
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await user.click(toDark);
    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true)
    );
    expect(
      screen.getByRole("button", { name: "Cambiar a modo claro" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cambiar a modo claro" }));
    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(false)
    );
    expect(
      screen.getByRole("button", { name: "Cambiar a modo oscuro" })
    ).toBeInTheDocument();
  });
});
