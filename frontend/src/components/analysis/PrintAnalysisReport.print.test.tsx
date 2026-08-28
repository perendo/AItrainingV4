import { render, screen } from "@testing-library/react";
import { PrintAnalysisReport } from "@/components/analysis/PrintAnalysisReport";
import type { GeminiFeedback } from "@/lib/types";

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
