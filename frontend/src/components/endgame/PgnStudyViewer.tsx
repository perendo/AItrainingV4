"use client";

// Visor de estudio teórico para los finales: renderiza el PGN completo
// (comentarios, NAGs y variantes secundarias) sincronizado con el tablero,
// con reproducción automática paso a paso y lectura por voz (TTS) de las
// explicaciones teóricas.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Arrow } from "react-chessboard/dist/chessboard/types";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useChessSounds } from "@/hooks/useChessSounds";
import {
  fixEncoding,
  lastPath,
  nextPath,
  parsePgn,
  parseCommentMarkup,
  pathPly,
  pathsEqual,
  prevPath,
  resolvePosition,
  PGN_SQUARE_COLORS,
  PGN_ARROW_COLORS,
  type PgnComment,
  type PgnLine,
} from "@/lib/pgn";

const DynamicChessboard = dynamic(
  () => import("react-chessboard").then((mod) => ({ default: mod.Chessboard })),
  { ssr: false }
);

/** Intervalo entre jugadas del auto-play (ms). */
const AUTOPLAY_INTERVAL_MS = 500;
interface ReadingTarget {
  path: number[];
  part: "before" | "after" | "intro";
}

interface PgnStudyViewerProps {
  pgnContent: string;
  /** FEN de respaldo si el PGN no trae cabecera [FEN]. */
  initialFen?: string;
  /** Comentario introductorio de la lección (fallback al inicio). */
  initialComment?: string | null;
  /** Conclusión teórica que se muestra al final de la línea principal. */
  finalComment?: string | null;
  /** Se dispara (una vez) ante la primera interacción del usuario. */
  onActivity?: () => void;
}

const HIGHLIGHT_STYLE: React.CSSProperties = {
  backgroundColor: "rgba(250, 204, 21, 0.55)",
};

/** Burbuja de comentario clicable (navega a la posición que describe). */
function CommentBubble({
  comment,
  reading,
  onClick,
}: {
  comment: PgnComment;
  reading: boolean;
  onClick: () => void;
}) {
  if (!comment.text) return null;
  return (
    <button
      type="button"
      data-pgn-comment="true"
      data-reading={reading ? "true" : undefined}
      onClick={onClick}
      title={comment.text}
      className={cn(
        "mx-0.5 max-w-[260px] cursor-pointer rounded px-1 py-0.5 text-left align-middle",
        "bg-amber-100 text-[11px] italic leading-snug text-amber-900",
        "hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-950",
        reading &&
          "ring-2 ring-amber-400 bg-amber-200 font-medium dark:bg-amber-900/80"
      )}
    >
      {comment.text}
    </button>
  );
}

/** Render recursivo de una línea (principal o variante) del PGN. */
function LineView({
  line,
  basePath,
  currentPath,
  reading,
  onSelect,
  depth,
}: {
  line: PgnLine;
  /** Prefijo del camino ANTES del índice del primer nodo de esta línea. */
  basePath: number[];
  currentPath: number[];
  reading: ReadingTarget | null;
  onSelect: (path: number[]) => void;
  depth: number;
}) {
  return (
    <span
      data-variant-line={depth > 0 ? "true" : undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-1 gap-y-1",
        depth > 0 &&
          "my-1 ml-3 w-full rounded-r-md border-l-2 border-amber-400/60 bg-muted/40 px-2 py-1 text-xs text-muted-foreground dark:bg-white/[0.04]"
      )}
    >
      {depth > 0 && <span aria-hidden="true" className="font-semibold">(</span>}
      {line.map((node, j) => {
        const movePath = [...basePath, j];
        const isCurrent = pathsEqual(currentPath, movePath);
        // Posición previa a esta jugada (para el comentario "before").
        const beforePath =
          j > 0 ? [...basePath, j - 1] : basePath.slice(0, -1);
        const sanLabel =
          node.san.replace(/[!?]+$/, "") + node.nags.join("");
        return (
          <span key={j} className="inline-flex flex-wrap items-center gap-x-1">
            {node.commentBefore && (
              <CommentBubble
                comment={node.commentBefore}
                reading={
                  reading !== null &&
                  pathsEqual(reading.path, movePath) &&
                  reading.part === "before"
                }
                onClick={() => onSelect(beforePath)}
              />
            )}
            {(node.side === "w" || j === 0) && (
              <span className="font-semibold text-muted-foreground">
                {node.moveNumber}
                {node.side === "b" ? "…" : "."}
              </span>
            )}
            <button
              type="button"
              data-pgn-move="true"
              ref={(el) => {
                if (isCurrent && el && typeof el.scrollIntoView === "function") {
                  el.scrollIntoView({ block: "nearest" });
                }
              }}
              onClick={() => onSelect(movePath)}
              className={cn(
                "cursor-pointer rounded px-1 py-0.5 font-medium transition-colors",
                isCurrent
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              {sanLabel}
            </button>
            {node.commentAfter && (
              <CommentBubble
                comment={node.commentAfter}
                reading={
                  reading !== null &&
                  pathsEqual(reading.path, movePath) &&
                  reading.part === "after"
                }
                onClick={() => onSelect(movePath)}
              />
            )}
            {node.variations.map((variation, vi) => (
              <LineView
                key={vi}
                line={variation}
                basePath={[...movePath, vi]}
                currentPath={currentPath}
                reading={reading}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </span>
        );
      })}
      {depth > 0 && <span aria-hidden="true" className="font-semibold">)</span>}
    </span>
  );
}

/** Soporte TTS del navegador (se comprueba una vez por montaje). */
function useTtsSupported(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    // Comprobación por verdad (no `in`): la propiedad puede existir sin valor.
    setSupported(typeof window !== "undefined" && !!window.speechSynthesis);
  }, []);
  return supported;
}

/** Normaliza un nombre: minúsculas y SIN tildes ("Álvaro" → "alvaro"). */
function normalizeVoiceName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Nombres explícitamente MASCULINOS de las voces españolas habituales. */
const MALE_NAME_KEYWORDS = [
  "alvaro", // Microsoft Álvaro / es-ES-AlvaroNeural
  "pablo", // Microsoft Pablo
  "jorge", // Microsoft Jorge (es-MX)
  "raul", // Microsoft Raúl
  "diego", // Google español de Diego? (variantes locales)
];

/**
 * Marcadores de calidad (sin indicar género). Solo desempatan entre voces
 * que ya sabemos que no son femeninas: "Elvira Online (Natural)" NO debe
 * ganar por llevar "Natural" en el nombre.
 */
const QUALITY_KEYWORDS = ["neural", "natural", "enhanced", "premium"];

/** Nombres explícitamente FEMENINOS: se descartan si hay alternativa. */
const FEMALE_NAME_KEYWORDS = [
  "elvira",
  "helena",
  "monica",
  "laura",
  "sabina",
  "isabel",
  "maria",
  "lucia",
  "esperanza",
  "dalia",
  "salome",
  "paloma",
  "female",
  "mujer",
];

/**
 * Selecciona la mejor voz masculina en español disponible. Función pura
 * (exportada para poder testearla) usada tanto por el hook como por el
 * fallback de `speak`.
 *
 * Jerarquía real:
 *  1. Nombre masculino explícito (comparación sin tildes: "Álvaro" cuenta).
 *  2. Voz de calidad (neural/natural…) entre las NO femeninas.
 *  3. Cualquier voz española no explícitamente femenina.
 *  4. Último recurso: primera voz española.
 */
export function selectSpanishMaleVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  const spanish = voices.filter((v) =>
    v.lang?.toLowerCase().startsWith("es")
  );
  if (spanish.length === 0) return null;

  const isFemaleName = (name: string) => {
    const normalized = normalizeVoiceName(name);
    return FEMALE_NAME_KEYWORDS.some((kw) => normalized.includes(kw));
  };

  // Descarta primero las femeninas explícitas (si queda alguna alternativa).
  const nonFemale = spanish.filter((v) => !isFemaleName(v.name));
  const pool = nonFemale.length > 0 ? nonFemale : spanish;

  // 1) Nombre masculino explícito.
  for (const kw of MALE_NAME_KEYWORDS) {
    const hit = pool.find((v) => normalizeVoiceName(v.name).includes(kw));
    if (hit) return hit;
  }

  // 2) Calidad neuronal entre las no femeninas.
  const quality = pool.find((v) =>
    QUALITY_KEYWORDS.some((kw) => normalizeVoiceName(v.name).includes(kw))
  );
  if (quality) return quality;

  // 3) Primera no femenina disponible.
  return pool[0];
}

/** Hook: expone la mejor voz masculina española, recargándola cuando el
 * navegador termina de cargar las voces de forma asíncrona. */
function useSpanishMaleVoice(): SpeechSynthesisVoice | null {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const updateVoice = () => {
      const best = selectSpanishMaleVoice(window.speechSynthesis.getVoices());
      if (best) setVoice(best);
    };

    // Las voces pueden cargarse de forma asíncrona; escuchar el evento.
    updateVoice();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoice);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", updateVoice);
    };
  }, []);

  return voice;
}

export function PgnStudyViewer({
  pgnContent,
  initialFen,
  initialComment,
  finalComment,
  onActivity,
}: PgnStudyViewerProps) {
  const parsed = useMemo(
    () => parsePgn(pgnContent, initialFen),
    [pgnContent, initialFen]
  );
  const [path, setPath] = useState<number[]>([]);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [playing, setPlaying] = useState(false);
  const [reading, setReading] = useState<ReadingTarget | null>(null);
  const ttsSupported = useTtsSupported();
  const spanishMaleVoice = useSpanishMaleVoice();
  const { playMoveSound } = useChessSounds();

  const activityRef = useRef(onActivity);
  activityRef.current = onActivity;
  const notifyActivity = useCallback(() => {
    activityRef.current?.();
  }, []);

  // Reinicia la vista y detiene cualquier reproducción al cambiar de lección.
  useEffect(() => {
    setPath([]);
    setPlaying(false);
    setReading(null);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [pgnContent, initialFen]);

  // Limpieza final al desmontar: nunca dejar voces colgadas.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const position = useMemo(() => resolvePosition(parsed, path), [parsed, path]);
  const totalPlies = parsed.mainLine.length;
  const currentPly = pathPly(path);
  const canNext = useMemo(() => nextPath(parsed, path) !== null, [parsed, path]);
  const canPrev = path.length > 0;
  const isAtEnd =
    hasMainLine(parsed) && pathsEqual(path, lastPath(parsed));

  /**
   * Lee un texto con la voz del navegador. Devuelve true si la lectura
   * quedó en marcha (el auto-play debe esperar su `onend`).
   */
  const speak = useCallback(
    (text: string, onDone: () => void): boolean => {
      if (
        !ttsSupported ||
        typeof window === "undefined" ||
        !window.speechSynthesis
      ) {
        return false;
      }
      try {
        // Limpia cualquier utterance previo para evitar solapamientos/bloqueos.
        window.speechSynthesis.cancel();
        // Sanea caracteres corruptos: la TTS es especialmente sensible a
        // mojibake ("PeÃ³n" se leería letra a letra).
        const utterance = new SpeechSynthesisUtterance(fixEncoding(text));
        utterance.lang = "es-ES";
        // Configuración de cadencia y tono estilo Gran Maestro: ritmo pausado
        // (0.95) y tono grave/masculino (0.9) para proyectar serenidad didáctica.
        utterance.rate = 0.95;
        utterance.pitch = 0.9;
        // Usa la voz masculina en español preseleccionada (hook useSpanishMaleVoice).
        if (spanishMaleVoice) {
          utterance.voice = spanishMaleVoice;
        } else {
          // Fallback defensivo con la MISMA jerarquía de selección.
          const fallbackVoice = selectSpanishMaleVoice(
            window.speechSynthesis.getVoices()
          );
          if (fallbackVoice) utterance.voice = fallbackVoice;
        }
        utterance.onend = onDone;
        utterance.onerror = onDone;
        window.speechSynthesis.speak(utterance);
        return true;
      } catch {
        return false;
      }
    },
    [ttsSupported, spanishMaleVoice]
  );

  // ── Sonido de jugada ───────────────────────────────────────────────────
  // Suena al AVANZAR la posición, sea por auto-play, clic en una jugada de
  // la lista o flechas de navegación (mismo patrón que LichessReplay).
  // `playMoveSound` es fire-and-forget: nunca bloquea la animación ni la voz.
  const prevPlyRef = useRef<number>(0);
  const prevPgnRef = useRef<string>(pgnContent);
  useEffect(() => {
    if (prevPgnRef.current !== pgnContent) {
      // Cambio de lección: actualiza los refs sin sonar (evita sonido fantasma).
      prevPgnRef.current = pgnContent;
      prevPlyRef.current = currentPly;
      return;
    }
    if (currentPly > prevPlyRef.current) {
      playMoveSound();
    }
    prevPlyRef.current = currentPly;
  }, [currentPly, pgnContent, playMoveSound]);

  // ── Motor del auto-play ────────────────────────────────────────────────
  // Avanza una jugada cada AUTOPLAY_INTERVAL_MS. Si la posición actual tiene
  // explicación teórica, la lee con TTS y espera a `onend` antes de seguir.
  useEffect(() => {
    if (!playing) return;

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const advanceAfterDelay = () => {
      timerId = setTimeout(() => {
        if (cancelled) return;
        const nxt = nextPath(parsed, path);
        if (nxt) {
          setPath(nxt);
        } else {
          // Fin de la línea: detiene la reproducción.
          setPlaying(false);
          setReading(null);
        }
      }, AUTOPLAY_INTERVAL_MS);
    };

    // Explicación asociada a la posición actual (jugada o introducción).
    const node = nodeAtSafe(parsed, path);
    let target: { part: ReadingTarget["part"]; text: string } | null = null;
    if (node) {
      if (node.commentAfter?.text) {
        target = { part: "after", text: node.commentAfter.text };
      } else if (node.commentBefore?.text) {
        target = { part: "before", text: node.commentBefore.text };
      }
    } else {
      const intro = parsed.initialComment?.text || initialComment || "";
      if (intro) target = { part: "intro", text: intro };
    }

    if (target && speak(target.text, advanceAfterDelay)) {
      setReading({ path, part: target.part });
    } else {
      setReading(null);
      advanceAfterDelay();
    }

    return () => {
      cancelled = true;
      if (timerId !== undefined) clearTimeout(timerId);
      // Evita voces solapadas entre posiciones/pausas/cambios de lección.
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [playing, path, parsed, initialComment, speak]);

  const stopPlayback = useCallback(() => {
    setPlaying(false);
    setReading(null);
  }, []);

  const goStart = useCallback(() => {
    stopPlayback();
    notifyActivity();
    setPath([]);
  }, [stopPlayback, notifyActivity]);

  const goPrev = useCallback(() => {
    stopPlayback();
    notifyActivity();
    setPath((p) => prevPath(p) ?? p);
  }, [stopPlayback, notifyActivity]);

  const goNext = useCallback(() => {
    stopPlayback();
    notifyActivity();
    setPath((p) => nextPath(parsed, p) ?? p);
  }, [parsed, stopPlayback, notifyActivity]);

  const goEnd = useCallback(() => {
    stopPlayback();
    notifyActivity();
    setPath(lastPath(parsed));
  }, [parsed, stopPlayback, notifyActivity]);

  const handleSelect = useCallback(
    (p: number[]) => {
      stopPlayback();
      notifyActivity();
      setPath(p);
    },
    [stopPlayback, notifyActivity]
  );

  const handleTogglePlay = useCallback(() => {
    notifyActivity();
    if (playing) {
      // Pausa manual: corta voz y temporizador vía cleanup del efecto.
      setPlaying(false);
      setReading(null);
      return;
    }
    // Si estaba al final, reinicia desde el principio.
    if (isAtEnd) setPath([]);
    setPlaying(true);
  }, [playing, isAtEnd, notifyActivity]);

  // Teclado: ← retroceder, → avanzar, Espacio reproducir/pausar.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === " ") {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goPrev, goNext, handleTogglePlay]);

  // Comentario activo mostrado en el cuadro de explicación.
  const activeComment: PgnComment | null = useMemo(() => {
    const node = position.node;
    if (!node) {
      return (
        parsed.initialComment ??
        (initialComment ? parseCommentMarkup(initialComment) : null)
      );
    }
    return node.commentAfter ?? node.commentBefore ?? null;
  }, [parsed.initialComment, initialComment, position.node]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    for (const h of activeComment?.highlights ?? []) {
      styles[h.square] = { backgroundColor: PGN_SQUARE_COLORS[h.color] };
    }
    if (position.lastMove) {
      for (const sq of position.lastMove) {
        styles[sq] = {
          ...(styles[sq] ?? {}),
          boxShadow: "inset 0 0 0 4px rgba(59, 130, 246, 0.6)",
        };
      }
    }
    return styles;
  }, [activeComment, position.lastMove]);

  const arrows = useMemo<Arrow[]>(() => {
    const out: Arrow[] = [];
    for (const a of activeComment?.arrows ?? []) {
      out.push([a.from, a.to, PGN_ARROW_COLORS[a.color]] as Arrow);
    }
    return out;
  }, [activeComment]);

  const hasMovetext = totalPlies > 0;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Tablero + controles */}
      <div className="w-full lg:w-[46%] lg:shrink-0">
        <div className="aspect-square w-full overflow-hidden rounded-lg border">
          <DynamicChessboard
            position={position.fen}
            boardOrientation={orientation}
            arePiecesDraggable={false}
            customSquareStyles={squareStyles}
            customArrows={arrows}
            customBoardStyle={{ borderRadius: "0" }}
          />
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            aria-label="Ir al inicio"
            title="Ir al inicio"
            onClick={goStart}
            disabled={!canPrev}
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Jugada anterior"
            title="Jugada anterior (←)"
            onClick={goPrev}
            disabled={!canPrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={playing ? "default" : "outline"}
            size="icon"
            aria-label={playing ? "Pausar lección" : "Reproducir lección"}
            title={
              playing
                ? "Pausar la reproducción automática (Espacio)"
                : "Reproducir la lección con voz (Espacio)"
            }
            onClick={handleTogglePlay}
            disabled={!hasMovetext}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Jugada siguiente"
            title="Jugada siguiente (→)"
            onClick={goNext}
            disabled={!canNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Ir al final"
            title="Ir al final"
            onClick={goEnd}
            disabled={!hasMovetext || isAtEnd}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Girar tablero"
            title="Girar el tablero"
            onClick={() =>
              setOrientation((o) => (o === "white" ? "black" : "white"))
            }
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          {hasMovetext && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {`${currentPly} / ${totalPlies}`}
            </Badge>
          )}
        </div>
      </div>

      {/* Notación estructurada + explicación */}
      <div className="flex w-full min-w-0 flex-col gap-4 lg:flex-1">
        <div className="rounded-lg border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Teoría de la lección</h3>
            {parsed.result && (
              <Badge variant="outline" className="ml-auto font-mono text-xs">
                {parsed.result}
              </Badge>
            )}
          </div>
          <div className="max-h-[300px] overflow-y-auto px-4 py-3 text-sm lg:max-h-[380px]">
            {!hasMovetext ? (
              <p className="text-muted-foreground">
                Esta lección no tiene jugadas en su PGN.
              </p>
            ) : (
              <>
                <LineView
                  line={parsed.mainLine}
                  basePath={[]}
                  currentPath={path}
                  reading={reading}
                  onSelect={handleSelect}
                  depth={0}
                />
                {parsed.initialComment?.text && (
                  <p
                    data-pgn-intro-comment="true"
                    data-reading={
                      reading?.part === "intro" ? "true" : undefined
                    }
                    className={cn(
                      "mt-3 rounded-md bg-amber-100 px-2 py-1.5 text-xs italic leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
                      reading?.part === "intro" &&
                        "ring-2 ring-amber-400 bg-amber-200 dark:bg-amber-900/80"
                    )}
                  >
                    {parsed.initialComment.text}
                  </p>
                )}
              </>
            )}
            {finalComment && (
              <p className="mt-3 border-t pt-2 text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold not-italic">Conclusión: </span>
                {finalComment}
              </p>
            )}
          </div>
        </div>

        {/* Cuadro de explicación destacada sincronizado con la jugada */}
        <div
          data-testid="pgn-explanation"
          className="rounded-lg border bg-card p-4"
        >
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-sm font-semibold">Explicación teórica</h3>
            {reading && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                <Volume2 className="h-3.5 w-3.5 animate-pulse" />
                Leyendo en voz alta…
              </span>
            )}
          </div>
          {activeComment?.text ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {activeComment.text}
            </p>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              Selecciona una jugada (o usa las flechas del teclado) para ver su
              explicación aquí.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Helpers locales sobre el árbol (evitan imports extra en el efecto). */
function nodeAtSafe(parsed: ReturnType<typeof parsePgn>, path: number[]) {
  return resolvePosition(parsed, path).node;
}

function hasMainLine(parsed: ReturnType<typeof parsePgn>): boolean {
  return parsed.mainLine.length > 0;
}
