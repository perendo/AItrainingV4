import {
  fixEncoding,
  lastPath,
  nextPath,
  nodeAt,
  parsePgn,
  parseCommentMarkup,
  extractPgnDrawings,
  pathPly,
  pathsEqual,
  prevPath,
  resolvePosition,
  buildGuidedOpeningPgn,
} from "./pgn";
import type { AuditGameAnalysisResponse } from "./types";

// Muestra realista basada en el PGN de "final-1" (Lichess study export):
// cabeceras, comentario inicial, NAGs, comentarios con directivas [%csl]/[%cal]
// y variantes anidadas.
const SAMPLE_PGN = `[Event "Diag. 1.1"]
[Site "MyTown"]
[White "Final 1"]
[Black "El Cuadrado del Peón"]
[Result "1-0"]
[FEN "6k1/8/8/8/8/8/P7/7K w - - 0 1"]
[SetUp "1"]

{ La primera cuestión es si el peón puede coronar solo. }
1. a4 $1
{ [#] Construimos un cuadrado imaginario. Diag. 1.2 [%cal Ga4e4,Ge8e4] }
( 1. a3 { [%csl Gf8] } 1... Kf7 2. a4 Ke7 ) 1... Kf7
{ Regla del Cuadrado: si el rey entra en el cuadrado, captura el peón. }
2. a5 Ke6 ( 2... Ke7 3. a6 Kd7 ) 3. a6 1-0`;

describe("parsePgn", () => {
  const parsed = parsePgn(SAMPLE_PGN);

  it("extrae las cabeceras y el resultado", () => {
    expect(parsed.headers["White"]).toBe("Final 1");
    expect(parsed.headers["FEN"]).toBe("6k1/8/8/8/8/8/P7/7K w - - 0 1");
    expect(parsed.result).toBe("1-0");
    expect(parsed.initialFen).toBe("6k1/8/8/8/8/8/P7/7K w - - 0 1");
  });

  it("conserva el comentario inicial antes de la primera jugada", () => {
    expect(parsed.initialComment?.text).toContain("coronar solo");
  });

  it("construye la línea principal completa sin filtrar jugadas", () => {
    const sans = parsed.mainLine.map((n) => n.san);
    expect(sans).toEqual(["a4", "Kf7", "a5", "Ke6", "a6"]);
  });

  it("conserva los NAGs como glifos", () => {
    expect(parsed.mainLine[0].nags).toEqual(["!"]);
  });

  it("conserva los comentarios de las jugadas sin las directivas [%cal]/[%csl]", () => {
    const a4 = parsed.mainLine[0];
    expect(a4.commentAfter?.text).toContain("cuadrado imaginario");
    expect(a4.commentAfter?.text).not.toContain("[%cal");
    // Las directivas se convierten en datos visuales (con color).
    expect(a4.commentAfter?.arrows).toEqual([
      { from: "a4", to: "e4", color: "G" },
      { from: "e8", to: "e4", color: "G" },
    ]);
  });

  it("adjunta las variantes a la jugada correspondiente", () => {
    const a4 = parsed.mainLine[0];
    expect(a4.variations).toHaveLength(1);
    expect(a4.variations[0].map((n) => n.san)).toEqual([
      "a3",
      "Kf7",
      "a4",
      "Ke7",
    ]);
    // El comentario de la variante también se conserva.
    expect(a4.variations[0][0].commentAfter?.highlights).toEqual([
      { square: "f8", color: "G" },
    ]);

    const ke6 = parsed.mainLine[3];
    expect(ke6.variations[0].map((n) => n.san)).toEqual(["Ke7", "a6", "Kd7"]);
  });

  it("calcula número de jugada y bando desde el tablero", () => {
    expect(parsed.mainLine[0]).toMatchObject({ side: "w", moveNumber: 1 });
    expect(parsed.mainLine[1]).toMatchObject({ side: "b", moveNumber: 1 });
    expect(parsed.mainLine[2]).toMatchObject({ side: "w", moveNumber: 2 });
  });

  it("materializa los FEN de cada jugada", () => {
    expect(resolvePosition(parsed, []).fen).toBe(
      "6k1/8/8/8/8/8/P7/7K w - - 0 1"
    );
    // a2→a4: el peón aparece en el campo del rank 4 (5º campo del FEN).
    expect(resolvePosition(parsed, [0])).toMatchObject({
      fen: "6k1/8/8/8/P7/8/8/7K b - - 0 1",
      lastMove: ["a2", "a4"],
    });
  });

  it("soporta números pegados a la jugada (1.e4)", () => {
    const glued = parsePgn("1. e4 {abre} 1... e5 2. Nf3");
    expect(glued.mainLine.map((n) => n.san)).toEqual(["e4", "e5", "Nf3"]);
  });

  it("no descarta jugadas ilegales: las conserva sin FEN", () => {
    const weird = parsePgn("1. Zz9 {rara} 1... Kf7");
    expect(weird.mainLine).toHaveLength(2);
    expect(weird.mainLine[0].san).toBe("Zz9");
    expect(weird.mainLine[0].fenAfter).toBe("");
    expect(weird.mainLine[0].commentAfter?.text).toContain("rara");
    // La jugada siguiente también se conserva (aunque no pueda aplicarse
    // porque el turno no cambió).
    expect(weird.mainLine[1].san).toBe("Kf7");
  });

  it("usa el FEN de respaldo cuando no hay cabecera [FEN]", () => {
    const noHeader = parsePgn("1. c4 c5", "8/8/8/8/8/8/8/K1k5 w - - 0 1");
    expect(noHeader.initialFen).toBe("8/8/8/8/8/8/8/K1k5 w - - 0 1");
  });

  it("las variantes parten del FEN previo a SU jugada, no al inicio de la línea", () => {
    // Regresión: las variantes de nodos ≠ 0 se materializaban con el FEN
    // inicial de la línea y sus jugadas resultaban ilegales.
    const pgn = [
      '[FEN "6k1/8/8/8/8/8/P7/7K w - - 0 1"]',
      "",
      "1. a4 Kf7 ( 1... Kg7 2. Kh2 {lado largo} ) 2. a5",
    ].join("\n");
    const parsed = parsePgn(pgn);
    const variante = parsed.mainLine[1].variations[0];

    expect(variante.map((n) => n.san)).toEqual(["Kg7", "Kh2"]);
    expect(variante[0]).toMatchObject({ side: "b" });
    expect(variante[0].fenAfter).not.toBe("");
    expect(variante[1].fenAfter).not.toBe("");
    expect(variante[1].commentAfter?.text).toContain("lado largo");
  });

  it("capítulo gamebook sin jugadas: conserva solo el comentario inicial", () => {
    const gamebook = parsePgn(
      '[FEN "8/8/8/8/4k3/8/6K1/6BN w - - 0 1"]\n\n{ Introducción al mate de alfil y caballo. } *'
    );
    expect(gamebook.mainLine).toHaveLength(0);
    expect(gamebook.initialComment?.text).toContain("alfil y caballo");
    expect(gamebook.result).toBe("*");
  });
});

describe("navegación por caminos del árbol", () => {
  const parsed = parsePgn(SAMPLE_PGN);

  it("nextPath recorre la línea principal y desciende a variantes", () => {
    let path: number[] | null = [];
    const visited: string[] = [];
    while ((path = nextPath(parsed, path)) !== null) {
      visited.push(nodeAt(parsed, path)?.san ?? "?");
    }
    // La línea principal completa; al final de "a6" no hay más jugadas.
    expect(visited).toEqual(["a4", "Kf7", "a5", "Ke6", "a6"]);
  });

  it("nextPath entra en la primera variante al terminar una línea", () => {
    // Última jugada de la variante de "a4": desciende… pero la variante ya
    // terminó su línea, así que nextPath devuelve null desde "Ke7".
    const varPath = [0, 0, 3]; // a4 -> variante 0 -> Ke7
    expect(nodeAt(parsed, varPath)?.san).toBe("Ke7");
    expect(nextPath(parsed, varPath)).toBeNull();
  });

  it("prevPath sube de la variante al nodo padre", () => {
    expect(prevPath([0, 0, 0])).toEqual([0]);
    expect(prevPath([0])).toEqual([]);
    expect(prevPath([])).toBeNull();
  });

  it("lastPath llega al final de la línea principal", () => {
    const end = lastPath(parsed);
    expect(nodeAt(parsed, end)?.san).toBe("a6");
    expect(nextPath(parsed, end)).toBeNull();
  });

  it("resolvePosition resuelve posiciones dentro de variantes", () => {
    // Primera jugada de la variante de a4: 1. a3 parte del FEN inicial.
    const pos = resolvePosition(parsed, [0, 0, 0]);
    expect(pos.node?.san).toBe("a3");
    expect(pos.fen).toBe("6k1/8/8/8/8/P7/8/7K b - - 0 1");
    expect(pos.lastMove).toEqual(["a2", "a3"]);
  });

  it("pathsEqual compara caminos por valor", () => {
    expect(pathsEqual([0, 0, 1], [0, 0, 1])).toBe(true);
    expect(pathsEqual([0], [0, 0])).toBe(false);
  });

  it("pathPly cuenta las semi-jugadas aplicadas (incluidas variantes)", () => {
    expect(pathPly([])).toBe(0);
    expect(pathPly([0])).toBe(1); // 1. a4
    expect(pathPly([1])).toBe(2); // 1... Kf7
    // Primer nodo de la variante de a4: reemplaza a a4 → ply 1.
    expect(pathPly([0, 0, 0])).toBe(1);
    expect(pathPly([0, 0, 3])).toBe(4); // Ke7 dentro de la variante
  });
});

describe("fixEncoding", () => {
  it("repara texto con doble codificación UTF-8/Latin-1", () => {
    expect(fixEncoding("El Cuadrado del PeÃ³n")).toBe("El Cuadrado del Peón");
    expect(fixEncoding("La OposiciÃ³n")).toBe("La Oposición");
    expect(fixEncoding("ReacciÃ³n")).toBe("Reacción");
    expect(fixEncoding("CoronaciÃ³n del peÃ³n")).toBe(
      "Coronación del peón"
    );
    expect(fixEncoding("maÃ±ana")).toBe("mañana");
  });

  it("repara secuencias de apertura de pregunta y exclamación", () => {
    expect(fixEncoding("Â¿EstÃ¡s listo? Â¡Vamos!")).toBe(
      "¿Estás listo? ¡Vamos!"
    );
  });

  it("deja intacto el texto ya limpio (idempotencia)", () => {
    const clean = "Oposición, Reacción, Peón, ¿Listo? ¡Vamos!";
    expect(fixEncoding(clean)).toBe(clean);
    // Aplicarlo dos veces no altera el resultado.
    expect(fixEncoding(fixEncoding("PeÃ³n"))).toBe("Peón");
  });

  it("devuelve cadenas vacías sin cambios", () => {
    expect(fixEncoding("")).toBe("");
  });

  it("parseCommentMarkup sanea los comentarios al parsear", () => {
    const comment = parseCommentMarkup("Avanza el peÃ³n a sexta [%csl Gf6]");
    expect(comment.text).toBe("Avanza el peón a sexta");
    expect(comment.highlights).toEqual([{ square: "f6", color: "G" }]);
  });

  it("extractPgnDrawings conserva el color de cada marca", () => {
    const { text, highlights, arrows } = extractPgnDrawings(
      "Clave [%csl Rf8,Ye4] y plan [%cal Bd1d8,Ge8e1]"
    );
    expect(text).toBe("Clave y plan");
    expect(highlights).toEqual([
      { square: "f8", color: "R" },
      { square: "e4", color: "Y" },
    ]);
    expect(arrows).toEqual([
      { from: "d1", to: "d8", color: "B" },
      { from: "e8", to: "e1", color: "G" },
    ]);
  });

  it("parsePgn repara comentarios corruptos en el cuerpo del PGN", () => {
    const parsed = parsePgn(
      `[FEN "6k1/8/8/8/8/8/P7/7K w - - 0 1"]\n\n1. a4 { El peÃ³n avanza } 1... Kf7`
    );
    expect(parsed.mainLine[0].commentAfter?.text).toBe("El peón avanza");
  });
});

describe("buildGuidedOpeningPgn", () => {
  const moves = [{ san: "e4" }, { san: "e5" }, { san: "Nf3" }, { san: "Nc6" }];

  const feedback: AuditGameAnalysisResponse = {
    eco_code: "C50",
    opening_name: "Apertura Italiana",
    is_user_analysis_sufficient: false,
    tutor_feedback: {
      user_summary: "Detectaste bien la amenaza.",
      conceptual_error: "El plan de las blancas es diferente.",
      takeaway_lesson: "Controla el centro antes de atacar en el flanco.",
    },
    general_ai_analysis: {
      summary: "Las blancas mantienen la iniciativa.",
      critical_moments: [
        { ply: 3, san_move: "Nf3", eval_change: 0.32, explanation: "El caballo apoya d4." },
      ],
      strategic_plans: ["Domina el centro"],
    },
  };

  it("incluye cabeceras, numeración y resultado", () => {
    const pgn = buildGuidedOpeningPgn({
      moves,
      whitePlayer: "Tú (Alumno)",
      blackPlayer: "Libro de Aperturas",
      openingName: "Apertura Italiana",
      ecoCode: "C50",
    });

    expect(pgn).toContain('[Event "Partida Guiada de Apertura"]');
    expect(pgn).toContain('[White "Tú (Alumno)"]');
    expect(pgn).toContain('[Black "Libro de Aperturas"]');
    expect(pgn).toContain('[Opening "C50 – Apertura Italiana"]');
    expect(pgn).toMatch(/\[Date "20\d\d\.\d\d\.\d\d"\]/);
    expect(pgn).toContain("1. e4 e5 2. Nf3 Nc6 *");
  });

  it("sin feedback no incluye anotaciones del GM", () => {
    const pgn = buildGuidedOpeningPgn({
      moves,
      whitePlayer: "A",
      blackPlayer: "B",
    });

    expect(pgn).not.toContain("Momento crítico");
    expect(pgn).not.toContain("Regla de oro");
    expect(pgn).toContain("1. e4 e5 2. Nf3 Nc6 *");
  });

  it("incrusta el momento crítico, la regla de oro y el veredicto", () => {
    const pgn = buildGuidedOpeningPgn({
      moves,
      whitePlayer: "A",
      blackPlayer: "B",
      openingName: "Italiana",
      ecoCode: "C50",
      feedback,
    });

    expect(pgn).toContain(
      "{Momento crítico (ev. +0.32): El caballo apoya d4.}",
    );
    expect(pgn).toContain("{Regla de oro: Controla el centro antes de atacar en el flanco.}");
    expect(pgn).toContain("{El autodiagnóstico fue insuficiente: revisa la corrección del tutor.}");
  });

  it("marca el veredicto como suficiente cuando el plan es correcto", () => {
    const ok: AuditGameAnalysisResponse = {
      ...feedback,
      is_user_analysis_sufficient: true,
    };
    const pgn = buildGuidedOpeningPgn({ moves, whitePlayer: "A", blackPlayer: "B", feedback: ok });
    expect(pgn).toContain("{El autodiagnóstico fue suficiente.}");
  });

  it("ignora momentos críticos fuera de rango o sin ply", () => {
    const bad = {
      ...feedback,
      general_ai_analysis: {
        ...feedback.general_ai_analysis,
        critical_moments: [
          { ply: 99, san_move: "Nf3", eval_change: 1, explanation: "Fuera de rango" },
          { ply: 0, san_move: "e5", eval_change: 1, explanation: "Sin ply" },
        ],
      },
    };
    const pgn = buildGuidedOpeningPgn({ moves, whitePlayer: "A", blackPlayer: "B", feedback: bad });
    expect(pgn).not.toContain("Fuera de rango");
    expect(pgn).not.toContain("Sin ply");
  });
});
