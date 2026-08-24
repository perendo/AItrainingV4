import { GMConsultationProvider } from "@/context/GMConsultationContext"
import { DashboardShell } from "@/components/DashboardShell"

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
      <DashboardShell>{children}</DashboardShell>
    </GMConsultationProvider>
  )
}
