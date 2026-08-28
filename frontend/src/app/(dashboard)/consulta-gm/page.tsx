"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import {
  Loader2,
  Send,
  MessageCircleQuestion,
  User as UserIcon,
  Plus,
  FileDown,
  Calendar,
  ArrowLeft,
  MessageSquare,
} from "lucide-react";
import { useGMConsultation } from "@/context/GMConsultationContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GMConsultationResponse } from "@/lib/types";

function groupConsultationsByDay(consultations: GMConsultationResponse[]) {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  const groups: { label: string; items: GMConsultationResponse[] }[] = [
    { label: "Hoy", items: [] },
    { label: "Ayer", items: [] },
    { label: "Anteriores", items: [] },
  ];

  for (const c of consultations) {
    const d = new Date(c.created_at);
    const dStr = d.toDateString();
    if (dStr === today) {
      groups[0].items.push(c);
    } else if (dStr === yesterday) {
      groups[1].items.push(c);
    } else {
      groups[2].items.push(c);
    }
  }

  return groups.filter((g) => g.items.length > 0);
}

export default function GMConsultationPage() {
  const { consultations, sendConsultation, refresh } = useGMConsultation();
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedConsultationId, setSelectedConsultationId] = useState<number | null>(null);
  const [mobileShowHistory, setMobileShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consultations, selectedConsultationId]);

  const handleSend = async () => {
    const text = question.trim();
    if (text.length < 3 || sending) return;
    setSending(true);
    setQuestion("");
    const newId = await sendConsultation(text);
    setSending(false);
    if (newId != null) {
      setSelectedConsultationId(newId);
    }
  };

  const selectedConsultation = useMemo(
    () => consultations.find((c) => c.consultation_id === selectedConsultationId) || null,
    [consultations, selectedConsultationId]
  );

  const grouped = useMemo(() => groupConsultationsByDay(consultations), [consultations]);

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-6xl gap-6">
      {/* Sidebar: Histórico de Consultas */}
      <div
        className={cn(
          "w-full md:w-80 flex-col rounded-xl border bg-card p-4 shrink-0 transition-all print:hidden",
          "md:flex",
          mobileShowHistory ? "flex absolute inset-x-4 top-20 z-50 bg-card shadow-xl h-[80vh]" : "hidden md:flex"
        )}
      >
        <div className="flex items-center justify-between pb-3 border-b mb-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Histórico de Consultas
          </h2>
          <Button
            size="sm"
            onClick={() => {
              setSelectedConsultationId(null);
              setMobileShowHistory(false);
            }}
            className="gap-1 h-8 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva consulta
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {consultations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No hay consultas anteriores.
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2">
                  {group.label}
                </p>
                {group.items.map((c) => {
                  const isSelected = c.consultation_id === selectedConsultationId;
                  return (
                    <button
                      key={c.consultation_id}
                      onClick={() => {
                        setSelectedConsultationId(c.consultation_id);
                        setMobileShowHistory(false);
                      }}
                      className={cn(
                        "w-full text-left rounded-lg p-2.5 text-xs transition-colors line-clamp-2",
                        isSelected
                          ? "bg-primary text-primary-foreground font-medium"
                          : "hover:bg-muted text-foreground"
                      )}
                    >
                      {c.question}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col rounded-xl border bg-card p-4 overflow-hidden relative">
        {/* Mobile toggle header */}
        <div className="flex md:hidden items-center justify-between pb-3 border-b mb-3 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMobileShowHistory(!mobileShowHistory)}
            className="text-xs gap-1"
          >
            <Calendar className="h-3.5 w-3.5" />
            {mobileShowHistory ? "Ocultar historial" : "Ver historial"}
          </Button>
          <Button
            size="sm"
            onClick={() => setSelectedConsultationId(null)}
            className="text-xs gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva consulta
          </Button>
        </div>

        {selectedConsultationId === null ? (
          /* Vista: Realizar nueva consulta */
          <div className="flex-1 flex flex-col items-center justify-center max-w-xl mx-auto w-full text-center p-6 space-y-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageCircleQuestion className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Realizar nueva consulta al Gran Maestro</h1>
              <p className="text-sm text-muted-foreground">
                Haz cualquier pregunta sobre aperturas, medio juego, finales o estrategia. El Gran Maestro la analizará y te responderá en detalle.
              </p>
            </div>
            <div className="w-full space-y-3">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={4}
                placeholder="Escribe tu duda de ajedrez aquí… (Enter para enviar)"
                className="w-full resize-none rounded-xl border bg-background p-4 text-sm outline-none focus:ring-2 focus:ring-primary shadow-sm"
              />
              <Button
                onClick={handleSend}
                disabled={sending || question.trim().length < 3}
                className="w-full h-11 gap-2 text-sm font-semibold"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar consulta al Gran Maestro
              </Button>
            </div>
          </div>
        ) : (
          /* Vista: Conversación completa seleccionada */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b mb-4 print:hidden">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedConsultationId(null)}
                  className="gap-1 text-xs md:hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h2 className="font-semibold text-base truncate max-w-md">
                  {selectedConsultation?.question ?? "Conversación"}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="gap-1 text-xs"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Exportar a PDF
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setSelectedConsultationId(null)}
                  className="gap-1 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nueva consulta
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {selectedConsultation ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                      <UserIcon className="h-4 w-4" />
                    </div>
                    <div className="rounded-2xl rounded-tl-none bg-slate-100 px-4 py-3 dark:bg-slate-800 max-w-2xl">
                      <p className="whitespace-pre-wrap text-sm font-medium">{selectedConsultation.question}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(selectedConsultation.created_at).toLocaleString("es-ES")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <MessageCircleQuestion className="h-4 w-4" />
                    </div>
                    <div
                      className={cn(
                        "min-w-0 flex-1 rounded-2xl rounded-tl-none border px-4 py-3 max-w-3xl",
                        selectedConsultation.status === "processing"
                          ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                          : "bg-primary/5"
                      )}
                    >
                      {selectedConsultation.status === "processing" ? (
                        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>El Gran Maestro está analizando tu duda…</span>
                        </div>
                      ) : selectedConsultation.status === "failed" ? (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          La consulta falló: {selectedConsultation.error_message || "Inténtalo de nuevo."}
                        </p>
                      ) : (
                        <div className="report-markdown text-sm">
                          <ReactMarkdown>
                            {selectedConsultation.answer || "_(sin respuesta)_"}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-12">
                  Selecciona una consulta del historial o crea una nueva.
                </p>
              )}
              <div ref={endRef} />
            </div>
          </div>
        )}
      </div>

      {/* Print-only report block for export to PDF */}
      {selectedConsultation && (
        <div className="hidden print:block">
          <div className="print-report mx-auto max-w-[680px] p-6 space-y-4">
            <h1 className="text-xl font-bold uppercase tracking-wide border-b-2 border-slate-800 pb-2">
              Consulta al Gran Maestro
            </h1>
            <p className="text-xs">
              Fecha: <strong>{new Date(selectedConsultation.created_at).toLocaleString("es-ES")}</strong>
            </p>
            <div className="border border-slate-500 rounded p-3">
              <p className="text-xs font-semibold uppercase mb-1">Pregunta del Alumno:</p>
              <p className="text-sm whitespace-pre-wrap">{selectedConsultation.question}</p>
            </div>
            <div className="border border-slate-800 rounded p-3 bg-slate-50">
              <p className="text-xs font-semibold uppercase mb-1">Respuesta del Gran Maestro:</p>
              <div className="text-sm whitespace-pre-wrap">
                {selectedConsultation.answer || "Pendiente de respuesta"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
