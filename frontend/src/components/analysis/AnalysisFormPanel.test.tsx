import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalysisFormPanel, AnalysisFormState } from "./AnalysisFormPanel";
import type { GameAnalysisGameType } from "@/lib/types";

jest.mock("sonner", () => ({
  toast: {
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const mockSubmit = jest.fn();
jest.mock("@/hooks/useChessAnalysis", () => ({
  useChessAnalysis: () => ({
    submit: mockSubmit,
    status: null,
    isPolling: false,
    error: null,
  }),
}));

jest.mock("@/context/GMConsultationContext", () => ({
  useGMConsultation: () => ({
    consultations: [],
    activeCount: 0,
    sendConsultation: jest.fn(),
    refresh: jest.fn(),
    trackAnalysis: jest.fn(),
  }),
}));

jest.mock("@/hooks/useChessSounds", () => ({
  useChessSounds: () => ({
    playMoveSound: jest.fn(),
    playErrorSound: jest.fn(),
    playNotifySound: jest.fn(),
  }),
}));

jest.mock("@/lib/api", () => ({
  getGameAnalysis: jest.fn(),
}));

const USER_PGN = "[Event \"Liga\"]\n[White \"Pedro\"]\n[Black \"Rival\"]\n\n1. e4 e5 1-0";

const FILLED_FORM: AnalysisFormState = {
  fases: { apertura: "Italiana", medio_juego: "Centro", final: "Conversión" },
  momentos: { pieza_a_mejorar: "Caballo", amenaza_rival: "Dama h5" },
  factores: { material: "Igual", seguridad_rey: "Enrocado", espacio: "Ventaja" },
  conclusiones: {
    plan_estrategico: "Avanzar d4",
    error_conceptual_grave: "Peones doblados",
    idea_a_repasar: "Finales de torres",
  },
};

const EMPTY_BLOCKS = {
  fases_analisis: { apertura: "", medio_juego: "", final: "" },
  momentos_criticos: { pieza_a_mejorar: "", amenaza_rival: "" },
  factores_posicionales: { material: "", seguridad_rey: "", espacio: "" },
  conclusiones_plan: {
    plan_estrategico: "",
    error_conceptual_grave: "",
    idea_a_repasar: "",
  },
};

interface PanelProps {
  gameType?: GameAnalysisGameType;
  gmGameId?: string | number | null;
  pgn?: string;
  initialForm?: AnalysisFormState | null;
}

function renderPanel(props: PanelProps = {}) {
  return render(
    <AnalysisFormPanel
      gameType={props.gameType ?? "USER"}
      gmGameId={props.gmGameId ?? null}
      pgn={props.pgn ?? USER_PGN}
      whitePlayer="Pedro"
      blackPlayer="Rival"
      initialForm={props.initialForm ?? null}
    />,
  );
}

describe("AnalysisFormPanel — modos de análisis (IA vs autodiagnóstico)", () => {
  beforeEach(() => {
    mockSubmit.mockReset();
    mockSubmit.mockResolvedValue(42);
    localStorage.clear();
  });

  it("solo muestra el botón 'Análisis por IA' en partidas propias (USER)", () => {
    const { unmount } = renderPanel({ gameType: "USER" });
    expect(
      screen.getByRole("button", { name: /Análisis por IA/i }),
    ).toBeInTheDocument();
    unmount();

    renderPanel({ gameType: "GM", gmGameId: "abc" });
    expect(
      screen.queryByRole("button", { name: /Análisis por IA/i }),
    ).not.toBeInTheDocument();
  });

  it("con formulario relleno envía analysis_mode 'self_audit'", async () => {
    const user = userEvent.setup();
    renderPanel({ initialForm: FILLED_FORM });

    await user.click(
      screen.getByRole("button", { name: /Enviar a Evaluación del Gran Maestro/i }),
    );

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        game_type: "USER",
        analysis_mode: "self_audit",
        fases_analisis: FILLED_FORM.fases,
        momentos_criticos: FILLED_FORM.momentos,
        factores_posicionales: FILLED_FORM.factores,
        conclusiones_plan: FILLED_FORM.conclusiones,
      }),
    );
  });

  it("con formulario vacío el envío normal cae a analysis_mode 'ai'", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: /Enviar a Evaluación del Gran Maestro/i }),
    );

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        game_type: "USER",
        analysis_mode: "ai",
        fases_analisis: EMPTY_BLOCKS.fases_analisis,
      }),
    );
  });

  it("el botón 'Análisis por IA' limpia el formulario y envía 'ai' aunque hubiera autodiagnóstico", async () => {
    const user = userEvent.setup();
    renderPanel({ initialForm: FILLED_FORM });

    await user.click(
      screen.getByRole("button", { name: /Análisis por IA/i }),
    );

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        game_type: "USER",
        analysis_mode: "ai",
        fases_analisis: EMPTY_BLOCKS.fases_analisis,
        momentos_criticos: EMPTY_BLOCKS.momentos_criticos,
        factores_posicionales: EMPTY_BLOCKS.factores_posicionales,
        conclusiones_plan: EMPTY_BLOCKS.conclusiones_plan,
      }),
    );
  });
});