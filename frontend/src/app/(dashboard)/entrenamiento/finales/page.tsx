"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Crown, BookOpen, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getEndgameLessons } from "@/lib/api";
import type {
  EndgameLessonListItem,
  LessonCategory,
  LessonStatus,
} from "@/lib/types";

/** Clave de localStorage que recuerda la preferencia del filtro. */
const HIDE_COMPLETED_KEY = "endgame_hide_completed";

/**
 * Estados que cuentan como "terminada" a efectos del filtro. El backend
 * hoy solo emite `mastered`, pero se contempla `completed` por si evoluciona.
 */
const COMPLETED_STATUSES: readonly string[] = ["mastered", "completed"];

function isCompletedStatus(status: LessonStatus): boolean {
  return COMPLETED_STATUSES.includes(status);
}

const CATEGORY_LABELS: Record<LessonCategory, string> = {
  peones: "Peones",
  torres: "Torres",
  piezas_menores: "Piezas Menores",
  damas: "Damas",
};

const STATUS_META: Record<
  LessonStatus,
  { label: string; emoji: string; className: string }
> = {
  not_started: {
    label: "Sin empezar",
    emoji: "🔴",
    className: "border-red-500/40 bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  },
  in_progress: {
    label: "En progreso",
    emoji: "🟡",
    className: "border-amber-500/40 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  mastered: {
    label: "Dominado",
    emoji: "🟢",
    className: "border-green-500/40 bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  },
};

function targetResultLabel(target: string): string {
  if (target === "draw") return "Tablas";
  if (target === "win") return "Ganar";
  return target;
}

function LessonCard({ lesson }: { lesson: EndgameLessonListItem }) {
  const status = STATUS_META[lesson.status];
  return (
    <Link href={`/entrenamiento/finales/${lesson.slug}`} className="block">
      <Card className="h-full transition-transform hover:-translate-y-1 hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{lesson.title}</CardTitle>
            <span className="text-lg leading-none" title={status.label}>
              {status.emoji}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="capitalize">
              {lesson.difficulty}
            </Badge>
            <Badge variant="outline">{targetResultLabel(lesson.target_result)}</Badge>
            {lesson.has_audio && (
              <Badge variant="secondary" className="gap-1">
                🔊 Audio
              </Badge>
            )}
          </div>
          <Badge className={status.className}>{status.label}</Badge>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function EndgameCatalogPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Record<string, EndgameLessonListItem[]>>({});
  // Filtro "ocultar completadas": se restaura desde localStorage al montar.
  const [hideCompleted, setHideCompleted] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getEndgameLessons()
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar la Academia de Finales."
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Restaura la preferencia del usuario (localStorage puede estar bloqueado).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(HIDE_COMPLETED_KEY);
      if (stored !== null) setHideCompleted(stored === "true");
    } catch {
      /* almacenamiento no disponible: se queda en el valor por defecto */
    }
  }, []);

  const toggleHideCompleted = useCallback(() => {
    setHideCompleted((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(HIDE_COMPLETED_KEY, String(next));
      } catch {
        /* sin persistencia: el filtro funciona solo en esta sesión */
      }
      return next;
    });
  }, []);

  /** Catálogo con las lecciones dominadas ocultas (si el filtro está activo). */
  const visibleCatalog = useMemo(() => {
    if (!hideCompleted) return catalog;
    const filtered: Record<string, EndgameLessonListItem[]> = {};
    for (const [cat, lessons] of Object.entries(catalog)) {
      filtered[cat] = (lessons ?? []).filter((l) => !isCompletedStatus(l.status));
    }
    return filtered;
  }, [catalog, hideCompleted]);

  // Bloques con contenido ORIGINAL (para detectar secciones vaciadas por el filtro).
  const allCategories = useMemo(
    () =>
      (Object.keys(catalog) as LessonCategory[]).filter(
        (c) => (catalog[c]?.length ?? 0) > 0
      ),
    [catalog]
  );

  // Bloques visibles tras aplicar el filtro.
  const categories = useMemo(
    () =>
      allCategories.filter(
        (c) => (visibleCatalog[c]?.length ?? 0) > 0
      ),
    [allCategories, visibleCatalog]
  );

  /** Recuento global: pendientes frente a total. */
  const totals = useMemo(() => {
    const all = Object.values(catalog).flat();
    const done = all.filter((l) => isCompletedStatus(l.status)).length;
    return { total: all.length, pending: all.length - done };
  }, [catalog]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            <Crown className="h-7 w-7 text-amber-400" />
            Academia de Finales Teóricos
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Domina los finales clásicos con podcast explicativo y tablero
            sincronizado. Escucha, observa y resuelve los retos en el tablero.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/entrenamiento")}>
          Volver a Entrenamiento
        </Button>
      </div>

      {/* ── Barra de filtros: ocultar completadas + recuento ── */}
      {!loading && !error && totals.total > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
          <button
            type="button"
            role="switch"
            aria-checked={hideCompleted}
            aria-label="Ocultar lecciones completadas o dominadas"
            onClick={toggleHideCompleted}
            data-testid="hide-completed-switch"
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              hideCompleted ? "bg-primary" : "bg-muted-foreground/30"
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                hideCompleted ? "translate-x-[22px]" : "translate-x-0.5"
              )}
            />
          </button>
          <span
            className={cn(
              "flex items-center gap-1.5 text-sm font-medium select-none",
              hideCompleted ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <EyeOff className="h-4 w-4" />
            Ocultar completados
          </span>
          <Badge variant="outline" className="ml-auto" data-testid="pending-count">
            {totals.pending} / {totals.total} lecciones pendientes
          </Badge>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando lecciones...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && allCategories.length === 0 && (
        <div className="rounded-md border bg-card p-6 text-center text-muted-foreground">
          Aún no hay lecciones de finales disponibles.
        </div>
      )}

      {/* Todas las lecciones dominadas y filtro activo: celebración global. */}
      {!loading &&
        !error &&
        allCategories.length > 0 &&
        categories.length === 0 && (
          <div className="rounded-md border border-green-500/30 bg-green-50 p-6 text-center text-green-700 dark:border-green-500/40 dark:bg-green-950/30 dark:text-green-300">
            ¡Enhorabuena, has dominado toda la Academia de Finales! 🎉
          </div>
        )}

      {!loading &&
        !error &&
        allCategories.map((cat) => {
          const visibleLessons = visibleCatalog[cat] ?? [];
          return (
            <section key={cat} className="space-y-3">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <BookOpen className="h-5 w-5 text-primary" />
                Bloque: {CATEGORY_LABELS[cat] ?? cat}
                <Badge variant="outline">
                  {hideCompleted
                    ? `${visibleLessons.length}/${catalog[cat].length}`
                    : catalog[cat].length}
                </Badge>
              </h2>
              {visibleLessons.length === 0 ? (
                // El filtro vació la sección entera: mensaje amable.
                <div className="rounded-md border border-green-500/30 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-500/40 dark:bg-green-950/30 dark:text-green-300">
                  ¡Has dominado todos los finales de esta sección! 🎉
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleLessons.map((lesson) => (
                    <LessonCard key={lesson.slug} lesson={lesson} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
    </div>
  );
}
