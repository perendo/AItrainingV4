"use client";

import { useMemo } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  AnalysisFormState,
  GeminiFeedbackDisplay,
} from "@/components/analysis/AnalysisFormPanel";
import { GeminiFeedback } from "@/lib/types";

function getFinalFen(pgn: string): string | null {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
    return chess.fen();
  } catch {
    return null;
  }
}

function StaticFinalBoard({ pgn }: { pgn: string }) {
  const finalFen = useMemo(() => getFinalFen(pgn), [pgn]);

  if (!finalFen) {
    return (
      <div className="w-full aspect-square max-w-[340px] mx-auto flex items-center justify-center border border-slate-500 rounded">
        <p className="text-sm">No se pudo cargar la posición final.</p>
      </div>
    );
  }

  return (
    <div className="print-board w-full aspect-square max-w-[340px] mx-auto">
      <Chessboard
        position={finalFen}
        arePiecesDraggable={false}
        boardOrientation="white"
        boardWidth={340}
        customBoardStyle={{ borderRadius: "4px" }}
      />
    </div>
  );
}

interface PrintAnalysisReportProps {
  white: string;
  black: string;
  whiteTitle?: string;
  blackTitle?: string;
  whiteElo?: string;
  blackElo?: string;
  result: string;
  analysisDate: string;
  gameType: "GM" | "USER";
  pgn?: string | null;
  form?: AnalysisFormState | null;
  feedback?: GeminiFeedback | null;
  mode?: string | null;
}

function PrintField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{value || "—"}</p>
    </div>
  );
}

function PrintBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="print-block border border-slate-500 rounded p-3 mb-3">
      <h3 className="text-sm font-bold uppercase tracking-wide mb-2">{title}</h3>
      {children}
    </div>
  );
}

function UserCommentsPrint({ form }: { form: AnalysisFormState }) {
  return (
    <div>
      <PrintBlock title="Bloque 1 — Fases">
        <PrintField label="Apertura" value={form.fases.apertura} />
        <PrintField label="Medio Juego" value={form.fases.medio_juego} />
        <PrintField label="Final" value={form.fases.final} />
      </PrintBlock>
      <PrintBlock title="Bloque 2 — Preguntas Críticas">
        <PrintField
          label="¿Qué pieza pude haber mejorado?"
          value={form.momentos.pieza_a_mejorar}
        />
        <PrintField
          label="¿Cuál era la amenaza real del rival?"
          value={form.momentos.amenaza_rival}
        />
      </PrintBlock>
      <PrintBlock title="Bloque 3 — Factores Posicionales">
        <PrintField label="Material" value={form.factores.material} />
        <PrintField label="Seguridad del Rey" value={form.factores.seguridad_rey} />
        <PrintField label="Espacio" value={form.factores.espacio} />
      </PrintBlock>
      <PrintBlock title="Bloque 4 — Conclusiones">
        <PrintField
          label="Plan estratégico"
          value={form.conclusiones.plan_estrategico}
        />
        <PrintField
          label="Error conceptual"
          value={form.conclusiones.error_conceptual_grave}
        />
        <PrintField
          label="Idea a repasar"
          value={form.conclusiones.idea_a_repasar}
        />
      </PrintBlock>
    </div>
  );
}

function PlayerCard({
  label,
  name,
  title,
  elo,
}: {
  label: string;
  name: string;
  title?: string;
  elo?: string;
}) {
  const detail = [title, elo ? `Elo ${elo}` : null].filter(Boolean).join(" · ");
  return (
    <div className="flex-1 border border-slate-800 rounded p-3">
      <p className="text-[10px] uppercase tracking-widest">{label}</p>
      <p className="text-base font-bold mt-0.5">{name}</p>
      {detail && <p className="text-xs mt-0.5">{detail}</p>}
    </div>
  );
}

export function PrintAnalysisReport({
  white,
  black,
  whiteTitle,
  blackTitle,
  whiteElo,
  blackElo,
  result,
  analysisDate,
  gameType,
  pgn,
  form,
  feedback,
  mode,
}: PrintAnalysisReportProps) {
  return (
    <div className="hidden print:block">
      <div className="print-report mx-auto max-w-[680px]">
        <div className="print-block">
          <h1 className="text-2xl font-bold uppercase tracking-wide text-center border-b-2 border-slate-800 pb-2">
            Informe de Análisis de Partida
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-2 text-sm">
            <span>
              Fecha del análisis: <strong>{analysisDate}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {gameType === "GM" ? "Partida de Gran Maestro" : "Mi Partida / Liga"}
            </span>
          </div>
          <div className="mt-3 inline-block border-2 border-slate-800 rounded px-3 py-1 text-sm font-semibold">
            Resultado: {result}
          </div>

          <div className="mt-4 flex items-stretch gap-3">
            <PlayerCard
              label="Jugador de Blancas"
              name={white}
              title={whiteTitle}
              elo={whiteElo}
            />
            <div className="flex items-center justify-center px-1 text-xl font-bold">
              vs
            </div>
            <PlayerCard
              label="Jugador de Negras"
              name={black}
              title={blackTitle}
              elo={blackElo}
            />
          </div>
        </div>

        <section className="print-block mt-6">
          <h2 className="text-lg font-bold uppercase tracking-wide border-b-2 border-slate-800 pb-1 mb-3">
            Tablero — Posición Final
          </h2>
          {pgn ? (
            <StaticFinalBoard pgn={pgn} />
          ) : (
            <p className="text-sm">No hay un PGN disponible para esta partida.</p>
          )}
        </section>

        {mode !== "ai" && (
          <section className="mt-6">
            <h2 className="text-lg font-bold uppercase tracking-wide border-b-2 border-slate-800 pb-1 mb-3">
              Comentarios del Usuario
            </h2>
            {form ? (
              <UserCommentsPrint form={form} />
            ) : (
              <p className="text-sm">No se registraron comentarios del usuario.</p>
            )}
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-lg font-bold uppercase tracking-wide border-b-2 border-slate-800 pb-1 mb-3">
            Comentarios y Evaluación del Gran Maestro
          </h2>
          {feedback ? (
            <GeminiFeedbackDisplay feedback={feedback} mode={mode} />
          ) : (
            <p className="text-sm">
              Esta partida aún no ha sido evaluada por el Gran Maestro.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
