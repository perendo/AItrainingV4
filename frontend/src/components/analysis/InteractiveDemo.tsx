"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { ReplayBoard } from "./ReplayBoard";
import { AnalysisFormPanel, AnalysisFormState } from "./AnalysisFormPanel";
import { selectSpanishMaleVoice } from "../endgame/PgnStudyViewer";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
  RotateCcw,
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  MousePointerClick,
  Volume2,
  VolumeX,
} from "lucide-react";

/* Partida famosa: Carlsen vs Anand, 10º juego del Mundial 2013 (Chennai),
   la partida con la que Carlsen se proclamó campeón del mundo. */
const DEMO_PGN = `[Event "World Chess Championship 2013"]
[Site "Chennai IND"]
[Date "2013.11.22"]
[Round "10"]
[White "Carlsen, Magnus"]
[Black "Anand, Viswanathan"]
[Result "1/2-1/2"]
[ECO "B51"]

1. e4 c5 2. Nf3 d6 3. Bb5+ Nd7 4. d4 cxd4 5. Qxd4 a6 6. Bxd7+ Bxd7 7. c4 Nf6 8. Bg5 e6 9. Nc3 Be7 10. O-O Bc6 11. Qd3 O-O 12. Nd4 Rc8 13. b3 Qc7 14. Nxc6 Qxc6 15. Rac1 h6 16. Be3 Nd7 17. Bd4 Rfd8 18. h3 Qc7 19. Rfd1 Qa5 20. Qd2 Kf8 21. Qb2 Kg8 22. a4 Qh5 23. Ne2 Bf6 24. Rc3 Bxd4 25. Rxd4 Qe5 26. Qd2 Nf6 27. Re3 Rd7 28. a5 Qg5 29. e5 Ne8 30. exd6 Rc6 31. f4 Qd8 32. Red3 Rcxd6 33. Rxd6 Rxd6 34. Rxd6 Qxd6 35. Qxd6 Nxd6 36. Kf2 Kf8 37. Ke3 Ke7 38. Kd4 Kd7 39. Kc5 Kc7 40. Nc3 Nf5 41. Ne4 Ne3 42. g3 f5 43. Nd6 g5 44. Ne8+ Kd7 45. Nf6+ Ke7 46. Ng8+ Kf8 47. Nxh6 gxf4 48. gxf4 Kg7 49. Nxf5+ exf5 50. Kb6 Ng2 51. Kxb7 Nxf4 52. Kxa6 Ne6 53. Kb6 f4 54. a6 f3 55. a7 f2 56. a8=Q f1=Q 57. Qd5 Qe1 58. Qd6 Qe3+ 59. Ka6 Nc5+ 60. Kb5 Nxb3 61. Qc7+ Kh6 62. Qb6+ Qxb6+ 63. Kxb6 Kh5 64. h4 Kxh4 65. c5 Nxc5 1/2-1/2`;

type ArrowSide = "top" | "bottom" | "left" | "right" | null;

interface TourStep {
  id: string;
  target: string | null;
  arrow: ArrowSide;
  title: string;
  text: string;
  openBlock?: string | null;
  fill?: Partial<AnalysisFormState>;
}

const EMPTY_VALUES: AnalysisFormState = {
  fases: { apertura: "", medio_juego: "", final: "" },
  momentos: { pieza_a_mejorar: "", amenaza_rival: "" },
  factores: { material: "", seguridad_rey: "", espacio: "" },
  conclusiones: {
    plan_estrategico: "",
    error_conceptual_grave: "",
    idea_a_repasar: "",
  },
};

const STEPS: TourStep[] = [
  {
    id: "reproducir",
    target: '[data-tour="replay-play"]',
    arrow: "bottom",
    title: "Paso 1 · Reproduce la partida",
    text: "Lo primero, antes de realizar un análisis, es reproducir de forma íntegra la partida pulsando el botón de reproducir. Así conoces la historia completa antes de juzgarla.",
    openBlock: null,
  },
  {
    id: "bloque1",
    target: '[data-tour="block-1"]',
    arrow: "left",
    title: "Paso 2 · Bloque 1 — Fases",
    text: "Abre el Bloque 1 y anota tu visión de la Apertura, el Medio Juego y el Final. Ejemplo: aquí Carlsen planteó una Rossolimo (1.e4 c5 3.Bb5+), buscando una posición sólida y evitar la preparación de Anand.",
    openBlock: "fases",
    fill: {
      fases: {
        apertura:
          "Rossolimo (1.e4 c5 3.Bb5+). Carlsen evita la preparación de Anand y busca una estructura sólida con luz de bispos.",
        medio_juego:
          "Cambio de damas y finales de alfiles. Carlsen mantiene la pareja de alfiles y presiona con la estructura de peones.",
        final:
          "Final de peones y damas con coronaciones cruzadas. La técnica de Carlsen fuerza las tablas cuando le basta con el empate.",
      },
    },
  },
  {
    id: "bloque2",
    target: '[data-tour="block-2"]',
    arrow: "left",
    title: "Paso 3 · Bloque 2 — Preguntas Críticas",
    text: "En el Bloque 2 responde: ¿qué pieza pude haber mejorado y cuál era la amenaza real del rival? Ejemplo: la pieza menos activa fue el caballo de casilla clara de Anand tras ...Nd7.",
    openBlock: "criticas",
    fill: {
      momentos: {
        pieza_a_mejorar:
          "El caballo de Anand quedó pasivo tras 17...Nd7; hubiera convenido recolocarlo antes.",
        amenaza_rival:
          "La amenaza real era el contrajuego en el ala de dama con ...b5/...a5 y la ruptura ...f5.",
      },
    },
  },
  {
    id: "bloque3",
    target: '[data-tour="block-3"]',
    arrow: "left",
    title: "Paso 4 · Bloque 3 — Factores Posicionales",
    text: "En el Bloque 3 valora Material, Seguridad del Rey y Espacio. Ejemplo: el material se equilibró tras los cambios; el rey de Carlsen quedó más seguro en el final.",
    openBlock: "posicionales",
    fill: {
      factores: {
        material:
          "Material equilibrado tras los cambios de damas y alfiles; ninguna debilidad de peones clara.",
        seguridad_rey:
          "El rey de Carlsen se protegió tras ...Kg8 y la simplificación; el de Anand tuvo menos aire.",
        espacio:
          "Carlsen controló el centro y ganó espacio en el ala de dama con el avance de peones.",
      },
    },
  },
  {
    id: "bloque4",
    target: '[data-tour="block-4"]',
    arrow: "left",
    title: "Paso 5 · Bloque 4 — Conclusiones",
    text: "En el Bloque 4 redacta tu plan estratégico, el error conceptual grave y la idea a repasar. Ejemplo: el plan fue simplificar hacia un final favorable; el error, no anticipar la ruptura ...f5.",
    openBlock: "conclusiones",
    fill: {
      conclusiones: {
        plan_estrategico:
          "Simplificar hacia un final de damas y peones donde mi técnica sume medio punto.",
        error_conceptual_grave:
          "No anticipé la ruptura ...f5 que activó las piezas rivales en el ala de rey.",
        idea_a_repasar:
          "Estudiar finales de damas con peones pasados en alas opuestas y la regla del 'reespacio'.",
      },
    },
  },
  {
    id: "enviar",
    target: '[data-tour="submit"]',
    arrow: "left",
    title: "Paso 6 · Envía al Gran Maestro",
    text: "Cuando hayas completado tu autodiagnóstico, pulsa “Enviar a Evaluación del Gran Maestro”. El GM auditará tu análisis y te devolverá su informe.",
    openBlock: null,
  },
  {
    id: "completado",
    target: null,
    arrow: null,
    title: "¡Felicidades has enviado tu primer analisis!",
    text: "Así se analiza una partida: se reproduce entera, se rellenan los 4 bloques del autodiagnóstico y se envía al Gran Maestro. Puedes repetir este tutorial las veces que quieras.",
    openBlock: null,
  },
];

interface InteractiveDemoProps {
  onClose: () => void;
  pgn?: string;
}

export function InteractiveDemo({
  onClose,
  pgn = DEMO_PGN,
}: InteractiveDemoProps) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<AnalysisFormState>(EMPTY_VALUES);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isSubmitStep = current.id === "enviar";

  // --- Locución (TTS) de los textos del tutorial ---
  const ttsSupported =
    typeof window !== "undefined" && !!window.speechSynthesis;
  const [voiceOn, setVoiceOn] = useState(true);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!ttsSupported) return;
    const update = () =>
      setVoice(selectSpanishMaleVoice(window.speechSynthesis.getVoices()));
    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, [ttsSupported]);

  const speak = useCallback(
    (text: string) => {
      if (!ttsSupported) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "es-ES";
        utterance.rate = 0.95;
        utterance.pitch = 0.9;
        const v = voice ?? selectSpanishMaleVoice(
          window.speechSynthesis.getVoices(),
        );
        if (v) utterance.voice = v;
        window.speechSynthesis.speak(utterance);
      } catch {
        /* silencioso */
      }
    },
    [ttsSupported, voice],
  );

  useEffect(() => {
    if (!voiceOn) {
      if (ttsSupported) window.speechSynthesis.cancel();
      return;
    }
    speak(`${current.title}. ${current.text}`);
    return () => {
      if (ttsSupported) window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, voiceOn, ttsSupported]);

  // Al cambiar de paso, acumulamos el texto de ejemplo y medimos el objetivo.
  useEffect(() => {
    if (current.fill) {
      setValues((prev) => ({
        fases: { ...prev.fases, ...current.fill?.fases },
        momentos: { ...prev.momentos, ...current.fill?.momentos },
        factores: { ...prev.factores, ...current.fill?.factores },
        conclusiones: {
          ...prev.conclusiones,
          ...current.fill?.conclusiones,
        },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const measure = useCallback(() => {
    if (!current.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(current.target);
    if (el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [current.target]);

  useLayoutEffect(() => {
    if (current.target) {
      const el = document.querySelector(current.target);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    measure();
    const t = window.setTimeout(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // `current.target` se lista explícitamente aunque `measure` ya dependa de
    // él: hace explícita la recalibración al cambiar de paso del tour.
  }, [measure, values, current.target]);

  const handleReset = () => {
    setValues(EMPTY_VALUES);
    setStep(0);
  };

  const handleDemoSubmit = () => setStep(STEPS.length - 1);

  const arrowStyle: CSSProperties = (() => {
    if (!rect || !current.arrow) return {};
    const w = 32;
    const gap = 14;
    switch (current.arrow) {
      case "top":
        return {
          top: rect.top - w - gap,
          left: rect.left + rect.width / 2 - w / 2,
        };
      case "bottom":
        return {
          top: rect.bottom + gap,
          left: rect.left + rect.width / 2 - w / 2,
        };
      case "left":
        return {
          top: rect.top + rect.height / 2 - w / 2,
          left: rect.left - w - gap,
        };
      case "right":
        return {
          top: rect.top + rect.height / 2 - w / 2,
          left: rect.right + gap,
        };
      default:
        return {};
    }
  })();

  const ArrowIcon =
    current.arrow === "top"
      ? ArrowDown
      : current.arrow === "bottom"
        ? ArrowUp
        : current.arrow === "left"
          ? ArrowRight
          : current.arrow === "right"
            ? ArrowLeft
            : MousePointerClick;

  return (
    <div className="relative w-full space-y-6 pb-48">
      {/* Barra superior de la demo */}
      <div className="flex items-center justify-between bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg border border-slate-800">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-400 animate-pulse" />
          <span className="font-semibold text-sm md:text-base">
            Tutorial: Cómo analizar una partida
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="h-4 w-4 mr-1" />
          Salir
        </Button>
      </div>

      {/* Fondo idéntico a la pantalla de análisis */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-[55%]">
          <ReplayBoard pgn={pgn} />
        </div>
        <div className="w-full lg:w-[45%]">
          <AnalysisFormPanel
            gameType="GM"
            gmGameId="demo"
            pgn={pgn}
            whitePlayer="Carlsen, Magnus"
            blackPlayer="Anand, Viswanathan"
            openBlock={current.openBlock ?? null}
            controlledValues={values}
            demoMode
            onDemoSubmit={handleDemoSubmit}
          />
        </div>
      </div>

      {/* Capa de resaltado + flecha (no bloquea la interacción) */}
      {rect && (
        <div className="pointer-events-none fixed inset-0 z-40">
          <div
            className="absolute rounded-xl border-4 border-amber-400"
            style={{
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            }}
          />
          {current.arrow && (
            <div
              className="absolute flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-slate-900 shadow-lg animate-bounce"
              style={arrowStyle}
            >
              <ArrowIcon className="h-5 w-5" />
            </div>
          )}
        </div>
      )}

      {/* Tarjeta de instrucciones (fija abajo) */}
      <div className="fixed bottom-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-2xl z-50 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl p-5 md:p-6 border border-slate-700/80">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-base md:text-lg text-slate-100">
              {current.title}
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              {ttsSupported && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setVoiceOn((v) => !v)}
                  title={voiceOn ? "Silenciar narración" : "Activar narración"}
                  className="h-7 w-7 text-primary hover:bg-slate-800"
                >
                  {voiceOn ? (
                    <Volume2 className="h-4 w-4" />
                  ) : (
                    <VolumeX className="h-4 w-4" />
                  )}
                </Button>
              )}
              <span className="px-2.5 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-bold tracking-wider">
                {Math.min(step + 1, STEPS.length - 1)} / {STEPS.length - 1}
              </span>
            </div>
          </div>

          <p className="text-sm md:text-base text-slate-300 leading-relaxed">
            {current.text}
          </p>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>

            {isLast ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Repetir
                </Button>
                <Button size="sm" onClick={onClose} className="font-semibold">
                  Entendido
                </Button>
              </div>
            ) : isSubmitStep ? (
              <Button
                size="sm"
                onClick={handleDemoSubmit}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4"
              >
                <MousePointerClick className="h-4 w-4 mr-1.5" />
                Enviar al Gran Maestro
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4"
              >
                Siguiente
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
