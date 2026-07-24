"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils" 
import { Trophy, Brain, Target, User, LogOut } from "lucide-react"

const menuOptions = [
  { name: "Mis Partidas", href: "/partidas", icon: Trophy },
  { name: "Coach IA", href: "/coach", icon: Brain },
  { name: "Entrenamiento", href: "/entrenamiento", icon: Target },
  { name: "Mi Perfil", href: "/perfil", icon: User },
]

export function Sidebar() {
  const pathname = usePathname()

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
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon
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
              <Icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
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