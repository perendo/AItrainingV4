// Catálogo de aperturas para las Partidas Guiadas de Apertura.
//
// Cada apertura es una posición verificada dentro del libro PolyGlot
// (Perfect2023.bin): el FEN se genera desde `line` con python-chess y esa
// posición tiene jugadas con peso >= 1. `sideToMove` se deriva del FEN y el
// hook de la partida guiada decide quién mueve primero: si le toca al
// "libro", responde automáticamente con su jugada principal.

export interface GuidedOpening {
  id: string;
  name: string;
  eco: string;
  description: string;
  /** Jugadas SAN desde la posición inicial hasta `fen`. */
  line: string[];
  /** Posición inicial de la partida guiada (dentro de la teoría). */
  fen: string;
}

export const GUIDED_OPENINGS: GuidedOpening[] = [
  {
    id: "italiana",
    name: "Apertura Italiana",
    eco: "C50",
    description:
      "Una de las aperturas más antiguas y sólidas: desarrollo rápido, control del centro y la disputa por d4/d5.",
    line: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"],
    fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
  },
  {
    id: "ruy_lopez_morphy",
    name: "Ruy López (Morphy)",
    eco: "C78",
    description:
      "La línea clásica de la española: las negras desafían al alfil con 3...a6.",
    line: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
    fen: "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
  },
  {
    id: "escocesa",
    name: "Apertura Escocesa",
    eco: "C45",
    description:
      "Las blancas abren el centro con 3.d4. Ideal para juego activo y táctico.",
    line: ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4"],
    fen: "r1bqkbnr/pppp1ppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 0 4",
  },
  {
    id: "siciliana_abierta",
    name: "Siciliana Abierta",
    eco: "B50",
    description:
      "La defensa más popular contra 1.e4: contraatacar el centro desde el flanco de dama.",
    line: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6"],
    fen: "rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5",
  },
  {
    id: "siciliana_najdorf",
    name: "Siciliana Najdorf",
    eco: "B90",
    description:
      "El arma más afilada de la Siciliana: las negras preparan ...e5 y el contrajuego en el ala de dama.",
    line: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
    fen: "rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6",
  },
  {
    id: "francesa_avance",
    name: "Defensa Francesa (Avance)",
    eco: "C02",
    description:
      "Las blancas ocupan espacio en el centro con 3.e5; las negras atacan la cadena de peones.",
    line: ["e4", "e6", "d4", "d5", "e5"],
    fen: "rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3",
  },
  {
    id: "caro_kann_avance",
    name: "Caro-Kann (Avance)",
    eco: "B12",
    description:
      "Como la francesa, con la ventaja de que el alfil de dama negro se desarrolla a f5.",
    line: ["e4", "c6", "d4", "d5", "e5"],
    fen: "rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3",
  },
  {
    id: "gambito_dama",
    name: "Gambito de Dama",
    eco: "D06",
    description:
      "Las blancas ofrecen el peón de c4 para obtener mayoría central; base de toda partida posicional.",
    line: ["d4", "d5", "c4"],
    fen: "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2",
  },
  {
    id: "india_rey",
    name: "Defensa India de Rey",
    eco: "E90",
    description:
      "Las negras ceden el centro y preparan el contrajuego en el flanco de rey.",
    line: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7"],
    fen: "rnbqk2r/ppppppbp/5np1/8/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4",
  },
  {
    id: "najdorf_torre",
    name: "Siciliana Najdorf (Ataque Torre)",
    eco: "B90",
    description:
      "La línea moderna con 6.Be3: el plan principal de la élite frente a la Najdorf.",
    line: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6", "Be3"],
    fen: "rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N1B3/PPP2PPP/R2QKB1R b KQkq - 1 6",
  },
];