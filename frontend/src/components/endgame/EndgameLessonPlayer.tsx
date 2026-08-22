"use client";

// Contenedor de la lección de finales con sus dos modos:
//  - "Teoría (PGN)": visor explicativo interactivo con auto-play y voz.
//  - "Práctica": tablero interactivo contra Stockfish.
import { useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ScrollText, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EndgameLessonDetail } from "@/lib/types";
import { updateEndgameProgress } from "@/lib/api";
import { EndgamePracticeBoard } from "./EndgamePracticeBoard";
import { PgnStudyViewer } from "./PgnStudyViewer";

interface EndgameLessonPlayerProps {
  lesson: EndgameLessonDetail;
}

export function EndgameLessonPlayer({ lesson }: EndgameLessonPlayerProps) {
  // Marca la lección como "en progreso" la primera vez que el usuario
  // interactúa con la teoría (antes lo hacía el reproductor de audio).
  const progressMarkedRef = useRef(false);
  const markInProgress = useCallback(() => {
    if (progressMarkedRef.current) return;
    progressMarkedRef.current = true;
    updateEndgameProgress(lesson.slug, "in_progress", 0).catch(() => {
      /* progreso en segundo plano: no bloquea la UI */
    });
  }, [lesson.slug]);

  return (
    <div className="space-y-4">
      {/* Botón de retorno (visible en Teoría y Práctica). Va FUERA de <Tabs>
          porque Tabs inyecta activeTab/setActiveTab vía cloneElement solo en
          sus hijos directos: envolver TabsList rompería el cambio de pestaña. */}
      <div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/entrenamiento/finales">
            <ArrowLeft className="h-4 w-4" />
            Volver a la Academia
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="theory" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="theory" className="gap-2">
            <ScrollText className="h-4 w-4" />
            Teoría (PGN)
          </TabsTrigger>
          <TabsTrigger value="practice" className="gap-2">
            <Swords className="h-4 w-4" />
            Práctica
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Teoría (PGN completo sincronizado) ── */}
        <TabsContent value="theory">
          {lesson.pgn_content ? (
            <PgnStudyViewer
              pgnContent={lesson.pgn_content}
              initialFen={lesson.initial_fen}
              initialComment={lesson.initial_comment}
              finalComment={lesson.final_comment}
              onActivity={markInProgress}
            />
          ) : (
            <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              Esta lección todavía no tiene PGN teórico disponible.
            </p>
          )}
        </TabsContent>

        {/* ── Tab: Práctica (Stockfish Interactive) ── */}
        <TabsContent value="practice">
          <EndgamePracticeBoard lesson={lesson} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
