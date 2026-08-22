import {
  splitPgnStream,
  parseLichessPgnStream,
  combinePgnStream,
  resultLabel,
  speedLabel,
  speedFromTimeControl,
  formatGameDate,
} from "./lichess";

const PGN_STREAM = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abc123"]
[White "TestUser"]
[Black "RivalOne"]
[Result "1-0"]
[UTCDate "2025.01.10"]
[UTCTime "12:34:56"]
[WhiteElo "1500"]
[BlackElo "1400"]
[WhiteRatingDiff "+5"]
[BlackRatingDiff "-5"]
[ECO "C20"]
[Opening "King's Pawn Game"]
[TimeControl "180+0"]
[Termination "Normal"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O Nxe4 5. d4 Nd6 1-0

[Event "Rated Classical game"]
[Site "https://lichess.org/def456"]
[White "OtherPlayer"]
[Black "TestUser"]
[Result "1/2-1/2"]
[UTCDate "2025.01.09"]
[UTCTime "10:00:00"]
[WhiteElo "1600"]
[BlackElo "1500"]
[WhiteRatingDiff "0"]
[BlackRatingDiff "0"]
[ECO "B12"]
[Opening "Caro-Kann Defense"]
[TimeControl "1500+30"]
[Termination "Normal"]

1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 1/2-1/2
`;

describe("splitPgnStream", () => {
  it("separa PGNs concatenados", () => {
    const games = splitPgnStream(PGN_STREAM);
    expect(games).toHaveLength(2);
    expect(games[0]).toContain('[Event "Rated Blitz game"]');
    expect(games[1]).toContain('[Event "Rated Classical game"]');
  });

  it("maneja cabeceras y movimientos con saltos de línea", () => {
    const wrapped = PGN_STREAM.replace(
      "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6",
      "1. e4 e5\n2. Nf3 Nc6 3. Bc4 Nf6"
    );
    expect(splitPgnStream(wrapped)).toHaveLength(2);
  });

  it("devuelve lista vacía para texto vacío", () => {
    expect(splitPgnStream("")).toEqual([]);
  });
});

describe("parseLichessPgnStream", () => {
  it("parsea los PGNs del flujo de Lichess", () => {
    const games = parseLichessPgnStream(PGN_STREAM, "TestUser");
    expect(games).toHaveLength(2);

    expect(games[0]).toMatchObject({
      white: "TestUser",
      black: "RivalOne",
      rival: "RivalOne",
      playerColor: "white",
      result: "Victoria",
      resultRaw: "1-0",
      speed: "Blitz",
    });
    expect(games[0].date).toContain("2025");
    expect(games[0].pgn).toContain('[Event "Rated Blitz game"]');

    expect(games[1]).toMatchObject({
      rival: "OtherPlayer",
      playerColor: "black",
      result: "Tablas",
      speed: "Classical",
    });
  });

  it("coincide el usuario sin distinguir mayúsculas/minúsculas", () => {
    const games = parseLichessPgnStream(PGN_STREAM, "testuser");
    expect(games).toHaveLength(2);
    expect(games[0].rival).toBe("RivalOne");
  });

  it("ignora partidas donde no participa el usuario buscado", () => {
    const games = parseLichessPgnStream(PGN_STREAM, "OtroUsuario");
    expect(games).toEqual([]);
  });

  it("ignora texto no parseable", () => {
    expect(parseLichessPgnStream("esto no es un pgn", "TestUser")).toEqual([]);
  });
});

describe("combinePgnStream", () => {
  it("une los PGNs separados por línea en blanco", () => {
    const out = combinePgnStream([
      { pgn: '[Event "A"]\n\n1. e4' },
      { pgn: '[Event "B"]\n\n1. d4' },
    ]);
    expect(out).toBe('[Event "A"]\n\n1. e4\n\n[Event "B"]\n\n1. d4');
    expect(splitPgnStream(out)).toHaveLength(2);
  });
});

describe("resultLabel", () => {
  it("clasifica victoria/derrota según el color", () => {
    expect(resultLabel("1-0", true)).toBe("Victoria");
    expect(resultLabel("1-0", false)).toBe("Derrota");
    expect(resultLabel("0-1", true)).toBe("Derrota");
    expect(resultLabel("0-1", false)).toBe("Victoria");
  });

  it("detecta tablas y partidas sin terminar", () => {
    expect(resultLabel("1/2-1/2", true)).toBe("Tablas");
    expect(resultLabel("*", true)).toBe("Sin terminar");
  });
});

describe("speedLabel", () => {
  it("deriva el ritmo del evento de Lichess", () => {
    expect(speedLabel("Rated Blitz game")).toBe("Blitz");
    expect(speedLabel("Casual Rapid game")).toBe("Rapid");
    expect(speedLabel("Rated Classical game")).toBe("Classical");
  });

  it("calcula el ritmo desde el TimeControl si no hay evento", () => {
    expect(speedLabel("", "180+0")).toBe("Blitz");
    expect(speedLabel("", "600+5")).toBe("Rapid");
    expect(speedLabel("", "1500+30")).toBe("Classical");
  });

  it("clasifica el TimeControl por duración estimada", () => {
    expect(speedFromTimeControl("60+0")).toBe("Bullet");
    expect(speedFromTimeControl("180+0")).toBe("Blitz");
    expect(speedFromTimeControl("900+0")).toBe("Rapid");
    expect(speedFromTimeControl("1500+0")).toBe("Classical");
  });
});

describe("formatGameDate", () => {
  it("formatea fecha y hora UTC", () => {
    const out = formatGameDate("2025.01.10", "12:34:56");
    expect(out).toContain("2025");
    expect(out).toContain("12:34");
  });

  it("devuelve la fecha cruda si no puede parsearla", () => {
    expect(formatGameDate("2025.01.10")).toContain("2025");
    expect(formatGameDate(undefined)).toBe("Fecha desconocida");
  });
});
