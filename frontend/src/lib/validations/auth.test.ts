import { loginSchema, registerSchema } from "./auth";

describe("loginSchema", () => {
  it("acepta credenciales válidas", () => {
    const result = loginSchema.safeParse({ username: "pedro", password: "secret1" });
    expect(result.success).toBe(true);
  });

  it("rechaza username de menos de 3 caracteres", () => {
    const result = loginSchema.safeParse({ username: "ab", password: "secret1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("al menos 3 caracteres");
    }
  });

  it("rechaza password de menos de 6 caracteres", () => {
    const result = loginSchema.safeParse({ username: "pedro", password: "12345" });
    expect(result.success).toBe(false);
  });

  it("rechaza password vacía", () => {
    const result = loginSchema.safeParse({ username: "pedro", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("registerSchema", () => {
  const validBase = {
    username: "pedro",
    full_name: "Pedro Rendo",
    current_elo: 1700,
    target_elo: 2000,
    password: "secret1",
    confirmPassword: "secret1",
  };

  it("acepta un registro válido", () => {
    const result = registerSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("acepta chess_online_nick opcional o vacío", () => {
    const withNick = registerSchema.safeParse({ ...validBase, chess_online_nick: "pedroq" });
    const emptyNick = registerSchema.safeParse({ ...validBase, chess_online_nick: "" });
    expect(withNick.success).toBe(true);
    expect(emptyNick.success).toBe(true);
  });

  it("rechaza passwords que no coinciden", () => {
    const result = registerSchema.safeParse({
      ...validBase,
      confirmPassword: "distinta",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmIssue = result.error.issues.find((i) => i.path[0] === "confirmPassword");
      expect(confirmIssue?.message).toBe("Las contraseñas no coinciden");
    }
  });

  it("rechaza ELO fuera de rango", () => {
    const tooHigh = registerSchema.safeParse({ ...validBase, current_elo: 4000 });
    const tooLow = registerSchema.safeParse({ ...validBase, target_elo: 50 });
    expect(tooHigh.success).toBe(false);
    expect(tooLow.success).toBe(false);
  });

  it("rechaza username de menos de 3 caracteres", () => {
    const result = registerSchema.safeParse({ ...validBase, username: "ab" });
    expect(result.success).toBe(false);
  });
});
