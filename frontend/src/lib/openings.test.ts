import { Chess } from "chess.js";
import { GUIDED_OPENINGS } from "./openings";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("GUIDED_OPENINGS", () => {
  it("cada apertura tiene sus campos básicos", () => {
    for (const o of GUIDED_OPENINGS) {
      expect(o.id).toBeTruthy();
      expect(o.name).toBeTruthy();
      expect(o.eco).toMatch(/^[A-E]\d\d$/);
      expect(o.description).toBeTruthy();
      expect(o.line.length).toBeGreaterThanOrEqual(3);
      expect(o.fen).toBeTruthy();
    }
  });

  it("la línea SAN de cada apertura conduce exactamente a su FEN", () => {
    for (const o of GUIDED_OPENINGS) {
      const game = new Chess();
      for (const san of o.line) {
        const mv = game.move(san);
        expect(mv).toBeTruthy();
      }
      expect(game.fen()).toBe(o.fen);
    }
  });

  it("ninguna apertura comienza desde la posición inicial", () => {
    for (const o of GUIDED_OPENINGS) {
      expect(o.fen).not.toBe(START_FEN);
    }
  });

  it("los FEN de partida son posiciones legales", () => {
    for (const o of GUIDED_OPENINGS) {
      const game = new Chess(o.fen);
      expect(game.fen()).toBe(o.fen);
    }
  });

  it("los ids son únicos", () => {
    const ids = GUIDED_OPENINGS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});