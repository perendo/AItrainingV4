"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Loader2, Send, MessageCircleQuestion, User as UserIcon } from "lucide-react";
import { useGMConsultation } from "@/context/GMConsultationContext";
import { cn } from "@/lib/utils";

export default function GMConsultationPage() {
  const { consultations, sendConsultation, refresh } = useGMConsultation();
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consultations]);

  const handleSend = async () => {
    const text = question.trim();
    if (text.length < 3) return;
    setSending(true);
    setQuestion("");
    await sendConsultation(text);
    setSending(false);
  };

  const ordered = [...consultations].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageCircleQuestion className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Consultar al Gran Maestro</h1>
          <p className="text-sm text-muted-foreground">
            Haz cualquier duda de ajedrez. El GM la analiza en segundo plano y te
            avisa cuando responda.
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border bg-card p-4">
        {ordered.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <MessageCircleQuestion className="mb-3 h-10 w-10 opacity-40" />
            <p>Aún no has hecho consultas. Escribe tu primera duda abajo.</p>
          </div>
        )}

        {ordered.map((c) => {
          const processing = c.status === "processing";
          return (
            <div key={c.consultation_id} className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                  <UserIcon className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-tl-none bg-slate-100 px-4 py-2 dark:bg-slate-800">
                  <p className="whitespace-pre-wrap text-sm">{c.question}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MessageCircleQuestion className="h-4 w-4" />
                </div>
                <div
                  className={cn(
                    "min-w-0 flex-1 rounded-2xl rounded-tl-none border px-4 py-3",
                    processing
                      ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                      : "bg-primary/5",
                  )}
                >
                  {processing ? (
                    <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>El Gran Maestro está analizando tu duda…</span>
                    </div>
                  ) : c.status === "failed" ? (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      La consulta falló: {c.error_message || "Inténtalo de nuevo."}
                    </p>
                  ) : (
                    <div className="report-markdown text-sm">
                      <ReactMarkdown>
                        {c.answer || "_(sin respuesta)_"}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="mt-4 flex items-end gap-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          placeholder="Escribe tu duda para el Gran Maestro… (Enter para enviar)"
          className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={handleSend}
          disabled={sending || question.trim().length < 3}
          className="flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Enviar
        </button>
      </div>
    </div>
  );
}
