"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, BookMarked, Play, ShieldHalf } from "lucide-react";
import { cn } from "@/lib/utils";
import { GUIDED_OPENINGS, GuidedOpening } from "@/lib/openings";

export type UserColorChoice = "w" | "b";

interface OpeningSetupProps {
  onStart: (opening: GuidedOpening, color: UserColorChoice) => void;
}

const COLOR_OPTIONS: { value: UserColorChoice; label: string; icon: typeof Crown }[] = [
  { value: "w", label: "Blancas", icon: Crown },
  { value: "b", label: "Negras", icon: ShieldHalf },
];

export function OpeningSetup({ onStart }: OpeningSetupProps) {
  const [color, setColor] = useState<UserColorChoice | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const selectedOpening = useMemo(
    () => GUIDED_OPENINGS.find((o) => o.id === openingId) ?? null,
    [openingId],
  );

  const canStart = color !== null && selectedOpening !== null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-5">
        {/* Elección de color */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Play className="h-5 w-5 text-primary" />
              Elige tu color
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {COLOR_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setColor(opt.value)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border-2 px-4 py-3 text-left transition-colors",
                    color === opt.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/40 hover:bg-muted/50",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon
                      className={cn(
                        "h-6 w-6",
                        color === opt.value ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="font-semibold">{opt.label}</span>
                  </span>
                  {color === opt.value && (
                    <Badge variant="secondary">Elegido</Badge>
                  )}
                </button>
              );
            })}
            <p className="pt-1 text-xs text-muted-foreground">
              Si te toca jugar al libro, moverá automáticamente con su jugada principal de la
              teoría.
            </p>
            <p className="pt-1 text-xs text-muted-foreground">
              Una vez terminado podrás volverlo a consultar en tu histórico de análisis.
            </p>
          </CardContent>
        </Card>

        {/* Elección de apertura */}
        <Card className="md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookMarked className="h-5 w-5 text-primary" />
              Elige la apertura a estudiar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {GUIDED_OPENINGS.map((opening) => {
                const isSelected = opening.id === openingId;
                return (
                  <button
                    key={opening.id}
                    type="button"
                    onClick={() => setOpeningId(opening.id)}
                    className={cn(
                      "rounded-lg border-2 p-3 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/40 hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold leading-tight">{opening.name}</span>
                      <Badge variant={isSelected ? "default" : "secondary"} className="shrink-0">
                        {opening.eco}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{opening.description}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button
          size="lg"
          className="gap-2 px-8"
          disabled={!canStart}
          onClick={() => {
            if (canStart) onStart(selectedOpening, color);
          }}
        >
          <Play className="h-5 w-5" />
          Comenzar Partida Guiada
        </Button>
      </div>
    </div>
  );
}