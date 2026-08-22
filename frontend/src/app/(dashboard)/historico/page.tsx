import { AnalysisHistoryList } from "@/components/analysis/AnalysisHistoryList";

export default function HistoricoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Histórico de Análisis</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Todas tus partidas analizadas o registradas, ordenadas por fecha. Haz clic en
          una para leer la auditoría del Gran Maestro o para completar su análisis.
        </p>
      </div>
      <AnalysisHistoryList />
    </div>
  );
}
