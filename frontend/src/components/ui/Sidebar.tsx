"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils" 
import { Trophy, Brain, Target, User, LogOut, History, Gamepad2, ClipboardList, MessageCircleQuestion, Crown, DoorOpen } from "lucide-react"
import { useGMConsultation } from "@/context/GMConsultationContext"
import { exitToDesktop } from "@/lib/kiosk"

const menuOptions = [
  { name: "Mis Partidas", href: "/partidas", icon: Trophy },
  { name: "Analizar Partida", href: "/analisis", icon: ClipboardList },
  { name: "Jugar 1 contra 1", href: "/jugar", icon: Gamepad2 },
  { name: "Histórico de análisis", href: "/historico", icon: History },
  { name: "Coach IA", href: "/coach", icon: Brain },
  { name: "Entrenamiento", href: "/entrenamiento", icon: Target },
  { name: "Academia de Finales", href: "/entrenamiento/finales", icon: Crown },
  { name: "Consultar al GM", href: "/consulta-gm", icon: MessageCircleQuestion },
  { name: "Mi Perfil", href: "/perfil", icon: User },
]

export function Sidebar() {
  const pathname = usePathname()
  const { activeCount } = useGMConsultation()

  const handleLogout = () => {
    localStorage.removeItem("access_token")
    window.location.href = "/login"
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex h-full w-64 flex-col border-r bg-slate-900 text-slate-200">
      <div className="flex h-16 items-center px-6 border-b border-slate-800">
        <Link href="/partidas" className="flex items-center gap-2 font-bold text-xl text-white">
          <Brain className="h-6 w-6 text-blue-400" />
          <span>EntrenadorIA</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-4">
        {menuOptions.map((item) => {
          const isActive =
            item.href === "/entrenamiento"
              ? pathname.startsWith("/entrenamiento") && !pathname.startsWith("/entrenamiento/finales")
              : pathname.startsWith(item.href)
          const Icon = item.icon
          const showBadge = item.href === "/consulta-gm" && activeCount > 0
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive 
                  ? "bg-slate-800 text-white border-l-4 border-blue-500 rounded-l-none" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              )}
            >
              <span className="relative flex items-center">
                <Icon className="h-5 w-5" />
                {showBadge && (
                  <span className="absolute -right-2 -top-2 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
                  </span>
                )}
              </span>
              <span className="flex-1">{item.name}</span>
              {showBadge && (
                <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-slate-900">
                  {activeCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-1">
        <button
          onClick={() => exitToDesktop()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
        >
          <DoorOpen className="h-5 w-5" />
          <span>Salir al escritorio</span>
        </button>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-red-950/40 hover:text-red-400 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  )
}