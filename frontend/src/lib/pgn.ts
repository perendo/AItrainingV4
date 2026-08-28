// Parser de PGN con conservación total de comentarios, NAGs y variantes
// anidadas. chess.js se usa únicamente para validar las jugadas y calcular
// los FEN resultantes (su `loadPgn` descarta comentarios/variantes, por eso
// no sirve para la teoría de los finales).
import { Chess } from "chess.js";

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Color estándar de las marcas de Lichess: G verde, R rojo, Y amarillo, B azul. */
export type PgnColor = "G" | "R" | "Y" | "B";

/** Casilla resaltada por la directiva [%csl] con su color. */
export interface HighlightMark {
  square: string;
  color: PgnColor;
}

/** Flecha dibujada por la directiva [%cal] con su color. */
export interface ArrowMark {
  from: string;
  to: string;
  color: PgnColor;
}

/** Comentario del PGN ya procesado (texto visible + marcas visuales Lichess). */
export interface PgnComment {
  /** Texto del comentario sin las directivas [%csl]/[%cal]. */
  text: string;
  /** Casillas a resaltar (directiva [%csl]) con su color. */
  highlights: HighlightMark[];
  /** Flechas a dibujar (directiva [%cal]) con su color. */
  arrows: ArrowMark[];
}

/** Paleta de colores de las marcas PGN (estándar Lichess). */
export const PGN_COLOR_HEX: Record<PgnColor, string> = {
  G: "#15803d", // verde
  R: "#b91c1c", // rojo
  Y: "#eab308", // amarillo
  B: "#2563eb", // azul
};

/** Fondo semitransparente para resaltar casillas (usa el color base + alpha). */
export const PGN_SQUARE_COLORS: Record<PgnColor, string> = {
  G: "rgba(21, 128, 61, 0.5)",
  R: "rgba(185, 28, 28, 0.5)",
  Y: "rgba(234, 179, 8, 0.5)",
  B: "rgba(37, 99, 235, 0.5)",
};

/** Color sólido de las flechas (react-chessboard espera un color CSS). */
export const PGN_ARROW_COLORS: Record<PgnColor, string> = {
  G: "#15803d",
  R: "#b91c1c",
  Y: "#eab308",
  B: "#2563eb",
};

/** Nodo de jugada dentro del árbol del PGN. */
export interface PgnMoveNode {
  /** SAN tal cual aparece en el PGN (con sufijos !, ?, +#…). */
  san: string;
  side: "w" | "b";
  moveNumber: number;
  commentBefore: PgnComment | null;
  commentAfter: PgnComment | null;
  /** Glifos de anotación ya resueltos ("!", "?!", "±", …). */
  nags: string[];
  /** Variantes alternativas; cada una parte de la posición anterior a esta jugada. */
  variations: PgnLine[];
  from: string | null;
  to: string | null;
  /** FEN tras esta jugada (vacío si la jugada era ilegal y no pudo aplicarse). */
  fenAfter: string;
}

export type PgnLine = PgnMoveNode[];

export interface ParsedPgn {
  headers: Record<string, string>;
  initialFen: string;
  mainLine: PgnLine;
  /** Comentario inicial antes de la primera jugada. */
  initialComment: PgnComment | null;
  result: string | null;
}

/** Posición resuelta para un camino concreto del árbol. */
export interface PgnPosition {
  fen: string;
  lastMove: [string, string] | null;
  node: PgnMoveNode | null;
}

// ---------------------------------------------------------------------- #
// Reparación de doble codificación (mojibake UTF-8 → Latin-1)
// ---------------------------------------------------------------------- #

/** Bytes leading del UTF-8 mal decodificado: C3→"Ã", C2→"Â", E2→"â". */
const MOJIBAKE_MARKERS_RE = /[ÃÂâ]/;

/** Mapa de respaldo para entornos sin TextDecoder o secuencias mixtas. */
const MOJIBAKE_FALLBACK: Array<[RegExp, string]> = [
  [/Ã¡/g, "á"],
  [/Ã©/g, "é"],
  [/Ã­/g, "í"],
  [/Ã³/g, "ó"],
  [/Ãº/g, "ú"],
  [/Ã±/g, "ñ"],
  [/Ã‘/g, "Ñ"],
  [/Ã¼/g, "ü"],
  [/Â¿/g, "¿"],
  [/Â¡/g, "¡"],
  [/Â«/g, "«"],
  [/Â»/g, "»"],
  [/â€“/g, "–"],
  [/â€”/g, "—"],
  [/â€œ/g, "“"],
  [/â€\u009d/g, "”"],
  [/â€™/g, "’"],
  [/Ã/g, "Á"],
];

/**
 * Repara texto con doble codificación ("PeÃ³n" → "Peón").
 *
 * Los PGN antiguos se importaron leyendo UTF-8 como Latin-1/cp1252, por lo
 * que cada byte UTF-8 quedó convertido en 1-2 caracteres latinos. La
 * reparación reconstruye los bytes originales y los decodifica como UTF-8.
 * Es idempotente: un texto ya limpio nunca forma secuencias UTF-8 válidas
 * con esos bytes y queda intacto.
 */
export function fixEncoding(text: string): string {
  if (!text || !MOJIBAKE_MARKERS_RE.test(text)) return text;
  try {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code > 0xff) throw new RangeError("no es mojibake latin-1");
      bytes[i] = code;
    }
    if (typeof TextDecoder === "undefined") throw new RangeError("sin decoder");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    let out = text;
    for (const [re, replacement] of MOJIBAKE_FALLBACK) {
      out = out.replace(re, replacement);
    }
    return out;
  }
}

// ---------------------------------------------------------------------- #
// Marcas visuales de Lichess ([%csl …] / [%cal …])
// ---------------------------------------------------------------------- #

const CSL_RE = /\[%csl\s+([^\]]*)\]/gi;
const CAL_RE = /\[%cal\s+([^\]]*)\]/gi;

/** Letras de color válidas en las marcas de Lichess. */
const PGN_COLORS: ReadonlySet<string> = new Set(["G", "R", "Y", "B"]);

/**
 * Extrae las marcas visuales de un comentario PGN:
 *  - `[%csl Ga4,b5]` → casillas resaltadas con su color.
 *  - `[%cal Gd1d8,Re8e1]` → flechas origen→destino con su color.
 * Devuelve también el texto del comentario ya limpio de esas directivas.
 */
export function extractPgnDrawings(comment: string): {
  text: string;
  highlights: HighlightMark[];
  arrows: ArrowMark[];
} {
  // Sanea posibles caracteres corruptos antes de cualquier procesamiento.
  let text = fixEncoding(comment);
  const highlights: HighlightMark[] = [];
  const arrows: ArrowMark[] = [];

  text = text.replace(CSL_RE, (_m, list: string) => {
    for (const part of list.split(",")) {
      const t = part.trim();
      if (!t) continue;
      const color = t[0].toUpperCase();
      const sq = t.slice(1);
      if (PGN_COLORS.has(color) && /^[a-h][1-8]$/.test(sq)) {
        highlights.push({ square: sq, color: color as PgnColor });
      }
    }
    return "";
  });

  text = text.replace(CAL_RE, (_m, list: string) => {
    for (const part of list.split(",")) {
      const t = part.trim();
      const m = /^[GYRB]([a-h][1-8])([a-h][1-8])$/i.exec(t);
      if (m) {
        arrows.push({
          from: m[1],
          to: m[2],
          color: t[0].toUpperCase() as PgnColor,
        });
      }
    }
    return "";
  });

  return {
    text: text.replace(/\s+/g, " ").trim(),
    highlights,
    arrows,
  };
}

export function parseCommentMarkup(raw: string): PgnComment {
  const { text, highlights, arrows } = extractPgnDrawings(raw);
  return { text, highlights, arrows };
}

function mergeComments(parts: string[]): PgnComment | null {
  if (parts.length === 0) return null;
  const merged = parts.join("\n\n");
  const parsed = parseCommentMarkup(merged);
  if (!parsed.text && parsed.highlights.length === 0 && parsed.arrows.length === 0)
    return null;
  return parsed;
}

// ---------------------------------------------------------------------- #
// NAGs ($1, $14, …) → glifos
// ---------------------------------------------------------------------- //

const NAG_GLYPHS: Record<number, string> = {
  1: "!",
  2: "?",
  3: "!!",
  4: "??",
  5: "!?",
  6: "?!",
  7: "□",
  10: "=",
  13: "∞",
  14: "⩲",
  15: "⩱",
  16: "±",
  17: "∓",
  18: "+−",
  19: "−+",
  36: "→",
  40: "↑",
  44: "⇆",
};

function nagGlyph(code: number): string {
  return NAG_GLYPHS[code] ?? `nag${code}`;
}

// ---------------------------------------------------------------------- #
// Tokenizer del cuerpo de jugadas (movetext)
// ---------------------------------------------------------------------- //

type Token =
  | { t: "move"; san: string }
  | { t: "num"; dots: number }
  | { t: "comment"; text: string }
  | { t: "open" }
  | { t: "close" }
  | { t: "nag"; code: number }
  | { t: "result"; text: string };

const WORD_BREAK = new Set(["{", "}", "(", ")", ";", "$"]);
const RESULT_RE = /^(1-0|0-1|1\/2-1\/2|\*)$/;

function tokenizeMovetext(movetext: string): Token[] {
  const tokens: Token[] = [];
  const s = movetext;
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (/\s/.test(c)) {
      i += 1;
      continue;
    }

    if (c === "{") {
      // En PGN el comentario termina en la primera '}' (sin escapes).
      const end = s.indexOf("}", i + 1);
      const stop = end === -1 ? s.length : end;
      tokens.push({ t: "comment", text: s.slice(i + 1, stop) });
      i = stop + 1;
      continue;
    }

    if (c === ";") {
      // Comentario hasta fin de línea.
      const end = s.indexOf("\n", i + 1);
      const stop = end === -1 ? s.length : end;
      tokens.push({ t: "comment", text: s.slice(i + 1, stop) });
      i = stop + 1;
      continue;
    }

    if (c === "(") {
      tokens.push({ t: "open" });
      i += 1;
      continue;
    }

    if (c === ")") {
      tokens.push({ t: "close" });
      i += 1;
      continue;
    }

    if (c === "$") {
      let j = i + 1;
      while (j < s.length && /[0-9]/.test(s[j])) j += 1;
      tokens.push({ t: "nag", code: Number(s.slice(i + 1, j)) || 0 });
      i = j;
      continue;
    }

    // Palabra: número de jugada, resultado o SAN (soporta "1.e4" pegado).
    let j = i;
    while (
      j < s.length &&
      !/\s/.test(s[j]) &&
      !WORD_BREAK.has(s[j])
    ) {
      j += 1;
    }
    const word = s.slice(i, j);
    i = j;
    if (!word) continue;

    const numMatch = /^(\d+)(\.*)$/.exec(word);
    if (numMatch) {
      tokens.push({ t: "num", dots: numMatch[2].length });
      continue;
    }

    const glued = /^(\d+)(\.+)(.*)$/.exec(word);
    if (glued) {
      tokens.push({ t: "num", dots: glued[2].length });
      // Re-procesa la parte pegada al número (p. ej. "e4" en "1.e4").
      i = j - glued[3].length;
      continue;
    }

    if (RESULT_RE.test(word)) {
      tokens.push({ t: "result", text: word });
      continue;
    }

    tokens.push({ t: "move", san: word });
  }

  return tokens;
}

// ---------------------------------------------------------------------- #
// Parser recursivo (árbol crudo, sin FENs todavía)
// ---------------------------------------------------------------------- //

interface RawNode {
  san: string;
  commentsBefore: string[];
  commentsAfter: string[];
  nags: number[];
  variations: RawNode[][];
}

interface ParseState {
  tokens: Token[];
  pos: number;
}

interface RawLineResult {
  nodes: RawNode[];
  /** Variantes huérfanas: "( … )" antes de la primera jugada del nivel. */
  orphans: RawNode[][];
}

function parseRawLine(state: ParseState, depth: number): RawLineResult {
  const nodes: RawNode[] = [];
  const orphans: RawNode[][] = [];
  // Comentarios vistos desde la última jugada: si ya hay un nodo previo en
  // este nivel son comentarios "after" de ese nodo; si no, "before" de la
  // primera jugada que venga.
  let pendingComments: string[] = [];

  while (state.pos < state.tokens.length) {
    const tok = state.tokens[state.pos];

    if (tok.t === "close") {
      if (depth > 0) state.pos += 1;
      break;
    }

    if (tok.t === "comment") {
      pendingComments.push(tok.text);
      state.pos += 1;
      continue;
    }

    if (tok.t === "open") {
      state.pos += 1;
      const sub = parseRawLine(state, depth + 1);
      if (nodes.length > 0) {
        nodes[nodes.length - 1].variations.push(sub.nodes);
        // Variantes colgadas antes de la primera jugada de la sub-línea.
        nodes[nodes.length - 1].variations.push(...sub.orphans);
      } else {
        orphans.push(sub.nodes, ...sub.orphans);
      }
      continue;
    }

    if (tok.t === "nag") {
      if (nodes.length > 0 && tok.code > 0) nodes[nodes.length - 1].nags.push(tok.code);
      state.pos += 1;
      continue;
    }

    if (tok.t === "num") {
      // Los números de jugada se recalculan desde el tablero; solo se consumen.
      state.pos += 1;
      continue;
    }

    if (tok.t === "result") {
      // Fin de la partida: se detiene este nivel (el resultado lo recoge el caller).
      break;
    }

    // tok.t === "move"
    let commentsBefore: string[] = [];
    if (nodes.length > 0) {
      // Comentarios intercalados tras la jugada anterior.
      nodes[nodes.length - 1].commentsAfter.push(...pendingComments);
    } else {
      commentsBefore = pendingComments;
    }
    pendingComments = [];

    const node: RawNode = {
      san: tok.san,
      commentsBefore,
      commentsAfter: [],
      nags: [],
      variations: [],
    };
    nodes.push(node);
    state.pos += 1;
  }

  // Comentarios finales tras la última jugada (sin jugada siguiente).
  if (pendingComments.length > 0 && nodes.length > 0) {
    nodes[nodes.length - 1].commentsAfter.push(...pendingComments);
  }

  return { nodes, orphans };
}

// ---------------------------------------------------------------------- #
// Cabeceras
// ---------------------------------------------------------------------- //

function splitHeaders(pgn: string): {
  headers: Record<string, string>;
  movetext: string;
} {
  const headers: Record<string, string> = {};
  const lines = pgn.replace(/^\uFEFF/, "").split(/\r?\n/);
  let idx = 0;
  const headerRe = /^\s*\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/;
  while (idx < lines.length) {
    const m = headerRe.exec(lines[idx]);
    if (!m) break;
    headers[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    idx += 1;
  }
  return { headers, movetext: lines.slice(idx).join("\n") };
}

// ---------------------------------------------------------------------- #
// Materialización: aplica las jugadas con chess.js y calcula FENs
// ---------------------------------------------------------------------- //

function safeChess(fen?: string): Chess {
  try {
    return new Chess(fen && fen.trim() ? fen : undefined);
  } catch {
    return new Chess();
  }
}

/** Normaliza el SAN del PGN para que chess.js lo acepte. */
function cleanSan(san: string): string {
  return san
    .replace(/0-0-0/g, "O-O-O")
    .replace(/0-0/g, "O-O")
    .replace(/[!?]+$/g, "")
    .replace(/[?!](?=[A-Za-z])/g, "")
    .trim();
}

function materializeLine(rawLine: RawNode[], fenBefore: string): PgnLine {
  const game = safeChess(fenBefore);
  const out: PgnLine = [];

  for (const rn of rawLine) {
    // Posición ANTES de esta jugada: de aquí parten sus variantes (que la
    // reemplazan, así que comienzan con el mismo bando que esta jugada).
    const fenThisMove = game.fen();
    const moveNumber = game.moveNumber();
    const side = game.turn();
    let applied: { from: string; to: string } | null = null;
    try {
      const mv = game.move(cleanSan(rn.san));
      applied = { from: mv.from, to: mv.to };
    } catch {
      // Jugada ilegal/no reconocida: el nodo se conserva (sin filtrar),
      // pero el tablero no cambia al seleccionarlo.
    }

    const fenAfter = applied ? game.fen() : "";
    const node: PgnMoveNode = {
      san: rn.san,
      side,
      moveNumber,
      commentBefore: mergeComments(rn.commentsBefore),
      commentAfter: mergeComments(rn.commentsAfter),
      nags: rn.nags.map(nagGlyph),
      variations: rn.variations.map((v) => materializeLine(v, fenThisMove)),
      from: applied?.from ?? null,
      to: applied?.to ?? null,
      fenAfter,
    };
    out.push(node);
  }

  return out;
}

// ---------------------------------------------------------------------- #
// API pública
// ---------------------------------------------------------------------- //

/**
 * Parsea un PGN completo conservando comentarios, NAGs y variantes anidadas.
 * `fallbackFen` se usa si el PGN no trae cabecera [FEN].
 */
export function parsePgn(pgn: string, fallbackFen?: string): ParsedPgn {
  const { headers, movetext } = splitHeaders(pgn ?? "");

  const headerFen = headers["FEN"]?.trim();
  let initialFen = START_FEN;
  for (const candidate of [headerFen, fallbackFen]) {
    if (candidate) {
      try {
        new Chess(candidate);
        initialFen = candidate;
        break;
      } catch {
        /* FEN inválido: prueba el siguiente candidato */
      }
    }
  }

  const tokens = tokenizeMovetext(movetext);
  const state: ParseState = { tokens, pos: 0 };

  // Comentario inicial: comentarios que aparecen antes de la primera jugada.
  const initialComments: string[] = [];
  while (state.pos < tokens.length && tokens[state.pos].t === "comment") {
    initialComments.push((tokens[state.pos] as { t: "comment"; text: string }).text);
    state.pos += 1;
  }

  const { nodes } = parseRawLine(state, 0);

  let result: string | null = null;
  for (let k = state.pos; k < tokens.length; k += 1) {
    const tk = tokens[k];
    if (tk.t === "result") {
      result = tk.text;
      break;
    }
  }

  const mainLine = materializeLine(nodes, initialFen);

  return {
    headers,
    initialFen,
    mainLine,
    initialComment: mergeComments(initialComments),
    result,
  };
}

// ---------------------------------------------------------------------- #
// Navegación por "caminos" del árbol
//
// Un `path` tiene longitud impar: [idx0, varIdx1, idx1, varIdx2, idx2, …]
// donde idx0 es el índice dentro de la línea principal; varIdx1 la variante
// elegida del nodo anterior, etc. [] representa la posición inicial.
// ---------------------------------------------------------------------- //

export function pathsEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Nodo final del camino (o null si el camino apunta a la posición inicial). */
export function nodeAt(parsed: ParsedPgn, path: number[]): PgnMoveNode | null {
  let line = parsed.mainLine;
  let node: PgnMoveNode | null = null;
  for (let i = 0; i < path.length; ) {
    node = line[path[i]] ?? null;
    if (!node) return null;
    i += 1;
    if (i < path.length) {
      const varLine = node.variations[path[i]];
      if (!varLine || varLine.length === 0) return null;
      line = varLine;
      i += 1;
    }
  }
  return node;
}

/** Línea (principal o variante) que contiene el nodo final del camino. */
export function lineAt(parsed: ParsedPgn, path: number[]): PgnLine {
  if (path.length <= 1) return parsed.mainLine;
  // path = […prefijo, varIdx, nodeIdx]: la variante es el penúltimo elemento.
  const varIdx = path[path.length - 2];
  const parentNode = nodeAt(parsed, path.slice(0, -2));
  const varLine = parentNode?.variations[varIdx];
  return varLine ?? parsed.mainLine;
}

/** Resuelve la posición (FEN + última jugada) para representarla en el tablero. */
export function resolvePosition(
  parsed: ParsedPgn,
  path: number[]
): PgnPosition {
  const node = nodeAt(parsed, path);
  if (!node) {
    return { fen: parsed.initialFen, lastMove: null, node: null };
  }
  return {
    fen: node.fenAfter || parsed.initialFen,
    lastMove: node.from && node.to ? [node.from, node.to] : null,
    node,
  };
}

/** Siguiente posición dentro de la línea actual (desciende a la 1ª variante al terminar). */
export function nextPath(parsed: ParsedPgn, path: number[]): number[] | null {
  if (path.length === 0) {
    return parsed.mainLine.length > 0 ? [0] : null;
  }
  const line = lineAt(parsed, path);
  const last = path[path.length - 1];
  if (last + 1 < line.length) {
    return [...path.slice(0, -1), last + 1];
  }
  const node = nodeAt(parsed, path);
  if (node && node.variations.length > 0 && node.variations[0].length > 0) {
    return [...path, 0, 0];
  }
  return null;
}

/** Posición anterior (sube a la línea padre si está al inicio de una variante). */
export function prevPath(path: number[]): number[] | null {
  if (path.length === 0) return null;
  const last = path[path.length - 1];
  if (last > 0) return [...path.slice(0, -1), last - 1];
  return path.slice(0, path.length - 2);
}

/** Última posición alcanzable siguiendo siempre la continuación principal. */
export function lastPath(parsed: ParsedPgn): number[] {
  let path: number[] = [];
  for (;;) {
    const nxt = nextPath(parsed, path);
    if (!nxt) return path;
    path = nxt;
  }
}

/**
 * Nº de semi-jugadas aplicadas hasta la posición del camino.
 * Cada segmento suma su índice+1; al entrar en una variante se resta 1
 * porque el primer nodo de la variante REEMPLAZA la jugada de la línea padre.
 */
export function pathPly(path: number[]): number {
  let ply = 0;
  for (let i = 0; i < path.length; i += 2) {
    ply += path[i] + 1;
    if (i + 1 < path.length) ply -= 1;
  }
  return ply;
}

// ---------------------------------------------------------------------- #
// PGN anotado de las Partidas Guiadas de Apertura
//
// Las evaluaciones del Gran Maestro (momentos críticos, regla de oro y
// veredicto) se incrustan como comentarios `{...}` en el propio PGN, ya sea
// para visualizarlo en el tablero de Reproducción como para guardarlo en el
// histórico del alumno.
// ---------------------------------------------------------------------- //

export interface GuidedOpeningPgnInput {
  /** Jugadas SAN completas desde la posición inicial (incluye la línea de la apertura). */
  moves: { san: string }[];
  whitePlayer: string;
  blackPlayer: string;
  openingName?: string;
  ecoCode?: string;
  result?: string;
  /** Feedback del Gran Maestro para incrustar las anotaciones. */
  feedback?: import("./types").AuditGameAnalysisResponse | null;
}

function safePgnComment(text: string): string {
  return (text || "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

function formatEval(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

/**
 * Construye el PGN completo de una partida guiada con las anotaciones del
 * Gran Maestro incrustadas como comentarios:
 *  - comentario inicial con la apertura (ECO + nombre);
 *  - un comentario `{Momento crítico …}` tras cada jugada señalada;
 *  - la "regla de oro" y el veredicto del autodiagnóstico al final.
 */
export function buildGuidedOpeningPgn(input: GuidedOpeningPgnInput): string {
  const { moves, whitePlayer, blackPlayer } = input;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  const result = input.result || "*";

  const headerLines = [
    `[Event "Partida Guiada de Apertura"]`,
    `[Site "EntrenadorIA"]`,
    `[Date "${today}"]`,
    `[White "${whitePlayer || "Blancas"}"]`,
    `[Black "${blackPlayer || "Negras"}"]`,
    `[Result "${result}"]`,
  ];
  if (input.openingName) {
    const openingHeader = input.ecoCode
      ? `${input.ecoCode} – ${input.openingName}`
      : input.openingName;
    headerLines.push(`[Opening "${openingHeader}"]`);
  }

  const parts: string[] = [];
  if (input.openingName) {
    const intro = input.ecoCode
      ? `Apertura: ${input.ecoCode} – ${input.openingName}. Partida guiada contra el libro de aperturas.`
      : `Apertura: ${input.openingName}. Partida guiada contra el libro de aperturas.`;
    parts.push(`{${safePgnComment(intro)}}`);
  }

  const commentsByPly: Map<number, string> = new Map();
  if (input.feedback) {
    for (const cm of input.feedback.general_ai_analysis.critical_moments) {
      if (!cm || !cm.ply || cm.ply < 1 || cm.ply > moves.length) continue;
      const text = safePgnComment(
        `Momento crítico (ev. ${formatEval(cm.eval_change)}): ${cm.explanation}`,
      );
      if (text) commentsByPly.set(cm.ply, `{${text}}`);
    }
  }

  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) parts.push(`${Math.floor(i / 2) + 1}.`);
    parts.push(moves[i].san);
    const comment = commentsByPly.get(i + 1);
    if (comment) parts.push(comment);
  }

  if (input.feedback) {
    const takeaway = safePgnComment(input.feedback.tutor_feedback.takeaway_lesson);
    if (takeaway) parts.push(`{Regla de oro: ${takeaway}}`);
    parts.push(
      input.feedback.is_user_analysis_sufficient
        ? `{El autodiagnóstico fue suficiente.}`
        : `{El autodiagnóstico fue insuficiente: revisa la corrección del tutor.}`,
    );
  }

  parts.push(result);
  return `${headerLines.join("\n")}\n\n${parts.join(" ")}`;
}
