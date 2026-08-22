"use client";

import { useState, useEffect, useMemo } from "react";
import { LichessReplay, parsePgnMoves } from "@/components/analysis/LichessReplay";
import { Button } from "@/components/ui/button";
import { Play, Pause, ChevronLeft, ChevronRight, X, Sparkles } from "lucide-react";

export interface DemoStep {
  id: number;
  startPly: number;
  endPly: number;
  title: string;
  subtitleText: string;
}

const CARLSEN_GUKESH_PGN = `[Event "Norway Chess 2026"]
[Site "Stavanger NOR"]
[Date "2026.06.01"]
[Round "1"]
[White "Carlsen, Magnus"]
[Black "Gukesh, D."]
[Result "1-0"]
[ECO "B12"]

1. e4 c6 2. d4 d5 3. e5 Bf5 4. h4 h6 5. g4 Bd7 6. Nd2 e6 7. Nb3 b6 8. Be3 a5 9. a4 Na6 10. f4 h5 11. gxh5 c5 12. c3 c4 13. Nd2 Nh6 14. g4 Be7 15. Bf2 b5 16. axb5 Bxb5 17. b3 Qc7 18. bxc4 dxc4 19. Ne2 Bc6 20. Rg1 Bd5 21. Ng3 Bxh4 22. Nge4 Bxf2+ 23. Kxf2 Bxe4 24. Nxe4 O-O 25. Qf3 Kh8 26. Bh3 Rab8 27. Ra2 Qe7 28. Qg3 Rg8 29. Kg2 Nc7 30. Kh1 Nd5 31. Rf2 f5 32. exf6 Nxf6 33. Ng5 Rb6 34. Re1 Nf5 35. Bxf5 exf5 36. Rxe7 Rb1+ 37. Kg2 Ng4 38. h6 gxh6 39. Rh7# 1-0`;

const DEMO_STEPS: DemoStep[] = [
  {
    id: 1,
    startPly: 0,
    endPly: 9,
    title: "1. Apertura Caro-Kann",
    subtitleText: "Magnus Carlsen con piezas blancas abre la partida frente a D Gukesh en el prestigioso torneo Norway Chess 2026. Se plantea la sólida defensa Caro-Kann, buscando un juego posicional equilibrado.",
  },
  {
    id: 2,
    startPly: 10,
    endPly: 26,
    title: "2. Desarrollo y Control del Centro",
    subtitleText: "Ambos jugadores despliegan sus piezas con precisión quirúrgica. Las blancas controlan el espacio central mientras las negras preparan su contrajuego en el ala de dama.",
  },
  {
    id: 3,
    startPly: 27,
    endPly: 44,
    title: "3. ¡Jugada Crítica: 14. g4!",
    subtitleText: "¡Momento clave! Carlsen lanza un ataque agresivo y sorprendente con g4, buscando romper las defensas del enroque rival y desequilibrar por completo la posición.",
  },
  {
    id: 4,
    startPly: 45,
    endPly: 66,
    title: "4. Medio Juego Táctico y Tensión",
    subtitleText: "La tensión explota en el tablero. Las amenazas tácticas se multiplican y cada cálculo requiere máxima precisión bajo la presión del reloj.",
  },
  {
    id: 5,
    startPly: 67,
    endPly: 78,
    title: "5. Desenlace y Victoria Magistral",
    subtitleText: "Tras una serie de combinaciones precisas, el campeón mundial materializa su ventaja y asegura el punto completo en una partida para el recuerdo.",
  },
];

interface InteractiveDemoProps {
  onClose: () => void;
  pgn?: string;
}

export function InteractiveDemo({ onClose, pgn = CARLSEN_GUKESH_PGN }: InteractiveDemoProps) {
  const [currentPly, setCurrentPly] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const data = useMemo(() => parsePgnMoves(pgn), [pgn]);
  const totalPlies = data?.totalPlies ?? 78;

  const currentStep = useMemo(() => {
    return DEMO_STEPS.find((s) => currentPly >= s.startPly && currentPly <= s.endPly) || DEMO_STEPS[DEMO_STEPS.length - 1];
  }, [currentPly]);

  const currentStepIndex = DEMO_STEPS.findIndex((s) => s.id === currentStep.id);

  // Autoplay ply by ply every 500ms (0.5 seconds per move)
  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      setCurrentPly((prev) => {
        if (prev < totalPlies) {
          return prev + 1;
        } else {
          setIsPlaying(false);
          return prev;
        }
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, [isPlaying, totalPlies]);

  const handleNextStep = () => {
    setIsPlaying(false);
    if (currentStepIndex < DEMO_STEPS.length - 1) {
      setCurrentPly(DEMO_STEPS[currentStepIndex + 1].startPly);
    }
  };

  const handlePrevStep = () => {
    setIsPlaying(false);
    if (currentStepIndex > 0) {
      setCurrentPly(DEMO_STEPS[currentStepIndex - 1].startPly);
    } else {
      setCurrentPly(0);
    }
  };

  return (
    <div className="relative w-full space-y-4 pb-36">
      <div className="flex items-center justify-between bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg border border-slate-800">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-400 animate-pulse" />
          <span className="font-semibold text-sm md:text-base">Demo Interactiva: Carlsen vs. Gukesh (Norway Chess 2026)</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="h-4 w-4 mr-1" />
          Salir de la Demo
        </Button>
      </div>

      <LichessReplay pgn={pgn} layout="side" targetPly={currentPly} />

      {/* Floating Subtitle / Instructions Banner */}
      <div className="fixed bottom-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-3xl z-50 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl p-5 md:p-6 border border-slate-700/80 transition-all duration-300">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-bold tracking-wider">
                PASO {currentStepIndex + 1} DE {DEMO_STEPS.length}
              </span>
              <h3 className="font-bold text-base md:text-lg text-slate-100">{currentStep.title}</h3>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Jugada / Ply: {currentPly} / {totalPlies}
            </div>
          </div>

          <p className="text-sm md:text-base text-slate-300 leading-relaxed font-normal">
            {currentStep.subtitleText}
          </p>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div className="flex items-center gap-1.5">
              {DEMO_STEPS.map((step, idx) => (
                <button
                  key={step.id}
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentPly(step.startPly);
                  }}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentStepIndex
                      ? "w-8 bg-primary"
                      : "w-2 bg-slate-700 hover:bg-slate-600"
                  }`}
                  aria-label={`Ir al paso ${step.id}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevStep}
                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Paso Anterior
              </Button>

              <Button
                size="sm"
                onClick={() => setIsPlaying(!isPlaying)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-4 w-4 mr-1.5" />
                    Pausar Partida
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1.5" />
                    Reproducer (0.5s/jugada)
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleNextStep}
                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white"
              >
                Paso Siguiente
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
