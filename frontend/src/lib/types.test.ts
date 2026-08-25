import { gameAnalysisStatus, UserGameAnalysisResponse } from "./types";

const base: UserGameAnalysisResponse = {
  id: 1,
  user_id: 1,
  game_id: null,
  game_type: "USER",
  white_player: "Pedro",
  black_player: "Rival",
  fases_analisis: null,
  momentos_criticos: null,
  factores_posicionales: null,
  conclusiones_plan: null,
  gemini_feedback: null,
  created_at: "2026-01-01T00:00:00",
};

describe("gameAnalysisStatus", () => {
  it("devuelve 'pending' si no hay feedback de Gemini", () => {
    expect(gameAnalysisStatus(base)).toBe("pending");
  });

  it("devuelve 'audit_failed' si la auditoría falló sin feedback", () => {
    const analysis = { ...base, status: "failed" as const };
    expect(gameAnalysisStatus(analysis)).toBe("audit_failed");
  });

  it("devuelve 'pending' para registros antiguos sin estado", () => {
    const analysis = { ...base, status: null };
    expect(gameAnalysisStatus(analysis)).toBe("pending");
  });

  it("devuelve 'pending' si el feedback no es JSON válido", () => {
    const analysis = { ...base, gemini_feedback: "not-json" };
    expect(gameAnalysisStatus(analysis)).toBe("pending");
  });

  it("devuelve 'evaluated_correct' si el plan es correcto", () => {
    const analysis = {
      ...base,
      gemini_feedback: JSON.stringify({
        auditoria_conclusiones: { plan_correcto: true },
      }),
    };
    expect(gameAnalysisStatus(analysis)).toBe("evaluated_correct");
  });

  it("devuelve 'evaluated_incorrect' si el plan es incorrecto", () => {
    const analysis = {
      ...base,
      gemini_feedback: JSON.stringify({
        auditoria_conclusiones: { plan_correcto: false },
      }),
    };
    expect(gameAnalysisStatus(analysis)).toBe("evaluated_incorrect");
  });
});
