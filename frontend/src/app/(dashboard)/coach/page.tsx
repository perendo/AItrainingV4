"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { apiFetch, ApiError } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Brain, Award, AlertTriangle, Lightbulb, RefreshCw, FileText, Loader2, Download } from "lucide-react"
import type { CoachReportResponse } from "@/lib/types"

// Helper para parsear campos que pueden venir como Array o como String JSON desde SQLite
function parseJsonOrArray(data: string[] | string | undefined | null): string[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data)
      if (Array.isArray(parsed)) return parsed
    } catch {
      return [data]
    }
  }
  return []
}

// Helper para formatear negritas (**texto**) sin usar HTML peligroso
function parseFormattedText(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return part
  })
}

// Componente para renderizar el informe en Markdown completo con listas y negritas
function MarkdownRenderer({ content }: { content: string }) {
  if (!content) {
    return <p className="text-sm text-slate-500">Sin informe disponible.</p>
  }

  const blocks = content.split("\n\n")

  return (
    <div className="space-y-4 text-slate-700 dark:text-slate-300 leading-relaxed text-sm">
      {blocks.map((block, idx) => {
        const trimmed = block.trim()

        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={idx} className="text-lg font-bold text-slate-900 dark:text-white pt-2 border-b border-slate-100 dark:border-slate-800 pb-1">
              {parseFormattedText(trimmed.replace(/^###\s*/, ""))}
            </h3>
          )
        }

        if (trimmed.startsWith("#### ")) {
          return (
            <h4 key={idx} className="text-md font-semibold text-blue-600 dark:text-blue-400 pt-1">
              {parseFormattedText(trimmed.replace(/^####\s*/, ""))}
            </h4>
          )
        }

        if (trimmed.startsWith("---")) {
          return <hr key={idx} className="my-4 border-slate-200 dark:border-slate-800" />
        }

        // Listas viñetas (* o -)
        if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
          const items = trimmed.split("\n")
          return (
            <ul key={idx} className="list-disc list-inside space-y-1.5 pl-2">
              {items.map((item, itemIdx) => (
                <li key={itemIdx}>
                  {parseFormattedText(item.replace(/^[\*\-]\s*/, ""))}
                </li>
              ))}
            </ul>
          )
        }

        // Listas numeradas (1. 2. 3.)
        if (/^\d+\.\s/.test(trimmed)) {
          const items = trimmed.split("\n")
          return (
            <ol key={idx} className="list-decimal list-inside space-y-2 pl-2">
              {items.map((item, itemIdx) => (
                <li key={itemIdx} className="leading-normal">
                  {parseFormattedText(item.replace(/^\d+\.\s*/, ""))}
                </li>
              ))}
            </ol>
          )
        }

        return (
          <p key={idx} className="whitespace-pre-line">
            {parseFormattedText(trimmed)}
          </p>
        )
      })}
    </div>
  )
}

export default function CoachPage() {
  const [reports, setReports] = useState<CoachReportResponse[]>([])
  const [selected, setSelected] = useState<CoachReportResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [generating, setGenerating] = useState<boolean>(false)
  const [exporting, setExporting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const reportRef = useRef<HTMLDivElement | null>(null)

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiFetch<CoachReportResponse[]>("/api/v1/coach/history")
      setReports(data)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) return
      setError("No se pudieron cargar los informes")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  useEffect(() => {
    if (reports.length > 0 && !selected) {
      setSelected(reports[0])
    }
  }, [reports, selected])

  const generate = async () => {
    try {
      setGenerating(true)
      setError(null)
      await apiFetch<CoachReportResponse>("/api/v1/coach/diagnostic", {
        method: "POST",
      })
      const data = await apiFetch<CoachReportResponse[]>("/api/v1/coach/history")
      setReports(data)
      if (data.length > 0) setSelected(data[0])
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError("Error al generar el diagnóstico")
      }
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  // --- DESCARGAR PDF CON MARCA DE AGUA ---
  const handleDownloadPDF = async () => {
    if (!reportRef.current || !selected) return

    try {
      setExporting(true)

      const html2canvas = (await import("html2canvas")).default
      const { jsPDF } = await import("jspdf")

      const element = reportRef.current

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        ignoreElements: (el: Element) => el.tagName === "BUTTON",
      })

      // Marca de agua AITRAINING CHESS
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.save()
        ctx.font = "bold 45px sans-serif"
        ctx.fillStyle = "rgba(148, 163, 184, 0.15)"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"

        const stepX = 450
        const stepY = 300
        for (let x = 0; x < canvas.width + 500; x += stepX) {
          for (let y = 0; y < canvas.height + 500; y += stepY) {
            ctx.save()
            ctx.translate(x, y)
            ctx.rotate((-35 * Math.PI) / 180)
            ctx.fillText("AITRAINING CHESS", 0, 0)
            ctx.restore()
          }
        }
        ctx.restore()
      }

      const imgData = canvas.toDataURL("image/png")
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      const imgWidth = 210
      const pageHeight = 297
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      const dateStr = new Date(selected.created_at).toISOString().split("T")[0]
      pdf.save(`AITRAINING_CHESS_Informe_${dateStr}.pdf`)
    } catch (err: unknown) {
      console.error("Error al exportar PDF:", err)
      setError("No se pudo exportar el informe a PDF")
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-slate-500 text-sm font-medium">
          Cargando diagnósticos del Coach...
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Brain className="h-8 w-8 text-blue-500" />
            Diagnóstico del Coach IA
          </h1>
          <p className="text-slate-500 mt-1">
            Análisis personalizado de tu patrón de juego basado en las
            evaluaciones de Gemini.
          </p>
        </div>
        <Button onClick={generate} disabled={generating} className="gap-2">
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          {generating ? "Generando..." : "Generar diagnóstico"}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {reports.length === 0 || !selected ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <Brain className="h-12 w-12 mx-auto text-slate-300" />
            <p className="text-slate-600 font-medium">
              Aún no hay diagnósticos disponibles.
            </p>
            <p className="text-sm text-slate-400">
              Sube tus primeras partidas en el historial y luego presiona
              &quot;Generar diagnóstico&quot; para que el Coach pueda evaluarte.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          <aside className="md:col-span-1 space-y-2">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
              Historial
            </h2>
            <div className="space-y-1">
              {reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selected?.id === r.id
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "hover:bg-slate-50 text-slate-600"
                  }`}
                >
                  <div className="font-medium truncate">
                    {r.estimated_level || "Intermedio"}
                  </div>
                  <div className="text-xs text-slate-400">
                    {new Date(r.created_at).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <div className="md:col-span-3 space-y-6">
            {(() => {
              // Parseo correcto de los campos de la base de datos
              const strengthsList = parseJsonOrArray(selected.strengths)
              const weaknessesList = parseJsonOrArray(selected.weaknesses)
              const reportText = selected.report_markdown || (selected as unknown as { report_text?: string }).report_text || ""

              return (
                <>
                  <Card className="border-l-4 border-l-blue-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-slate-500">
                        Nivel / Elo Estimado
                      </CardTitle>
                      <Award className="h-5 w-5 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-slate-900 dark:text-white">
                        {selected.estimated_level || "Intermedio (~1400)"}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Calculado sobre tu historial reciente de partidas
                      </p>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="border-l-4 border-l-emerald-500">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">
                          Puntos Fuertes
                        </CardTitle>
                        <Lightbulb className="h-5 w-5 text-emerald-500" />
                      </CardHeader>
                      <CardContent>
                        <ul className="text-sm space-y-2 text-slate-700 dark:text-slate-300">
                          {strengthsList.map((s, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-amber-500">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">
                          Áreas de Mejora
                        </CardTitle>
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                      </CardHeader>
                      <CardContent>
                        <ul className="text-sm space-y-2 text-slate-700 dark:text-slate-300">
                          {weaknessesList.map((w, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                              <span>{w}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </div>

                  <Card ref={reportRef} className="bg-white text-slate-900">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle>Informe Estratégico Completo</CardTitle>
                        <CardDescription>
                          Reporte generado por Gemini el{" "}
                          {new Date(selected.created_at).toLocaleDateString(
                            "es-ES",
                            {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </CardDescription>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadPDF}
                        disabled={exporting}
                        className="gap-2"
                      >
                        {exporting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        {exporting ? "Exportando..." : "Descargar PDF"}
                      </Button>
                    </CardHeader>

                    <CardContent className="pt-4">
                      <MarkdownRenderer content={reportText} />
                    </CardContent>
                  </Card>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}