"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Chess } from "chess.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Crown,
  UserRound,
  Database,
  Search,
  Loader2,
  Upload,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FileText,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { searchGmGames, listMyGames } from "@/lib/api";
import { GMGameResponse, GameResponse, GeminiFeedback } from "@/lib/types";
import { ReplayBoard } from "./ReplayBoard";
import { AnalysisFormPanel, GeminiFeedbackDisplay } from "./AnalysisFormPanel";
import { InteractiveDemo } from "./InteractiveDemo";

type Mode = "GM" | "USER" | "DB";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function OwnGameAnalysisView() {
  const [mode, setMode] = useState<Mode>("GM");
  const [showDemo, setShowDemo] = useState(false);
  const searchParams = useSearchParams();

  // Desde el menú "Cómo analizar una partida" se abre la demo automáticamente.
  useEffect(() => {
    if (searchParams.get("leccion")) setShowDemo(true);
  }, [searchParams]);

  // GM mode state
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GMGameResponse[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedGmGame, setSelectedGmGame] = useState<GMGameResponse | null>(null);

  // USER mode state
  const [whitePlayer, setWhitePlayer] = useState("");
  const [blackPlayer, setBlackPlayer] = useState("");
  const [pgnText, setPgnText] = useState("");
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [loadedPgn, setLoadedPgn] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // DB mode state (partidas propias ya guardadas en la BD)
  const [dbGames, setDbGames] = useState<GameResponse[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [selectedDbGame, setSelectedDbGame] = useState<GameResponse | null>(null);

  // Informe del GM emitido por el panel, para renderizarlo al final de la página.
  const [feedback, setFeedback] = useState<GeminiFeedback | null>(null);
  const handleFeedback = useCallback(
    (f: GeminiFeedback | null) => setFeedback(f),
    [],
  );

  const loadDbGames = async () => {
    setDbLoading(true);
    setDbError(null);
    try {
      const games = await listMyGames();
      setDbGames(games);
    } catch (err) {
      setDbError(err instanceof Error ? err.message : "Error al cargar tus partidas guardadas.");
    } finally {
      setDbLoading(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setFeedback(null);
    setPgnError(null);
    setSearchError(null);
    setDbError(null);
    if (m === "DB" && dbGames.length === 0) {
      loadDbGames();
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSelectedGmGame(null);
    try {
      const results = await searchGmGames(searchTerm.trim());
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError("No se encontraron partidas de GM. Prueba con otro nombre.");
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Error al buscar partidas GM.");
    } finally {
      setSearching(false);
    }
  };

  const handleSelectDbGame = (game: GameResponse) => {
    setSelectedDbGame(game);
  };

  const handleLoadPgn = () => {
    if (!pgnText.trim()) {
      setPgnError("Pega un PGN o carga un archivo.");
      setLoadedPgn(null);
      return;
    }
    try {
      const game = new Chess();
      game.loadPgn(pgnText);
      setPgnError(null);
      setLoadedPgn(pgnText);
    } catch {
      setPgnError("El PGN no es válido. Revisa el formato e inténtalo de nuevo.");
      setLoadedPgn(null);
    }
  };

  const handleFileUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      setPgnText(content);
      try {
        const game = new Chess();
        game.loadPgn(content);
        setPgnError(null);
        setLoadedPgn(content);
      } catch {
        setPgnError("El PGN del archivo no es válido.");
        setLoadedPgn(null);
      }
    };
    reader.readAsText(file);
  };

  const gameLoaded =
    mode === "GM" ? selectedGmGame : mode === "DB" ? selectedDbGame : loadedPgn;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Análisis de Partidas
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Elige una partida de un Gran Maestro, selecciona una de tus partidas ya
            guardadas o analiza una de tus partidas de liga/torneo pegando el PGN.
          </p>
        </div>
          <Button
            onClick={() => setShowDemo(true)}
            className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow-sm shrink-0"
          >
            <Sparkles className="h-4 w-4" />
            Cómo analizar una partida
          </Button>
      </div>

      {showDemo ? (
        <InteractiveDemo onClose={() => setShowDemo(false)} />
      ) : (
        <>
          {/* Selector de tipo de partida */}
      <div className="flex w-full flex-col sm:flex-row gap-2 rounded-xl border bg-card p-1.5">
        <button
          type="button"
          onClick={() => switchMode("GM")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            mode === "GM"
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Crown className="h-4 w-4" />
          Partida de GM
        </button>
        <button
          type="button"
          onClick={() => switchMode("USER")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            mode === "USER"
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <UserRound className="h-4 w-4" />
          Mi Partida / Liga
        </button>
        <button
          type="button"
          onClick={() => switchMode("DB")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            mode === "DB"
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Database className="h-4 w-4" />
          Mis partidas guardadas
        </button>
      </div>

      {mode === "GM" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Buscar partida de Gran Maestro</CardTitle>
            <CardDescription>
              Busca por nombre del GM (ej: Capablanca, Fischer, Morphy).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Nombre del Gran Maestro..."
              />
              <Button onClick={handleSearch} disabled={searching} className="shrink-0">
                {searching ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Buscar
              </Button>
            </div>

            {searchError && (
              <p className="text-sm text-destructive">{searchError}</p>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((game) => (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => setSelectedGmGame(game)}
                    className={cn(
                      "flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                      selectedGmGame?.id === game.id && "border-primary bg-primary/5"
                    )}
                  >
                    <div>
                      <p className="font-medium">
                        {game.white} vs {game.black}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {game.event} · {game.year} · {game.result} · GM: {game.gm_name}
                      </p>
                    </div>
                    <CheckCircle2
                      className={cn(
                        "h-4 w-4",
                        selectedGmGame?.id === game.id ? "text-primary" : "text-muted-foreground/30"
                      )}
                    />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mode === "USER" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mi Partida / Liga</CardTitle>
            <CardDescription>
              Introduce los nombres de los jugadores y pega el PGN de tu partida
              (o cárgalo desde un archivo local).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="white_player" className="block text-sm font-medium mb-1">
                  Jugador de Blancas
                </Label>
                <Input
                  id="white_player"
                  value={whitePlayer}
                  onChange={(e) => setWhitePlayer(e.target.value)}
                  placeholder="Nombre de las Blancas..."
                />
              </div>
              <div>
                <Label htmlFor="black_player" className="block text-sm font-medium mb-1">
                  Jugador de Negras
                </Label>
                <Input
                  id="black_player"
                  value={blackPlayer}
                  onChange={(e) => setBlackPlayer(e.target.value)}
                  placeholder="Nombre de las Negras..."
                />
              </div>
            </div>

            <div>
              <Label htmlFor="pgn_paste" className="block text-sm font-medium mb-1">
                PGN de la partida
              </Label>
              <Textarea
                id="pgn_paste"
                value={pgnText}
                onChange={(e) => setPgnText(e.target.value)}
                placeholder={`[Event "Liga Local"]\n[White "Tu Nombre"]\n[Black "Rival"]\n\n1. e4 e5 2. Nf3 Nc6 ...`}
                rows={8}
                className="font-mono text-xs"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleLoadPgn} className="flex-1">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Cargar PGN en el Tablero
              </Button>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Cargar archivo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pgn,.txt"
                className="hidden"
                onChange={(e) => {
                  handleFileUpload(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </div>

            {pgnError && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="h-4 w-4" />
                {pgnError}
              </p>
            )}
            {loadedPgn && !pgnError && (
              <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                PGN válido — listo para analizar.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {mode === "DB" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg">Mis partidas guardadas</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={loadDbGames}
                disabled={dbLoading}
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", dbLoading && "animate-spin")} />
                Refrescar
              </Button>
            </div>
            <CardDescription>
              Selecciona una de tus partidas ya analizadas con Stockfish (tabla
              &quot;games&quot;) para cargar su PGN directamente en el tablero.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dbLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Cargando tus partidas...
              </div>
            ) : dbError ? (
              <p className="text-sm text-destructive">{dbError}</p>
            ) : dbGames.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                Aún no tienes partidas guardadas. Súbelas desde &quot;Mis Partidas&quot;.
              </div>
            ) : (
              <div className="space-y-2">
                {dbGames.map((game) => (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => handleSelectDbGame(game)}
                    className={cn(
                      "flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                      selectedDbGame?.id === game.id && "border-primary bg-primary/5"
                    )}
                  >
                    <div>
                      <p className="font-medium">
                        {game.white_player} vs {game.black_player}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(game.created_at)} · Resultado: {game.result || "—"} ·
                        Tu color: {game.player_color || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                        {game.errors.length} errores
                      </span>
                      <CheckCircle2
                        className={cn(
                          "h-4 w-4",
                          selectedDbGame?.id === game.id
                            ? "text-primary"
                            : "text-muted-foreground/30"
                        )}
                      />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {gameLoaded && mode === "GM" && selectedGmGame && (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-[55%]">
            <ReplayBoard pgn={selectedGmGame.pgn} />
          </div>
          <div className="w-full lg:w-[45%]">
            <AnalysisFormPanel
              gameType="GM"
              gmGameId={selectedGmGame.id}
              pgn={selectedGmGame.pgn}
              whitePlayer={selectedGmGame.white}
              blackPlayer={selectedGmGame.black}
              hideFeedback
              onFeedbackChange={handleFeedback}
            />
          </div>
        </div>
      )}

      {gameLoaded && mode === "USER" && loadedPgn && (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-[55%]">
            <ReplayBoard pgn={loadedPgn} />
          </div>
          <div className="w-full lg:w-[45%]">
            <AnalysisFormPanel
              gameType="USER"
              pgn={loadedPgn}
              whitePlayer={whitePlayer.trim() || "Blancas"}
              blackPlayer={blackPlayer.trim() || "Negras"}
              hideFeedback
              onFeedbackChange={handleFeedback}
            />
          </div>
        </div>
      )}

      {gameLoaded && mode === "DB" && selectedDbGame && (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-[55%]">
            <ReplayBoard pgn={selectedDbGame.pgn_content} />
          </div>
          <div className="w-full lg:w-[45%]">
            <AnalysisFormPanel
              gameType="USER"
              pgn={selectedDbGame.pgn_content}
              whitePlayer={selectedDbGame.white_player || "Blancas"}
              blackPlayer={selectedDbGame.black_player || "Negras"}
              hideFeedback
              onFeedbackChange={handleFeedback}
            />
          </div>
        </div>
      )}

      {/* Informe del GM: siempre al final, a todo ancho */}
      {gameLoaded && feedback && (
        <div className="space-y-4">
          <Separator />
          <h2 className="text-xl font-semibold text-primary">
            Informe del Gran Maestro
          </h2>
          <GeminiFeedbackDisplay feedback={feedback} />
        </div>
      )}
        </>
      )}
    </div>
  );
}
