"use client";

import { useEffect, useState } from "react";
import { Loader2, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EndgameLessonPlayer } from "@/components/endgame/EndgameLessonPlayer";
import { getEndgameLesson } from "@/lib/api";
import { fixEncoding } from "@/lib/pgn";
import type { EndgameLessonDetail } from "@/lib/types";

interface LessonPageProps {
  params: { slug: string };
}

/**
 * Sanea los campos de texto de la lección por si llegan con doble
 * codificación ("PeÃ³n" → "Peón"). Es idempotente: el texto limpio pasa
 * intacto, así que puede aplicarse siempre sin comprobar el origen.
 */
function sanitizeLesson(lesson: EndgameLessonDetail): EndgameLessonDetail {
  return {
    ...lesson,
    title: fixEncoding(lesson.title),
    chapter_name: lesson.chapter_name
      ? fixEncoding(lesson.chapter_name)
      : lesson.chapter_name,
    concept: lesson.concept ? fixEncoding(lesson.concept) : lesson.concept,
    pgn_content: lesson.pgn_content
      ? fixEncoding(lesson.pgn_content)
      : lesson.pgn_content,
    initial_comment: lesson.initial_comment
      ? fixEncoding(lesson.initial_comment)
      : lesson.initial_comment,
    final_comment: lesson.final_comment
      ? fixEncoding(lesson.final_comment)
      : lesson.final_comment,
    podcast_script: lesson.podcast_script
      ? fixEncoding(lesson.podcast_script)
      : lesson.podcast_script,
  };
}

export default function EndgameLessonPage({ params }: LessonPageProps) {
  const slug = params.slug;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lesson, setLesson] = useState<EndgameLessonDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getEndgameLesson(slug)
      .then((data) => {
        if (!cancelled) setLesson(sanitizeLesson(data));
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar la lección."
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="space-y-6">
      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando lección...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {lesson && (
        <>
          <div className="space-y-2">
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
              <Crown className="h-7 w-7 text-amber-400" />
              {lesson.title}
            </h1>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="capitalize">
                {lesson.difficulty}
              </Badge>
              <Badge variant="outline">
                {lesson.target_result === "draw"
                  ? "Objetivo: Tablas"
                  : lesson.target_result === "win"
                  ? "Objetivo: Ganar"
                  : `Objetivo: ${lesson.target_result}`}
              </Badge>
              {!lesson.audio_url && (
                <Badge variant="outline">Sin audio</Badge>
              )}
            </div>
          </div>

          <EndgameLessonPlayer lesson={lesson} />

          {lesson.podcast_script && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Transcripción del podcast</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {lesson.podcast_script}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
