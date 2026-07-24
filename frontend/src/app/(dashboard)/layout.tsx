import { Sidebar } from "@/components/ui/Sidebar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Pintamos el menú que está suelto en components */}
      <Sidebar />

      {/* Desplazamos todo el contenido 64 unidades a la derecha para no taparlo con el menú */}
      <div className="pl-64">
        <header className="flex h-16 items-center justify-between border-b bg-white px-8 dark:bg-slate-900" />
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  )
}