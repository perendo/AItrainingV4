import { Chess } from "chess.js";
import { apiFetch } from "./api";
import type { TaskResponse } from "./types";

const LICHESS_GAMES_URL = "https://lichess.org/api/games/user";

export type LichessResult =
  | "Victoria"
  | "Derrota"
  | "Tablas"
  | "Sin terminar";

export interface LichessGamePreview {
  pgn: string;
  white: string;
  black: string;
  rival: string;
  playerColor: "white" | "black";
  result: LichessResult;
  resultRaw: string;
  date: string;
  speed: string;
  event: string;
  timeControl: string;
}

/**
 * Separa un flujo de texto con N PGNs concatenados (respuesta de la API
 * pública de Lichess con pgnInBody=true) en PGNs individuales.
 * Cada partida empieza con su cabecera [Event "..."].
 */
export function splitPgnStream(text: string): string[] {
  return text
    .split(/(?=^\[Event )/m)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function resultLabel(
  result: string,
  isWhite: boolean
): LichessResult {
  if (result === "1/2-1/2") return "Tablas";
  if (result === "1-0") return isWhite ? "Victoria" : "Derrota";
  if (result === "0-1") return isWhite ? "Derrota" : "Victoria";
  return "Sin terminar";
}

export function formatGameDate(dateStr?: string, timeStr?: string): string {
  if (!dateStr) return "Fecha desconocida";
  const [y, m, d] = dateStr.split(".").map((part) => parseInt(part, 10));
  if (!y || !m || !d) return dateStr;
  const date = new Date(Date.UTC(y, m - 1, d));
  const base = date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return timeStr && timeStr.length >= 5
    ? `${base} · ${timeStr.slice(0, 5)}`
    : base;
}

const SPEED_ALIASES: Array<[string, string]> = [
  ["ultrabullet", "UltraBullet"],
  ["bullet", "Bullet"],
  ["blitz", "Blitz"],
  ["rapid", "Rapid"],
  ["classical", "Classical"],
  ["correspondence", "Correspondence"],
];

export function speedFromTimeControl(timeControl?: string): string {
  if (!timeControl) return "Classical";
  const [baseStr, incStr = "0"] = timeControl.split("+");
  const base = parseInt(baseStr, 10);
  const inc = parseInt(incStr, 10);
  if (!Number.isFinite(base) || base <= 0) return "Classical";
  const estimated = base + 40 * inc;
  if (estimated < 30) return "UltraBullet";
  if (estimated < 180) return "Bullet";
  if (estimated < 480) return "Blitz";
  if (estimated < 1500) return "Rapid";
  return "Classical";
}

export function speedLabel(event: string, timeControl?: string): string {
  const lower = event.toLowerCase();
  for (const [alias, label] of SPEED_ALIASES) {
    if (lower.includes(alias)) return label;
  }
  return speedFromTimeControl(timeControl);
}

function parseSinglePgn(
  pgn: string,
  username: string
): LichessGamePreview | null {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return null;
  }

  const headers = chess.getHeaders();
  const white = (headers.White || "?").trim();
  const black = (headers.Black || "?").trim();
  const target = username.trim().toLowerCase();
  const isWhite = white.toLowerCase() === target;
  const isBlack = black.toLowerCase() === target;
  if (!isWhite && !isBlack) return null;

  const resultRaw = (headers.Result || "*").trim();
  const event = headers.Event || "";

  return {
    pgn,
    white,
    black,
    rival: isWhite ? black : white,
    playerColor: isWhite ? "white" : "black",
    result: resultLabel(resultRaw, isWhite),
    resultRaw,
    date: formatGameDate(headers.UTCDate || headers.Date, headers.UTCTime),
    speed: speedLabel(event, headers.TimeControl),
    event,
    timeControl: headers.TimeControl || "",
  };
}

export function parseLichessPgnStream(
  text: string,
  username: string
): LichessGamePreview[] {
  const games: LichessGamePreview[] = [];
  for (const pgn of splitPgnStream(text)) {
    const game = parseSinglePgn(pgn, username);
    if (game) games.push(game);
  }
  return games;
}

/**
 * Consulta el endpoint público de Lichess y devuelve una vista previa de las
 * últimas 10 partidas del usuario indicado.
 */
export async function fetchLichessGames(
  username: string
): Promise<LichessGamePreview[]> {
  const name = username.trim();
  const params = new URLSearchParams({
    max: "10",
    pgnInBody: "true",
    clocks: "false",
    evals: "false",
  });
  const url = `${LICHESS_GAMES_URL}/${encodeURIComponent(name)}?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(
      "No se pudo conectar con Lichess. Verifica tu conexión a internet."
    );
  }

  if (res.status === 404) {
    throw new Error(
      `El usuario de Lichess "${name}" no existe o no tiene partidas públicas.`
    );
  }
  if (res.status === 400) {
    throw new Error(
      `Nombre de usuario de Lichess inválido: "${name}".`
    );
  }
  if (res.status === 429) {
    throw new Error(
      "Lichess ha limitado temporalmente las peticiones. Inténtalo de nuevo en unos minutos."
    );
  }
  if (!res.ok) {
    throw new Error(`Error al consultar Lichess (HTTP ${res.status}).`);
  }

  const text = await res.text();
  return parseLichessPgnStream(text, name);
}

/**
 * Une varios PGNs individuales en un único flujo PGN para enviarlo de golpe al
 * backend (que lo procesa y analiza en segundo plano).
 */
export function combinePgnStream(games: Pick<LichessGamePreview, "pgn">[]): string {
  return games.map((game) => game.pgn.trim()).join("\n\n");
}

/**
 * Envía el PGN (una partida o un flujo con N partidas) al backend para
 * guardarlo en la BD e iniciar el análisis del Entrenador IA (Stockfish) en
 * segundo plano.
 */
export async function analyzeLichessGame(
  username: string,
  pgn: string
): Promise<TaskResponse> {
  const safeName =
    username.replace(/[^a-zA-Z0-9_-]/g, "") || "usuario";
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([pgn], { type: "application/x-chess-pgn" }),
    `lichess-${safeName}.pgn`
  );
  return apiFetch<TaskResponse>("/api/v1/games/upload-pgn", {
    method: "POST",
    body: formData,
  });
}
