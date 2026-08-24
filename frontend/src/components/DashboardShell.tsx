"use client"

import { useCallback, useState } from "react"
import { Menu } from "lucide-react"
import { Sidebar } from "@/components/ui/Sidebar"
import { GMActiveIndicator } from "@/components/GMActiveIndicator"

/**
 * Capa cliente del layout del dashboard: gestiona el estado del menú lateral
 * en móvil (drawer superpuesto) y el encabezado con botón de hamburguesa.
 *
 * - Móvil (<lg): el sidebar está oculto por defecto (-translate-x-full) y se
 *   abre como drawer superpuesto (position fixed, z-index alto) con fondo
 *   oscuro semitransparente; NO empuja el contenido.
 * - Escritorio (>=lg): sidebar estático en su sitio y hamburguesa oculta,
 *   comportamiento idéntico al anterior (contenido con pl-64).
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const cerrarMenu = useCallback(() => setMenuAbierto(false), [])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background">
      {/* Fondo oscuro semitransparente detrás del drawer; tocar fuera cierra. */}
      {menuAbierto && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={cerrarMenu}
          aria-hidden="true"
        />
      )}

      <Sidebar abierto={menuAbierto} onCerrar={cerrarMenu} />

      {/* En móvil el contenido ocupa el 100% del ancho (sin padding lateral);
          el hueco del sidebar solo existe desde lg. */}
      <div className="lg:pl-64 print:pl-0">
        <header className="flex h-16 items-center gap-4 border-b bg-white px-4 dark:bg-card print:hidden sm:px-8">
          <button
            type="button"
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú de navegación"
            aria-expanded={menuAbierto}
            className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="ml-auto">
            <GMActiveIndicator />
          </div>
        </header>
        <main className="p-4 print:p-0 sm:p-8">{children}</main>
      </div>
    </div>
  )
}
