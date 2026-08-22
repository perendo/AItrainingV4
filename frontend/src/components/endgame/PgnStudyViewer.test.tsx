import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PgnStudyViewer, selectSpanishMaleVoice } from "./PgnStudyViewer";

// El tablero es un import dinámico (SSR disabled); lo sustituimos para jsdom.
jest.mock("react-chessboard", () => ({
  Chessboard: () => <div data-testid="chessboard" />,
}));

// Resolver next/dynamic de forma síncrona evita el warning de act() al
// cargar el tablero de forma asíncrona durante el test.
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const { Chessboard } = require("react-chessboard");
    return Chessboard;
  },
}));

// ── Mock del hook de sonidos para poder afirmar sus llamadas ────────────
const mockPlayMoveSound = jest.fn();
jest.mock("@/hooks/useChessSounds", () => ({
  useChessSounds: () => ({
    playMoveSound: mockPlayMoveSound,
    playErrorSound: jest.fn(),
    playNotifySound: jest.fn(),
  }),
}));

// ── Mock de la API de síntesis de voz (jsdom no la implementa) ──────────
class MockUtterance {
  lang = "";
  rate = 1;
  pitch = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const mockSpanishMaleVoice = {
  lang: "es-ES",
  name: "Alvaro (Natural)",
};

const speechSynthesisMock = {
  cancel: jest.fn(),
  speak: jest.fn(),
  getVoices: jest.fn(() => [mockSpanishMaleVoice]),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

beforeAll(() => {
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: speechSynthesisMock,
  });
  (window as unknown as { SpeechSynthesisUtterance: typeof MockUtterance })
    .SpeechSynthesisUtterance = MockUtterance;
});

beforeEach(() => {
  speechSynthesisMock.cancel.mockClear();
  speechSynthesisMock.speak.mockClear();
  mockPlayMoveSound.mockClear();
});

const FEN = '[FEN "6k1/8/8/8/8/8/P7/7K w - - 0 1"]';

const PGN = `${FEN}
[Result "1-0"]

{ Comentario introductorio. }
1. a4 $1 { Explicación tras 1. a4 } ( 1. a3 { refuta la variante lenta } 1... Kf7 ) 1... Kf7 { El rey persigue al peón. } 1-0`;

const PGN_SIN_COMENTARIOS = `${FEN}

1. a4 Kf7 2. a5`;

function setup(props: Partial<Parameters<typeof PgnStudyViewer>[0]> = {}) {
  return render(
    <PgnStudyViewer
      pgnContent={PGN}
      initialFen="6k1/8/8/8/8/8/P7/7K w - - 0 1"
      {...props}
    />
  );
}

describe("PgnStudyViewer", () => {
  it("renderiza la línea principal y las variantes sin filtrar jugadas", () => {
    setup();
    expect(screen.getByRole("button", { name: "a4!" })).toBeInTheDocument();
    // Dos "Kf7": el de la variante y el de la línea principal.
    expect(screen.getAllByRole("button", { name: "Kf7" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "a3" })).toBeInTheDocument();
    expect(screen.getByText("1-0")).toBeInTheDocument();
  });

  it("muestra los comentarios intercalados junto a sus jugadas", () => {
    setup();
    expect(screen.getByText("Explicación tras 1. a4")).toBeInTheDocument();
    expect(screen.getByText("refuta la variante lenta")).toBeInTheDocument();
    // El comentario introductorio aparece en el movetext y en el cuadro de
    // explicación (posición inicial).
    expect(
      screen.getAllByText(/Comentario introductorio/).length
    ).toBeGreaterThanOrEqual(1);
  });

  it("marca las variantes con un contenedor diferenciado", () => {
    setup();
    const variantMove = screen.getByRole("button", { name: "a3" });
    const line = variantMove.closest("[data-variant-line]");
    expect(line).not.toBeNull();
    expect(line!.getAttribute("data-variant-line")).toBe("true");
  });

  it("sincroniza el cuadro de explicación al hacer clic en una jugada", async () => {
    const user = userEvent.setup();
    setup();

    const explanation = screen.getByTestId("pgn-explanation");
    expect(explanation).toHaveTextContent(/Comentario introductorio/);

    await user.click(screen.getByRole("button", { name: "a4!" }));
    expect(explanation).toHaveTextContent("Explicación tras 1. a4");

    await user.click(screen.getAllByRole("button", { name: "Kf7" })[1]);
    expect(explanation).toHaveTextContent("El rey persigue al peón.");
  });

  it("navega con los botones anterior/siguiente actualizando la posición", async () => {
    const user = userEvent.setup();
    setup();

    const nextBtn = screen.getByRole("button", { name: "Jugada siguiente" });
    const prevBtn = screen.getByRole("button", { name: "Jugada anterior" });

    expect(prevBtn).toBeDisabled();
    await user.click(nextBtn);
    expect(prevBtn).toBeEnabled();
    expect(screen.getByTestId("pgn-explanation")).toHaveTextContent(
      "Explicación tras 1. a4"
    );
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    // Al final de la línea principal el botón siguiente se deshabilita.
    await user.click(nextBtn);
    expect(nextBtn).toBeDisabled();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("muestra la conclusión teórica cuando existe", () => {
    setup({ finalComment: "Conclusión: domina la regla del cuadrado." });
    expect(
      screen.getByText(/domina la regla del cuadrado/)
    ).toBeInTheDocument();
  });

  it("avisa cuando el PGN no tiene jugadas", () => {
    render(<PgnStudyViewer pgnContent='[Event "vacía"]' />);
    expect(
      screen.getByText("Esta lección no tiene jugadas en su PGN.")
    ).toBeInTheDocument();
  });
});

describe("PgnStudyViewer — auto-play con voz (TTS)", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("avanza una jugada cada 500 ms y se detiene al llegar al final", () => {
    jest.useFakeTimers();
    render(<PgnStudyViewer pgnContent={PGN_SIN_COMENTARIOS} />);

    fireEvent.click(screen.getByRole("button", { name: "Reproducir lección" }));
    expect(screen.getByText("0 / 3"));

    // Cada bloque de tiempo avanza exactamente una jugada (el siguiente
    // temporizador se reprograma al terminar el bloque).
    const step = () => act(() => jest.advanceTimersByTime(600));

    step();
    expect(screen.getByText("1 / 3"));
    // La jugada activa queda resaltada.
    expect(screen.getByRole("button", { name: "a4" }).className).toContain(
      "bg-primary"
    );

    step();
    expect(screen.getByText("2 / 3"));

    step();
    expect(screen.getByText("3 / 3"));

    // Un último ciclo detecta el fin de la línea y detiene la reproducción.
    step();
    // Fin de la línea: el botón vuelve al estado "reproducir".
    expect(
      screen.getByRole("button", { name: "Reproducir lección" })
    ).toBeInTheDocument();

    // Ya no avanza más.
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText("3 / 3"));
  });

  it("pausa la reproducción en los comentarios y los lee en español", () => {
    jest.useFakeTimers();
    render(<PgnStudyViewer pgnContent={PGN} />);

    fireEvent.click(screen.getByRole("button", { name: "Reproducir lección" }));

    // Posición inicial con comentario introductorio: lee inmediatamente.
    expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);
    const intro = speechSynthesisMock.speak.mock.calls[0][0] as MockUtterance;
    expect(intro.text).toContain("Comentario introductorio");
    expect(intro.lang).toBe("es-ES");

    // Mientras lee, el tablero no avanza.
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByText("0 / 2"));

    // La burbuja leída queda resaltada y el cuadro indica la lectura.
    expect(document.querySelector('[data-reading="true"]')).not.toBeNull();
    expect(screen.getByText(/Leyendo en voz alta/)).toBeInTheDocument();

    // Al terminar la lectura espera 500 ms y avanza a la primera jugada.
    act(() => {
      intro.onend?.();
    });
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.getByText("1 / 2"));

    // La jugada 1 tiene comentario: lo lee en lugar de seguir avanzando.
    expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(2);
    const moveSpeech = speechSynthesisMock.speak.mock.calls[1][0] as MockUtterance;
    expect(moveSpeech.text).toBe("Explicación tras 1. a4");

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByText("1 / 2"));

    // Lectura terminada → avanza a la última jugada (Kf7 también tiene
    // comentario: lo lee en lugar de terminar).
    act(() => {
      moveSpeech.onend?.();
    });
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.getByText("2 / 2"));
    expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(3);
    const lastSpeech = speechSynthesisMock.speak.mock.calls[2][0] as MockUtterance;
    expect(lastSpeech.text).toBe("El rey persigue al peón.");

    // Sigue "reproduciendo" (en pausa leyendo) hasta que termine la voz.
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(3);
  });

  it("el botón de pausa manual corta la voz y detiene el avance", () => {
    jest.useFakeTimers();
    render(<PgnStudyViewer pgnContent={PGN} />);

    fireEvent.click(screen.getByRole("button", { name: "Reproducir lección" }));
    expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);

    speechSynthesisMock.cancel.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Pausar lección" }));
    expect(speechSynthesisMock.cancel).toHaveBeenCalled();

    // Sin avance ni nuevas lecturas mientras está en pausa.
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText("0 / 2"));
    expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);

    // Reanudar vuelve a leer desde la posición actual.
    fireEvent.click(screen.getByRole("button", { name: "Reproducir lección" }));
    expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(2);
  });

  it("limpia las voces previas al cambiar de lección o desmontar", () => {
    const { rerender, unmount } = render(
      <PgnStudyViewer pgnContent={PGN} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Reproducir lección" }));

    speechSynthesisMock.cancel.mockClear();
    rerender(
      <PgnStudyViewer pgnContent={PGN_SIN_COMENTARIOS} />
    );
    expect(speechSynthesisMock.cancel).toHaveBeenCalled();
    // La reproducción se detiene al cambiar de lección.
    expect(
      screen.getByRole("button", { name: "Reproducir lección" })
    ).toBeInTheDocument();

    speechSynthesisMock.cancel.mockClear();
    unmount();
    expect(speechSynthesisMock.cancel).toHaveBeenCalled();
  });

  it("funciona sin soporte de voz: avanza sin bloquearse en los comentarios", () => {
    // Simula un navegador sin speechSynthesis.
    const original = Object.getOwnPropertyDescriptor(window, "speechSynthesis");
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      get: () => undefined,
    });

    try {
      jest.useFakeTimers();
      render(<PgnStudyViewer pgnContent={PGN} />);
      fireEvent.click(screen.getByRole("button", { name: "Reproducir lección" }));

      // Recorre toda la línea aunque no pueda leer los comentarios
      // (introducción + 2 jugadas, un bloque de tiempo por paso).
      for (let i = 0; i < 3; i++) {
        act(() => {
          jest.advanceTimersByTime(600);
        });
      }
      expect(screen.getByText("2 / 2"));
      expect(speechSynthesisMock.speak).not.toHaveBeenCalled();
    } finally {
      if (original) {
        Object.defineProperty(window, "speechSynthesis", original);
      } else {
        delete (window as { speechSynthesis?: unknown }).speechSynthesis;
      }
      jest.useRealTimers();
    }
  });

  it("configura rate y pitch estilo Gran Maestro en cada lectura", () => {
    jest.useFakeTimers();
    render(<PgnStudyViewer pgnContent={PGN} />);
    fireEvent.click(screen.getByRole("button", { name: "Reproducir lección" }));

    const intro = speechSynthesisMock.speak.mock.calls[0][0] as MockUtterance;
    expect(intro.rate).toBeCloseTo(0.95);
    expect(intro.pitch).toBeCloseTo(0.9);
    expect(intro.voice).toBe(mockSpanishMaleVoice);
  });

  it("reproduce el sonido de jugada en cada avance del auto-play", () => {
    jest.useFakeTimers();
    render(<PgnStudyViewer pgnContent={PGN_SIN_COMENTARIOS} />);
    fireEvent.click(screen.getByRole("button", { name: "Reproducir lección" }));

    // Posición inicial (ply 0): todavía no hay jugada que sonar.
    expect(mockPlayMoveSound).not.toHaveBeenCalled();

    const step = () => act(() => jest.advanceTimersByTime(600));
    step();
    expect(mockPlayMoveSound).toHaveBeenCalledTimes(1);
    step();
    expect(mockPlayMoveSound).toHaveBeenCalledTimes(2);
    step();
    expect(mockPlayMoveSound).toHaveBeenCalledTimes(3);

    // Fin de la línea: no suena nada más.
    step();
    expect(mockPlayMoveSound).toHaveBeenCalledTimes(3);
  });

  it("suena con la navegación manual hacia adelante y calla al retroceder", async () => {
    jest.useRealTimers();
    const user = userEvent.setup();
    render(<PgnStudyViewer pgnContent={PGN_SIN_COMENTARIOS} />);

    await user.click(screen.getByRole("button", { name: "Jugada siguiente" }));
    expect(mockPlayMoveSound).toHaveBeenCalledTimes(1);

    // Retroceder NO reproduce sonido.
    await user.click(screen.getByRole("button", { name: "Jugada anterior" }));
    expect(mockPlayMoveSound).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Jugada siguiente" }));
    expect(mockPlayMoveSound).toHaveBeenCalledTimes(2);
  });

  it("no produce sonido fantasma al cambiar de lección", () => {
    jest.useFakeTimers();
    const { rerender } = render(
      <PgnStudyViewer pgnContent={PGN_SIN_COMENTARIOS} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Reproducir lección" }));
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(mockPlayMoveSound).toHaveBeenCalledTimes(1);

    // El reset de path al cambiar el PGN no debe disparar un sonido extra.
    rerender(<PgnStudyViewer pgnContent={PGN} />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockPlayMoveSound).toHaveBeenCalledTimes(1);
  });
});

describe("selectSpanishMaleVoice", () => {
  const voice = (name: string, lang = "es-ES") =>
    ({ name, lang }) as SpeechSynthesisVoice;

  it("elige 'Álvaro' (con tilde) aunque aparezca tras voces femeninas", () => {
    const voices = [
      voice("Microsoft Elvira Online (Natural) - Spanish (Spain)"),
      voice("Microsoft Helena - Spanish (Spain)"),
      voice("Microsoft Álvaro Online (Natural) - Spanish (Spain)"),
    ];
    expect(selectSpanishMaleVoice(voices)?.name).toContain("lvaro");
  });

  it("nunca elige una voz femenina por llevar 'Natural' o 'Microsoft' en el nombre", () => {
    const voices = [
      voice("Microsoft Elvira Online (Natural) - Spanish (Spain)"),
      voice("Microsoft Sabina - Spanish (Spain)"),
      voice("Voz masculina genérica"), // sin nombre reconocible pero no femenina
    ];
    expect(selectSpanishMaleVoice(voices)?.name).toBe("Voz masculina genérica");
  });

  it("prefiere un nombre masculino explícito sobre calidad sin género", () => {
    const voices = [
      voice("Voz premium desconocida"),
      voice("Google Pablo"),
    ];
    expect(selectSpanishMaleVoice(voices)?.name).toBe("Google Pablo");
  });

  it("devuelve null si no hay voces españolas", () => {
    expect(
      selectSpanishMaleVoice([voice("English (America)", "en-US")])
    ).toBeNull();
    expect(selectSpanishMaleVoice([])).toBeNull();
  });

  it("si solo hay femeninas, usa la primera como último recurso", () => {
    const voices = [voice("Elvira"), voice("Helena")];
    expect(selectSpanishMaleVoice(voices)?.name).toBe("Elvira");
  });
});
