"use client";

import { useGMConsultation } from "@/context/GMConsultationContext";
import { Loader2 } from "lucide-react";

export function GMActiveIndicator() {
  const { activeCount } = useGMConsultation();
  if (activeCount === 0) return null;
  return (
    <div className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>
        El GM está analizando {activeCount}{" "}
        {activeCount === 1 ? "consulta" : "consultas"}
      </span>
    </div>
  );
}
