"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, BookOpen, Flag, Save, RefreshCw, ExternalLink, AlertCircle, CheckCircle2, XCircle, FileDown, Play, Eye } from "lucide-react";
import { OpeningSetup } from "@/components/openings/OpeningSetup";
import { GuidedOpeningBoard } from "@/components/openings/GuidedOpeningBoard";
import {
  GuidedOpeningAnswer,
  GuidedConsultationStatus,
} from "@/components/openings/GuidedOpeningAnswer";
import { GuidedOpeningFeedbackDisplay } from "@/components/openings/GuidedOpeningFeedback";
import { OpeningStockfishBoard } from "@/components/openings/OpeningStockfishBoard";
import { useGuidedOpening, UseGuidedOpeningReturn } from "@/hooks/useGuidedOpening";
import { useChessAnalysis } from "@/hooks/useChessAnalysis";
import { useChessSounds } from "@/hooks/useChessSounds";
import { useGMConsultation } from "@/context/GMConsultationContext";
import { ReplayBoard } from "@/components/analysis/ReplayBoard";
import { PrintAnalysisReport } from "@/components/analysis/PrintAnalysisReport";
import { buildGuidedOpeningPgn } from "@/lib/pgn";
import { getGameAnalysis, getCurrentUser, saveAnalysisDraft } from "@/lib/api";
import {
  AuditGameAnalysisResponse,
  UserGameAnalysisSubmit,
} from "@/lib/types";

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function formatAnalysisDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

const USER_NAME = "Tú (Alumno)";
const BOOK_NAME = "Libro de Aperturas";

function buildConsultationQuestion(guided: UseGuidedOpeningReturn): string | null {
  const te = guided.theoryEnd;
  if (!te) return null;
  const moves = guided.moves.map((m) => m.san).join(" ");
  const fen = te.outOfTheoryFen || te.lastTheoryFen;
  const lines = [
    "Estoy entrenando la Partida Guiada de Apertura jugando contra un libro de aperturas.",
  ];
  if (te.finishedManually) {
    lines.push(
      `Terminé la línea teórica en la jugada ${te.moveNumber} sin salir del libro.`,
    );
  } else {
    lines.push(
      `Salí del libro de aperturas con la jugada ${te.deviationMove} en la jugada ${te.moveNumber}.`,
    );
  }
  if (fen) lines.push(`Posición tras esa jugada (FEN): ${fen}`);
  if (moves) lines.push(`Jugadas jugadas: ${moves}`);
  lines.push(
    te.deviationMove
      ? `¿Qué se pretende exactamente con la jugada ${te.deviationMove} en esta posición? Explícame la idea concreta de la jugada y qué plan debe seguir el bando que la ha jugado.`
      : "¿Cuál es la idea principal de la posición y el plan que debe seguir el bando que juega?",
  );
  return lines.join("\n");
}

export default function EstudioAperturasPage() {
  const guided = useGuidedOpening();
  const { playNotifySound, playErrorSound } = useChessSounds();
  const { trackAnalysis, sendConsultation, consultations } = useGMConsultation();

  const [answerText, setAnswerText] = useState("");
  const [consultationFailed, setConsultationFailed] = useState(false);
  const [feedback, setFeedback] = useState<AuditGameAnalysisResponse | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedToHistory, setSavedToHistory] = useState(false);
  const [stockfishMode, setStockfishMode] = useState(false);
  const [stockfishSaved, setStockfishSaved] = useState(false);
  const [stockfishAuditDone, setStockfishAuditDone] = useState(false);
  const [showChoice, setShowChoice] = useState(false);
  const [userName, setUserName] = useState(USER_NAME);
  const [stockfishPgn, setStockfishPgn] = useState("");
  const [stockfishResult, setStockfishResult] = useState<string>("*");
  const analysisIdRef = useRef<number | null>(null);
  const consultationIdRef = useRef<number | null>(null);
  const consultationSendingRef = useRef(false);
  const stockfishModeRef = useRef(false);

  // Cargar el nombre real del usuario para registrar la partida en el histórico.
  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((u) => {
        if (!active) return;
        const name = (u.full_name || u.username || "").trim();
        if (name) setUserName(name);
      })
      .catch(() => {
        // Mantener el nombre por defecto "Tú (Alumno)" si no se puede obtener.
      });
    return () => {
      active = false;
    };
  }, []);

  const auditCompletedInStockfish = useMemo(
    () => stockfishMode && !!feedback,
    [stockfishMode, feedback],
  );

  const stockfishProps = useMemo(() => {
    if (guided.phase !== "paused" || !guided.theoryEnd || !stockfishMode) return null;
    return {
      initialFen: guided.theoryEnd.outOfTheoryFen,
      userColor: (guided.userColor ?? "w") as "w" | "b",
      basePgnMoves: guided.moves.map((m) => ({ san: m.san })),
      openingName: guided.opening?.name,
      ecoCode: guided.opening?.eco,
      userName,
      auditDone: auditCompletedInStockfish,
    };
  }, [guided, stockfishMode, userName, auditCompletedInStockfish]);

  const handleSubmit = useCallback(
    (resp: { status: string }) => {
      if (resp.status === "completed" && analysisIdRef.current != null) {
        getGameAnalysis(analysisIdRef.current)
          .then((full) => {
            const parsed = parseJson<AuditGameAnalysisResponse>(full.gemini_feedback);
            if (!parsed) throw new Error("Feedback inválido");
            setFeedback(parsed);
            // Si el usuario sigue jugando contra Stockfish, se mantiene en el
            // tablero interactivo: solo notificamos, no abrimos el modal ni
            // pasamos a "done".
            if (stockfishModeRef.current) {
              setStockfishAuditDone(true);
              playNotifySound();
              toast.info(
                "El informe del Gran Maestro ya está listo. Guarda tu partida contra Stockfish para verlo.",
              );
            } else {
              setNoticeOpen(true);
              playNotifySound();
              toast.success("Auditoría del Gran Maestro completada.");
              guided.markDone();
            }
          })
          .catch(() => {
            setSubmitError("No se pudo obtener la auditoría completa de la partida.");
            playErrorSound();
          });
      } else if (resp.status === "failed") {
        setSubmitError("La auditoría del Gran Maestro falló. Revisa el error e inténtalo de nuevo.");
        playErrorSound();
      }
    },
    [guided, playNotifySound, playErrorSound],
  );

  const { submit: submitAnalysis, isPolling, error: pollError } = useChessAnalysis(
    handleSubmit,
    () => {
      setSubmitError(
        "La evaluación está tardando más de lo esperado. Recarga la página para reintentar.",
      );
      playErrorSound();
    },
  );

  const triggerConsultation = useCallback(() => {
    if (
      guided.phase !== "paused" ||
      consultationIdRef.current != null ||
      consultationSendingRef.current
    ) {
      return;
    }
    const question = buildConsultationQuestion(guided);
    if (!question) return;
    consultationSendingRef.current = true;
    setConsultationFailed(false);
    void sendConsultation(question).then((id) => {
      consultationSendingRef.current = false;
      if (id != null) {
        consultationIdRef.current = id;
      } else {
        setConsultationFailed(true);
      }
    });
  }, [guided, sendConsultation]);

  useEffect(() => {
    triggerConsultation();
  }, [triggerConsultation]);

  const retryConsultation = useCallback(() => {
    consultationIdRef.current = null;
    setConsultationFailed(false);
    triggerConsultation();
  }, [triggerConsultation]);

  const consultation = useMemo(
    () =>
      consultationIdRef.current != null
        ? consultations.find((c) => c.consultation_id === consultationIdRef.current) ??
          null
        : null,
    [consultations],
  );

  const consultationStatus: GuidedConsultationStatus = useMemo(() => {
    if (consultationIdRef.current != null) {
      return consultation?.status ?? "processing";
    }
    return consultationFailed ? "failed" : "processing";
  }, [consultation, consultationFailed]);

  const submitToGM = useCallback(async () => {
    if (guided.phase !== "paused" || !guided.opening) return;
    const text = answerText.trim();
    if (text.length < 10) {
      toast.error(
        "Escribe tu contestación en el bloque de texto (mínimo 10 caracteres) para que el Gran Maestro pueda auditarla.",
      );
      return;
    }
    setSubmitError(null);
    const white =
      guided.userColor === "w" ? USER_NAME : BOOK_NAME;
    const black =
      guided.userColor === "b" ? USER_NAME : BOOK_NAME;
    const pgn = buildGuidedOpeningPgn({
      moves: guided.moves.map((m) => ({ san: m.san })),
      whitePlayer: white,
      blackPlayer: black,
      openingName: guided.opening.name,
      ecoCode: guided.opening.eco,
    });

    const data: UserGameAnalysisSubmit = {
      game_type: "USER",
      analysis_mode: "guided_opening",
      white_player: white,
      black_player: black,
      pgn,
      fases_analisis: { apertura: "", medio_juego: "", final: "" },
      momentos_criticos: { pieza_a_mejorar: "", amenaza_rival: "" },
      factores_posicionales: { material: "", seguridad_rey: "", espacio: "" },
      conclusiones_plan: {
        plan_estrategico: text,
        error_conceptual_grave: "",
        idea_a_repasar: "",
      },
    };

    try {
      const submittedId = await submitAnalysis(data);
      if (submittedId == null) {
        setSubmitError("Error al enviar la partida guiada.");
        return;
      }
      analysisIdRef.current = submittedId;
      setShowChoice(true);
      toast.info("El GM está analizando tu partida guiada. Puedes seguir navegando.", {
        duration: 5000,
      });
      trackAnalysis(submittedId, `/historico/${submittedId}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error al enviar la partida guiada.";
      setSubmitError(message);
      playErrorSound();
    }
  }, [guided, answerText, submitAnalysis, trackAnalysis, playErrorSound]);

  // "Finalizar Estudio": espera el informe del GM en la vista de auditoría.
  const finishStudy = useCallback(() => {
    setStockfishMode(false);
    stockfishModeRef.current = false;
    setShowChoice(false);
  }, []);

  // "Continuar Jugando contra Stockfish": habilita el tablero interactivo.
  const continueWithStockfish = useCallback(() => {
    setStockfishMode(true);
    stockfishModeRef.current = true;
    setShowChoice(false);
    setStockfishSaved(false);
  }, []);

  // Guarda el PGN completo y su resultado real cada vez que el tablero cambia
  // (para poder persistarlos cuando el usuario guarde o abandone la partida).
  const storeStockfishPgn = useCallback((pgn: string, result: string) => {
    setStockfishPgn(pgn);
    setStockfishResult(result || "*");
  }, []);

  // Persiste la partida completa (apertura + medio juego) contra Stockfish en
  // el histórico, con el PGN dado y su resultado.
  const persistStockfishGame = useCallback(
    async (pgn: string) => {
      if (!guided.opening) return;
      const white =
        guided.userColor === "w" ? userName : "Stockfish";
      const black =
        guided.userColor === "b" ? userName : "Stockfish";
      await saveAnalysisDraft({
        game_type: "USER",
        analysis_mode: "guided_opening",
        analysis_id: analysisIdRef.current ?? undefined,
        white_player: white,
        black_player: black,
        pgn,
        fases_analisis: { apertura: "", medio_juego: "", final: "" },
        momentos_criticos: { pieza_a_mejorar: "", amenaza_rival: "" },
        factores_posicionales: { material: "", seguridad_rey: "", espacio: "" },
        conclusiones_plan: {
          plan_estrategico: answerText.trim(),
          error_conceptual_grave: "",
          idea_a_repasar: "",
        },
      });
    },
    [guided, userName, answerText, analysisIdRef],
  );

  // Al abandonar el tablero tras guardar: si el GM ya terminó se muestra el
  // informe completo; si no, se vuelve a la vista de espera del informe (que,
  // al completarse, lleva a la vista final).
  const leaveStockfishAfterSave = useCallback(() => {
    if (feedback) {
      guided.markDone();
    } else {
      stockfishModeRef.current = false;
      setStockfishMode(false);
      setShowChoice(false);
    }
  }, [feedback, guided]);

  // "Guardar partida": registra el último PGN (con su resultado real) y sale.
  const handleSaveStockfishGame = useCallback(() => {
    if (!stockfishPgn) return;
    setStockfishSaved(false);
    setSubmitError(null);
    persistStockfishGame(stockfishPgn)
      .then(() => {
        setStockfishSaved(true);
        playNotifySound();
        toast.success("Partida completa guardada en tu histórico.");
        leaveStockfishAfterSave();
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : "No se pudo guardar la partida en el histórico.";
        setSubmitError(message);
        playErrorSound();
      });
  }, [stockfishPgn, persistStockfishGame, leaveStockfishAfterSave, playNotifySound, playErrorSound]);

  // "Abandonar": el motor gana automáticamente, así que el componente ya pasa
  // un PGN con derrota forzada del usuario. Se guarda igualmente en el
  // histórico y se sale del tablero.
  const handleAbandonStockfish = useCallback(
    (pgn: string) => {
      setSubmitError(null);
      setStockfishPgn(pgn);
      setStockfishResult(guided.userColor === "w" ? "0-1" : "1-0");
      persistStockfishGame(pgn)
        .then(() => {
          setStockfishSaved(true);
          toast.info("Partida abandonada: guardada en tu histórico con derrota.", {
            duration: 5000,
          });
          leaveStockfishAfterSave();
        })
        .catch((err: unknown) => {
          const message =
            err instanceof Error
              ? err.message
              : "No se pudo guardar la partida en el histórico.";
          setSubmitError(message);
          playErrorSound();
        });
    },
    [guided.userColor, persistStockfishGame, leaveStockfishAfterSave, playErrorSound],
  );

  // La partida terminó de forma natural (mate/ahogado/tablas): se registra el
  // resultado real automáticamente y se avisa al usuario.
  const handleStockfishGameEnded = useCallback(
    (pgn: string, result: string) => {
      setStockfishPgn(pgn);
      setStockfishResult(result || "*");
      setSubmitError(null);
      persistStockfishGame(pgn)
        .then(() => {
          setStockfishSaved(true);
          playNotifySound();
          toast.success(
            "La partida terminó y se ha guardado en tu histórico. Pulsa guardar de nuevo para ver tu informe.",
            { duration: 6000 },
          );
        })
        .catch((err: unknown) => {
          const message =
            err instanceof Error
              ? err.message
              : "No se pudo guardar la partida en el histórico.";
          setSubmitError(message);
          playErrorSound();
        });
    },
    [persistStockfishGame, playNotifySound, playErrorSound],
  );

  const handleSaveToHistory = useCallback(async () => {
    if (guided.phase !== "done" || !guided.opening || !feedback) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const white = guided.userColor === "w" ? USER_NAME : BOOK_NAME;
      const black = guided.userColor === "b" ? USER_NAME : BOOK_NAME;
      const annotatedPgn = buildGuidedOpeningPgn({
        moves: guided.moves.map((m) => ({ san: m.san })),
        whitePlayer: white,
        blackPlayer: black,
        openingName: guided.opening.name,
        ecoCode: guided.opening.eco,
        feedback,
      });
      await saveAnalysisDraft({
        game_type: "USER",
        analysis_mode: "guided_opening",
        analysis_id: analysisIdRef.current ?? undefined,
        white_player: white,
        black_player: black,
        pgn: annotatedPgn,
        fases_analisis: { apertura: "", medio_juego: "", final: "" },
        momentos_criticos: { pieza_a_mejorar: "", amenaza_rival: "" },
        factores_posicionales: { material: "", seguridad_rey: "", espacio: "" },
        conclusiones_plan: {
          plan_estrategico: answerText.trim(),
          error_conceptual_grave: "",
          idea_a_repasar: "",
        },
      });
      setSavedToHistory(true);
      playNotifySound();
      toast.success("Partida guardada en tu histórico con las anotaciones del GM.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "No se pudo guardar la partida en el histórico.";
      setSubmitError(message);
      playErrorSound();
    } finally {
      setSaving(false);
    }
  }, [guided, feedback, answerText, playNotifySound, playErrorSound]);

  const currentPgn =
    guided.moves.length > 0
      ? buildGuidedOpeningPgn({
          moves: guided.moves.map((m) => ({ san: m.san })),
          whitePlayer:
            guided.userColor === "w" ? USER_NAME : BOOK_NAME,
          blackPlayer:
            guided.userColor === "b" ? USER_NAME : BOOK_NAME,
          openingName: guided.opening?.name,
          ecoCode: guided.opening?.eco,
          feedback,
        })
      : "";

  return (
    <>
      <div className="space-y-6 print:hidden">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Estudio Activo de Aperturas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Juega contra el libro de aperturas: mantente en la teoría el máximo de jugadas posible.
          Cuando salgas del libro, el Gran Maestro te explicará qué se pretendía con la jugada y
          tú escribes tu contestación en un único bloque de texto para que la audite y te corrija
          los momentos críticos.
        </p>
      </div>

      {guided.phase === "setup" && (
        <OpeningSetup
          onStart={(opening, color) => {
            setAnswerText("");
            setConsultationFailed(false);
            setFeedback(null);
            setSubmitError(null);
            setSavedToHistory(false);
            setStockfishMode(false);
            stockfishModeRef.current = false;
            setStockfishSaved(false);
            setStockfishAuditDone(false);
            setShowChoice(false);
            setStockfishPgn("");
            setStockfishResult("*");
            analysisIdRef.current = null;
            consultationIdRef.current = null;
            consultationSendingRef.current = false;
            guided.start(opening, color);
          }}
        />
      )}

      {(guided.phase === "playing" || guided.phase === "paused") && (
        <>
          {guided.phase === "paused" && guided.theoryEnd && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <p className="font-semibold">
                {guided.theoryEnd.finishedManually
                  ? `Has terminado la partida guiada en la jugada ${guided.theoryEnd.moveNumber}.`
                  : `¡Has salido de la teoría en la jugada ${guided.theoryEnd.moveNumber} (${guided.theoryEnd.deviationMove ?? "—"})!`}
              </p>
              <p className="mt-1">
                La posición ya no tiene continuaciones en el libro de aperturas. Hemos registrado
                el punto exacto de salida y estamos listos para que analices tu juego a
                continuación.
              </p>
            </div>
          )}

          {isPolling && (
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
              <Loader2 className="h-5 w-5 animate-spin" />
              {stockfishMode
                ? "Analizando tu plan... Puedes seguir jugando contra Stockfish, te avisaremos cuando el informe esté listo."
                : "El Gran Maestro está auditando tu partida guiada y sus momentos críticos…"}
            </div>
          )}

          {stockfishAuditDone && stockfishMode && (
            <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                El informe del Gran Maestro ya está listo. Termina tu partida contra
                Stockfish y pulsa &quot;Guardar partida y ver informe&quot; para verlo.
              </span>
            </div>
          )}

          {(submitError || pollError) && !isPolling && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{submitError || pollError}</span>
            </div>
          )}

          <div className="flex flex-col gap-6 lg:flex-row">
            {/* Tablero (55%) */}
            <div className="w-full lg:w-[55%]">
              {stockfishProps ? (
                <OpeningStockfishBoard
                  initialFen={stockfishProps.initialFen}
                  userColor={stockfishProps.userColor}
                  basePgnMoves={stockfishProps.basePgnMoves}
                  openingName={stockfishProps.openingName}
                  ecoCode={stockfishProps.ecoCode}
                  userName={stockfishProps.userName}
                  auditDone={stockfishProps.auditDone}
                  onPgnChange={storeStockfishPgn}
                  onGameEnded={handleStockfishGameEnded}
                  onSave={handleSaveStockfishGame}
                  onAbandon={handleAbandonStockfish}
                />
              ) : (
                <GuidedOpeningBoard guided={guided} />
              )}
            </div>

            {/* Panel derecho (45%) */}
            <div className="w-full lg:w-[45%]">
              {guided.phase === "playing" && (
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" />
                      <span className="font-semibold">
                        {guided.opening?.eco} – {guided.opening?.name}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {guided.opening?.description}
                    </p>
                    <Separator />
                    <p className="text-sm">
                      Juegas con{" "}
                      <Badge variant="secondary">
                        {guided.userColor === "w" ? "Blancas" : "Negras"}
                      </Badge>{" "}
                      contra el libro. Intenta mantenerte en la teoría.
                    </p>
                    {guided.opening && (
                      <p className="text-xs text-muted-foreground">
                        Línea de referencia: {guided.opening.line.join(" ")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {guided.phase === "paused" && isPolling && !stockfishMode && (
                <Card>
                  <CardContent className="space-y-3 p-6">
                    <div className="flex items-center gap-3 text-primary">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <div>
                        <p className="font-semibold">El Gran Maestro está auditando tu partida…</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Puedes seguir navegando; te avisaremos cuando termine.
                        </p>
                      </div>
                    </div>

                    {showChoice && (
                      <div className="mt-2 border-t pt-4">
                        <p className="mb-3 text-sm font-medium">
                          Mientras el GM analiza, ¿qué quieres hacer?
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            size="lg"
                            className="flex-1 gap-2"
                            onClick={finishStudy}
                          >
                            <Eye className="h-5 w-5" />
                            Finalizar Estudio
                          </Button>
                          <Button
                            size="lg"
                            variant="outline"
                            className="flex-1 gap-2"
                            onClick={continueWithStockfish}
                          >
                            <Play className="h-5 w-5" />
                            Continuar Jugando contra Stockfish
                          </Button>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Puedes aplicar tu plan estratégico en el tablero mientras se
                          termina la auditoría.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {guided.phase === "paused" && stockfishMode && (
                <Card>
                  <CardContent className="space-y-3 p-6">
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-semibold">
                          Juegas contra Stockfish desde la salida de la teoría
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {isPolling
                            ? "El GM está auditando tu plan. Termina la partida y guarda para ver el informe."
                            : stockfishAuditDone
                            ? "El informe del GM ya está listo. Al guardar y salir lo verás."
                            : "Analiza la posición y aplica tu plan estratégico."}
                        </p>
                      </div>
                    </div>

                    {stockfishSaved && (
                      <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        Partida completa guardada en tu histórico.
                      </p>
                    )}

                    {stockfishResult !== "*" && (
                      <p className="flex items-center gap-2 rounded-lg border border-slate-200 bg-muted/30 p-2 text-sm font-medium text-muted-foreground">
                        <Flag className="h-4 w-4" />
                        Resultado:{" "}
                        {stockfishResult === "1/2-1/2"
                          ? "Tablas"
                          : (stockfishResult === "1-0") === (guided.userColor === "w")
                            ? "Victoria"
                            : "Derrota"}
                      </p>
                    )}

                    {!isPolling && !stockfishAuditDone && !showChoice && (
                      <Button
                        className="w-full gap-2"
                        variant="outline"
                        onClick={finishStudy}
                      >
                        <Eye className="h-5 w-5" />
                        Volver a esperar el informe del GM
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {guided.phase === "paused" && !isPolling && !stockfishMode && !showChoice && (
                <Card>
                  <CardHeaderTitle
                    icon={<Flag className="h-5 w-5 text-primary" />}
                    title="Consulta al Gran Maestro"
                  />
                  <CardContent>
                    <GuidedOpeningAnswer
                      deviationMove={guided.theoryEnd?.deviationMove ?? null}
                      consultationStatus={consultationStatus}
                      consultationAnswer={consultation?.answer ?? null}
                      onRetryConsultation={retryConsultation}
                      value={answerText}
                      onChange={setAnswerText}
                      submitting={false}
                      onSubmit={() => void submitToGM()}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {guided.phase === "done" && (
        <>
          <div className="flex flex-col gap-6 lg:flex-row">
            {/* Tablero de reproducción (55%) */}
            <div className="w-full lg:w-[55%]">
              {currentPgn ? (
                <ReplayBoard pgn={currentPgn} />
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    Sin partida que mostrar.
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Feedback del GM + guardado (45%) */}
            <div className="w-full lg:w-[45%] space-y-4">
              {feedback ? (
                <GuidedOpeningFeedbackDisplay feedback={feedback} />
              ) : (
                <Card>
                  <CardContent className="p-4 text-sm text-muted-foreground">
                    Cargando el informe del Gran Maestro…
                  </CardContent>
                </Card>
              )}

              {(submitError) && !saving && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <Separator />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  className="gap-2"
                  disabled={!feedback || saving || savedToHistory}
                  onClick={() => void handleSaveToHistory()}
                >
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Save className="h-5 w-5" />
                  )}
                  {savedToHistory
                    ? "Guardado en tu histórico"
                    : "Guardar en histórico con anotaciones del GM"}
                </Button>
                <Button variant="outline" onClick={guided.reset} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Jugar otra partida
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.print()}
                  className="gap-2"
                  disabled={!feedback}
                >
                  <FileDown className="h-4 w-4" />
                  Exportar a PDF
                </Button>
              </div>

              {savedToHistory && (
                <p className="flex items-center gap-2 text-sm">
                  <ExternalLink className="h-4 w-4 text-primary" />
                  <Link href="/historico" className="text-primary underline underline-offset-4">
                    Ver tu histórico de análisis
                  </Link>
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {noticeOpen && feedback && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setNoticeOpen(false)}
            aria-hidden="true"
          />
          <Card className="relative z-10 w-full max-w-md shadow-xl dark:bg-slate-900">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                {feedback.is_user_analysis_sufficient ? (
                  <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="mt-0.5 h-8 w-8 shrink-0 text-red-600 dark:text-red-400" />
                )}
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Corrección del Gran Maestro</h3>
                  <p className="text-sm font-medium">
                    {feedback.is_user_analysis_sufficient
                      ? "Tu autodiagnóstico es suficiente."
                      : "Tu autodiagnóstico es insuficiente."}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {feedback.tutor_feedback.user_summary}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setNoticeOpen(false)}>
                  Cerrar
                </Button>
                <Button onClick={() => setNoticeOpen(false)}>
                  Ver el informe completo
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      </div>

      {guided.phase === "done" && feedback && (
        <PrintAnalysisReport
          white={guided.userColor === "w" ? USER_NAME : BOOK_NAME}
          black={guided.userColor === "b" ? USER_NAME : BOOK_NAME}
          result="*"
          guidedResultLabel="Partida guiada de apertura"
          analysisDate={formatAnalysisDate(new Date().toISOString())}
          gameType="USER"
          pgn={currentPgn}
          form={null}
          guided
          guidedFeedback={feedback}
          guidedAnswer={answerText.trim()}
        />
      )}
    </>
  );
}

function CardHeaderTitle({
  icon,
  title,
}: {
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-0">
      {icon}
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  );
}