import { getToken, setToken, removeToken, isAuthenticated } from "./auth";

const TOKEN_KEY = "access_token";

describe("auth (token helpers)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("setToken guarda el token en localStorage", () => {
    setToken("mi-token-jwt");
    expect(localStorage.getItem(TOKEN_KEY)).toBe("mi-token-jwt");
  });

  it("getToken devuelve el token guardado", () => {
    localStorage.setItem(TOKEN_KEY, "abc123");
    expect(getToken()).toBe("abc123");
  });

  it("getToken devuelve null si no hay token", () => {
    expect(getToken()).toBeNull();
  });

  it("removeToken elimina el token", () => {
    localStorage.setItem(TOKEN_KEY, "abc123");
    removeToken();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("isAuthenticated es true con token", () => {
    localStorage.setItem(TOKEN_KEY, "abc123");
    expect(isAuthenticated()).toBe(true);
  });

  it("isAuthenticated es false sin token", () => {
    expect(isAuthenticated()).toBe(false);
  });
});
