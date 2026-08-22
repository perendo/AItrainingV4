import { Sidebar } from "@/components/ui/Sidebar"
import { GMActiveIndicator } from "@/components/GMActiveIndicator"
import { GMConsultationProvider } from "@/context/GMConsultationContext"

// Estas páginas requieren autenticación y estado en cliente; se renderizan
// dinámicamente (no en tiempo de build) para evitar errores de prerender.
export const dynamic = "force-dynamic"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <GMConsultationProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-background">
        <Sidebar />

        <div className="pl-64 print:pl-0">
          <header className="flex h-16 items-center justify-end gap-4 border-b bg-white px-8 dark:bg-card print:hidden">
            <GMActiveIndicator />
          </header>
          <main className="p-8 print:p-0">{children}</main>
        </div>
      </div>
    </GMConsultationProvider>
  )
}
