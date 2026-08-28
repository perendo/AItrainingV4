import { render, screen } from "@testing-library/react";
import { PrintAnalysisReport } from "@/components/analysis/PrintAnalysisReport";
import type { AuditGameAnalysisResponse, GeminiFeedback } from "@/lib/types";

jest.mock("react-chessboard", () => ({
  Chessboard: () => <div data-testid="board" />,
}));

const feedback: GeminiFeedback = {
  feedback_fases: {
    apertura: "Apertura OK",
    medio_juego: "Medio OK",
    final: "Final OK",
  },
  respuestas_preguntas_criticas: {
    mejora_piezas: "Piezas OK",
    amenaza_real: "Amenaza OK",
  },
  matriz_posicional: {
    material: "Material OK",
    rey: "Rey OK",
    espacio: "Espacio OK",
  },
  auditoria_conclusiones: {
    plan_correcto: true,
    evaluacion_error: "Eval OK",
    concepto_reforzar: "Concepto OK",
    razon_insuficiente: "",
  },
};

describe("PrintAnalysisReport GM feedback", () => {
  it("muestra la evaluación del GM cuando hay feedback", () => {
    render(
      <PrintAnalysisReport
        white="Blancas"
        black="Negras"
        result="1-0"
        analysisDate="26 de agosto de 2026"
        gameType="USER"
        pgn="1. e4 e5 2. Nf3 Nc6 *"
        form={null}
        feedback={feedback}
        mode="ai"
      />,
    );
    expect(screen.getByText("Apertura OK")).toBeInTheDocument();
    expect(screen.getByText("Material OK")).toBeInTheDocument();
    expect(screen.getByText("Eval OK")).toBeInTheDocument();
  });

  it("oculta 'Comentarios del Usuario' en modo IA", () => {
    render(
      <PrintAnalysisReport
        white="Blancas"
        black="Negras"
        result="1-0"
        analysisDate="26 de agosto de 2026"
        gameType="USER"
        pgn="1. e4 e5 2. Nf3 Nc6 *"
        form={null}
        feedback={feedback}
        mode="ai"
      />,
    );
    expect(screen.queryByText("Comentarios del Usuario")).not.toBeInTheDocument();
    expect(screen.getByText("Apertura OK")).toBeInTheDocument();
  });

  it("muestra 'Comentarios del Usuario' fuera de modo IA", () => {
    render(
      <PrintAnalysisReport
        white="Blancas"
        black="Negras"
        result="1-0"
        analysisDate="26 de agosto de 2026"
        gameType="USER"
        pgn="1. e4 e5 2. Nf3 Nc6 *"
        form={null}
        feedback={feedback}
        mode="self_audit"
      />,
    );
    expect(screen.getByText("Comentarios del Usuario")).toBeInTheDocument();
  });
});

describe("PrintAnalysisReport partida guiada", () => {
  const guidedFeedback: AuditGameAnalysisResponse = {
    eco_code: "C50",
    opening_name: "Apertura Italiana",
    is_user_analysis_sufficient: false,
    tutor_feedback: {
      user_summary: "Detectaste bien la amenaza.",
      conceptual_error: "El plan de las blancas es diferente.",
      takeaway_lesson: "Controla el centro antes de atacar en el flanco.",
    },
    general_ai_analysis: {
      summary: "Las blancas mantienen la iniciativa.",
      critical_moments: [
        { ply: 3, san_move: "Nf3", eval_change: 0.32, explanation: "El caballo apoya d4." },
      ],
      strategic_plans: ["Domina el centro"],
    },
  };

  it("muestra el informe guiado con la contestación y el veredicto", () => {
    render(
      <PrintAnalysisReport
        white="Tú (Alumno)"
        black="Libro de Aperturas"
        result="*"
        guidedResultLabel="Partida guiada de apertura"
        analysisDate="26 de agosto de 2026"
        gameType="USER"
        pgn="1. e4 e5 2. Nf3 Nc6 *"
        form={null}
        guided
        guidedFeedback={guidedFeedback}
        guidedAnswer="Debía jugar d4 y sacrificar la pieza por la iniciativa."
      />,
    );
    expect(screen.getByText("Informe de Partida Guiada de Apertura")).toBeInTheDocument();
    expect(screen.getByText("Contestación del Usuario")).toBeInTheDocument();
    expect(
      screen.getByText("Debía jugar d4 y sacrificar la pieza por la iniciativa."),
    ).toBeInTheDocument();
    expect(screen.getByText("Autodiagnóstico insuficiente")).toBeInTheDocument();
    expect(screen.getByText("Detectaste bien la amenaza.")).toBeInTheDocument();
    expect(screen.getByText("Controla el centro antes de atacar en el flanco.")).toBeInTheDocument();
    expect(screen.getByText("Domina el centro")).toBeInTheDocument();
  });
});
