import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./page";
import { apiFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";

const mockRouter = { push: jest.fn() };

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, apiFetch: jest.fn() };
});

const mockedApiFetch = apiFetch as jest.Mock;

describe("LoginPage", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockRouter.push.mockClear();
    localStorage.clear();
  });

  it("renderiza el formulario de inicio de sesión", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByLabelText("Usuario")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("muestra errores de validación al enviar vacío", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText(/al menos 3 caracteres/)).toBeInTheDocument();
    expect(screen.getAllByText(/al menos 6 caracteres/).length).toBeGreaterThan(0);
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("envía credenciales como form-urlencoded y navega a /partidas", async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue({ access_token: "token-123", token_type: "bearer" });

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Usuario"), "pedro");
    await user.type(screen.getByLabelText("Contraseña"), "secreta1");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(1));
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/v1/users/login", {
      method: "POST",
      form: { username: "pedro", password: "secreta1" },
    });
    expect(getToken()).toBe("token-123");
    expect(mockRouter.push).toHaveBeenCalledWith("/partidas");
  });

  it("muestra el error del servidor si el login falla", async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockRejectedValue(new ApiError(401, "Usuario o contraseña incorrectos"));

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Usuario"), "pedro");
    await user.type(screen.getByLabelText("Contraseña"), "malaclave");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(
      await screen.findByText("Usuario o contraseña incorrectos"),
    ).toBeInTheDocument();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
