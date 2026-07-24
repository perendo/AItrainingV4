"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle, XCircle, AlertCircle, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitGameAnalysis, getGameAnalysis } from "@/lib/api";
import { UserGameAnalysisResponse, UserGameAnalysisSubmit, GeminiFeedback } from "@/lib/types";

const DynamicChessboard = dynamic(
  () => import("react-chessboard").then((mod) => mod.Chessboard),
  { ssr: false }
);

interface GMGameAnalysisViewProps {
  gmGame: {
    id: number;
    white: string;
    black: string;
    pgn: string;
    gm_name: string;
    event?: string;
    year?: number;
    result?: string;
  };
  onComplete?: () => void;
}

export function GMGameAnalysisView({ gmGame, onComplete }: GMGameAnalysisViewProps) {
  const [viewIndex, setViewIndex] = useState(0);
  const [userMoveHistory, setUserMoveHistory] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<UserGameAnalysisResponse | null>(null);
  
  // Form state
  const [fases, setFases] = useState({ apertura: "", medio_juego: "", final: "" });
  const [momentos, setMomentos] = useState({ pieza_a_mejorar: "", amenaza_rival: "" });
  const [factores, setFactores] = useState({ material: "", seguridad_rey: "", espacio: "" });
  const [conclusiones, setConclusiones] = useState({ 
    plan_estrategico: "", 
    error_conceptual_grave: "", 
    idea_a_repasar: "" 
  });

  // Parse PGN and compute positions
  const { positions, totalMoves } = useMemo(() => {
    const game = new Chess();
    const pgnText = gmGame.pgn;
    try {
      game.loadPgn(pgnText);
    } catch (e) {
      return { positions: ["start"], totalMoves: 0 };
    }

    const fens = [game.fen()];
    const moveHistory = game.history({ verbose: true });
    for (const move of moveHistory) {
      const san = move.san;
      game.move(san);
      fens.push(game.fen());
    }
    return { positions: fens, totalMoves: fens.length - 1 };
  }, [gmGame.pgn]);

  const currentFen = positions[viewIndex] || positions[0];

  const handleGoToMove = useCallback((index: number) => {
    setViewIndex(Math.max(0, Math.min(index, positions.length - 1)));
  }, [positions.length]);

  const handlePrev = useCallback(() => {
    handleGoToMove(viewIndex - 1);
  }, [viewIndex, handleGoToMove]);

  const handleNext = useCallback(() => {
    handleGoToMove(viewIndex + 1);
  }, [viewIndex, handleGoToMove]);

  const handleSubmit = async () => {
    setStatus("loading");
    setError(null);
    
    try {
      const submitData: UserGameAnalysisSubmit = {
        gm_game_id: gmGame.id,
        fases_analisis: fases,
        momentos_criticos: momentos,
        factores_posicionales: factores,
        conclusiones_plan: conclusiones,
      };
      
      const result = await submitGameAnalysis(submitData);
      setAnalysisResult(result);
      setStatus("success");
      onComplete?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al enviar análisis";
      setError(message);
      setStatus("error");
    }
  };

  // Group moves for PGN viewer
  const groupedMoves = useMemo(() => {
    const game = new Chess();
    try {
      game.loadPgn(gmGame.pgn);
    } catch (e) {
      return [];
    }
    const history = game.history({ verbose: true });
    
    const groups: Array<{
      moveNumber: number;
      whiteMove?: { san: string; index: number };
      blackMove?: { san: string; index: number };
    }> = [];
    
    history.forEach((move, index) => {
      const moveNumber = Math.floor(index / 2) + 1;
      if (move.color === "w") {
        groups.push({ moveNumber, whiteMove: { san: move.san, index } });
      } else {
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.moveNumber === moveNumber) {
          lastGroup.blackMove = { san: move.san, index };
        } else {
          groups.push({ moveNumber, blackMove: { san: move.san, index } });
        }
      }
    });
    
    return groups;
  }, [gmGame.pgn]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Análisis de Partida GM: {gmGame.white} vs {gmGame.black}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {gmGame.event} · {gmGame.year} · {gmGame.result} · GM: {gmGame.gm_name}
        </p>
      </div>

      {/* Main Layout: 2 Columns */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT COLUMN: Board (55%) */}
        <div className="w-full lg:w-[55%] space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Tablero Interactivo</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full aspect-square max-w-[720px] mx-auto p-4">
                <DynamicChessboard
                  position={currentFen}
                  boardOrientation={(new Chess(currentFen).turn() === "w" ? "white" : "black") as "white" | "black"}
                  customBoardStyle={{ borderRadius: "4px" }}
                  arePiecesDraggable={false}
                />
              </div>
            </CardContent>
          </Card>

          {/* Move List / Notation */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Notación de la Partida</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center gap-2 mb-3">
                <Button variant="outline" size="icon" onClick={handlePrev} disabled={viewIndex === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={handleNext} disabled={viewIndex >= positions.length - 1}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-sm max-h-64 overflow-y-auto">
                <div className="flex flex-wrap gap-x-2 gap-y-1 mb-1">
                  <button
                    onClick={() => handleGoToMove(0)}
                    className={cn(
                      "p-1 rounded cursor-pointer",
                      viewIndex === 0 && "bg-primary text-primary-foreground font-bold"
                    )}
                  >
                    1.
                  </button>
                </div>
                {groupedMoves.map((group, groupIndex) => (
                  <div key={groupIndex} className="flex flex-wrap gap-x-2 gap-y-1 mb-1">
                    <span className="font-bold mr-1">{group.moveNumber}.</span>
                    {group.whiteMove && (
                      <button
                        onClick={() => handleGoToMove(group.whiteMove!.index + 1)}
                        className={cn(
                          "p-1 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800",
                          viewIndex === group.whiteMove!.index + 1 && "bg-primary text-primary-foreground font-bold"
                        )}
                      >
                        {group.whiteMove.san}
                      </button>
                    )}
                    {group.blackMove && (
                      <button
                        onClick={() => handleGoToMove(group.blackMove!.index + 1)}
                        className={cn(
                          "p-1 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800",
                          viewIndex === group.blackMove!.index + 1 && "bg-primary text-primary-foreground font-bold"
                        )}
                      >
                        {group.blackMove.san}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: Form (45%) */}
        <div className="w-full lg:w-[45%] space-y-4">
          {/* Form Tabs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Formulario de Autodiagnóstico</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue="fases" className="w-full">
                <TabsList className="grid w-full grid-cols-4 p-2">
                  <TabsTrigger value="fases">Fases</TabsTrigger>
                  <TabsTrigger value="criticas">Críticas</TabsTrigger>
                  <TabsTrigger value="posicionales">Posicionales</TabsTrigger>
                  <TabsTrigger value="conclusiones">Conclusiones</TabsTrigger>
                </TabsList>

                <TabsContent value="fases" className="p-4 space-y-4">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="apertura" className="block text-sm font-medium mb-1">Apertura</Label>
                      <Textarea
                        id="apertura"
                        value={fases.apertura}
                        onChange={(e) => setFases(prev => ({ ...prev, apertura: e.target.value }))}
                        placeholder="Analiza la apertura: ideas principales, variantes, evaluación..."
                        rows={3}
                        className="min-h-[80px]"
                      />
                    </div>
                    <div>
                      <Label htmlFor="medio_juego" className="block text-sm font-medium mb-1">Medio Juego</Label>
                      <Textarea
                        id="medio_juego"
                        value={fases.medio_juego}
                        onChange={(e) => setFases(prev => ({ ...prev, medio_juego: e.target.value }))}
                        placeholder="Planes, rupturas, maniobras, debilidades explotadas..."
                        rows={3}
                        className="min-h-[80px]"
                      />
                    </div>
                    <div>
                      <Label htmlFor="final" className="block text-sm font-medium mb-1">Final</Label>
                      <Textarea
                        id="final"
                        value={fases.final}
                        onChange={(e) => setFases(prev => ({ ...prev, final: e.target.value }))}
                        placeholder="Técnica de final, conversión de ventajas, conceptos clave..."
                        rows={3}
                        className="min-h-[80px]"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="criticas" className="p-4 space-y-4">
                  <div>
                    <Label htmlFor="pieza_a_mejorar" className="block text-sm font-medium mb-1">Pieza a Mejorar</Label>
                    <Textarea
                      id="pieza_a_mejorar"
                      value={momentos.pieza_a_mejorar}
                      onChange={(e) => setMomentos(prev => ({ ...prev, pieza_a_mejorar: e.target.value }))}
                      placeholder="¿Qué pieza está peor situada? ¿Por qué? ¿Cómo mejorarla?"
                      rows={3}
                      className="min-h-[80px]"
                    />
                  </div>
                  <div>
                    <Label htmlFor="amenaza_rival" className="block text-sm font-medium mb-1">Amenaza del Rival</Label>
                    <Textarea
                      id="amenaza_rival"
                      value={momentos.amenaza_rival}
                      onChange={(e) => setMomentos(prev => ({ ...prev, amenaza_rival: e.target.value }))}
                      placeholder="¿Cuál es la amenaza real del oponente en el momento crítico?"
                      rows={3}
                      className="min-h-[80px]"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="posicionales" className="p-4 space-y-4">
                  <div>
                    <Label htmlFor="material" className="block text-sm font-medium mb-1">Material</Label>
                    <Textarea
                      id="material"
                      value={factores.material}
                      onChange={(e) => setFactores(prev => ({ ...prev, material: e.target.value }))}
                      placeholder="Balance material, calidad de piezas, peones débiles/fuertes..."
                      rows={3}
                      className="min-h-[80px]"
                    />
                  </div>
                  <div>
                    <Label htmlFor="seguridad_rey" className="block text-sm font-medium mb-1">Seguridad del Rey</Label>
                    <Textarea
                      id="seguridad_rey"
                      value={factores.seguridad_rey}
                      onChange={(e) => setFactores(prev => ({ ...prev, seguridad_rey: e.target.value }))}
                      placeholder="Enroque, debilidades en la cobertura, ataques directos..."
                      rows={3}
                      className="min-h-[80px]"
                    />
                  </div>
                  <div>
                    <Label htmlFor="espacio" className="block text-sm font-medium mb-1">Espacio</Label>
                    <Textarea
                      id="espacio"
                      value={factores.espacio}
                      onChange={(e) => setFactores(prev => ({ ...prev, espacio: e.target.value }))}
                      placeholder="Control del centro, expansión, casillas débiles, peones pasados..."
                      rows={3}
                      className="min-h-[80px]"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="conclusiones" className="p-4 space-y-4">
                  <div>
                    <Label htmlFor="plan_estrategico" className="block text-sm font-medium mb-1">Plan Estratégico</Label>
                    <Textarea
                      id="plan_estrategico"
                      value={conclusiones.plan_estrategico}
                      onChange={(e) => setConclusiones(prev => ({ ...prev, plan_estrategico: e.target.value }))}
                      placeholder="Tu plan basado en el diagnóstico: ¿qué hacer y por qué?"
                      rows={3}
                      className="min-h-[80px]"
                    />
                  </div>
                  <div>
                    <Label htmlFor="error_conceptual_grave" className="block text-sm font-medium mb-1">Error Conceptual Grave</Label>
                    <Textarea
                      id="error_conceptual_grave"
                      value={conclusiones.error_conceptual_grave}
                      onChange={(e) => setConclusiones(prev => ({ ...prev, error_conceptual_grave: e.target.value }))}
                      placeholder="El error de evaluación o comprensión más importante que cometiste"
                      rows={3}
                      className="min-h-[80px]"
                    />
                  </div>
                  <div>
                    <Label htmlFor="idea_a_repasar" className="block text-sm font-medium mb-1">Idea a Repasar</Label>
                    <Textarea
                      id="idea_a_repasar"
                      value={conclusiones.idea_a_repasar}
                      onChange={(e) => setConclusiones(prev => ({ ...prev, idea_a_repasar: e.target.value }))}
                      placeholder="Concepto, final, estructura o técnica concreta a estudiar (ej: Finales de Torres Vancura, Estructura Carlsbad...)"
                      rows={3}
                      className="min-h-[80px]"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={status === "loading"}
            className="w-full py-3 text-lg font-semibold bg-primary hover:bg-primary/90"
            size="lg"
          >
            {status === "loading" ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Consultando al Gran Maestro...
              </>
            ) : (
              "Enviar a Evaluación del Gran Maestro"
            )}
          </Button>

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
              <p className="font-medium">Error:</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}

          {/* Results / Auditoría de Gemini */}
          {analysisResult && analysisResult.gemini_feedback && (
            <div className="space-y-4">
              <Separator />
              <h2 className="text-xl font-semibold text-primary">Auditoría del Gran Maestro</h2>
              <GeminiFeedbackDisplay 
                feedback={JSON.parse(analysisResult.gemini_feedback) as GeminiFeedback}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Separate component for the feedback display
function GeminiFeedbackDisplay({ feedback }: { feedback: GeminiFeedback }) {
  const { feedback_fases, respuestas_preguntas_criticas, matriz_posicional, auditoria_conclusiones } = feedback;

  return (
    <div className="space-y-4">
      {/* Plan Badge */}
      <div className={cn(
        "p-4 rounded-lg border text-center font-medium",
        auditoria_conclusiones.plan_correcto
          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
          : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
      )}>
        <div className="flex items-center justify-center gap-2">
          {auditoria_conclusiones.plan_correcto ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
          <span className="text-lg">
            {auditoria_conclusiones.plan_correcto 
              ? "✓ Plan Estratégico CORRECTO" 
              : "✗ Plan Estratégico INCORRECTO"}
          </span>
        </div>
      </div>

      {/* Feedback por Fases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            Feedback por Fases
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Apertura</p>
            <p className="text-sm mt-1">{feedback_fases.apertura}</p>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Medio Juego</p>
            <p className="text-sm mt-1">{feedback_fases.medio_juego}</p>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Final</p>
            <p className="text-sm mt-1">{feedback_fases.final}</p>
          </div>
        </CardContent>
      </Card>

      {/* Preguntas Críticas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Corrección Preguntas Críticas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Pieza a Mejorar</p>
            <p className="text-sm mt-1">{respuestas_preguntas_criticas.mejora_piezas}</p>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Amenaza Real del Rival</p>
            <p className="text-sm mt-1">{respuestas_preguntas_criticas.amenaza_real}</p>
          </div>
        </CardContent>
      </Card>

      {/* Matriz Posicional */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            Matriz Posicional
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Material</p>
            <p className="text-sm mt-1">{matriz_posicional.material}</p>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Seguridad Rey</p>
            <p className="text-sm mt-1">{matriz_posicional.rey}</p>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <p className="font-medium text-sm">Espacio</p>
            <p className="text-sm mt-1">{matriz_posicional.espacio}</p>
          </div>
        </CardContent>
      </Card>

      {/* Auditoría Conclusiones */}
      <Card className="border-amber-200 dark:border-amber-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-4 w-4" />
            Auditoría de Conclusiones
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
            <p className="font-medium text-sm">Evaluación del Error</p>
            <p className="text-sm mt-1">{auditoria_conclusiones.evaluacion_error}</p>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
            <p className="font-medium text-sm">Concepto a Reforzar</p>
            <p className="text-sm mt-1">{auditoria_conclusiones.concepto_reforzar}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}