"use client"

import { Button } from "@/components/ui/button"
import { Package, ShoppingCart, BarChart3, TrendingUp, Settings } from "lucide-react"

interface SidebarProps {
  activeView: string
  setActiveView: (view: string) => void
}

export default function Sidebar({ activeView, setActiveView }: SidebarProps) {
  const menuItems = [
    { id: "products", label: "Productos", icon: Package },
    { id: "sales", label: "Punto de Venta", icon: ShoppingCart },
    { id: "statistics", label: "Estadísticas", icon: TrendingUp },
    { id: "reports", label: "Reportes", icon: BarChart3 },
    { id: "settings", label: "Configuración", icon: Settings },
  ]

  return (
    <aside className="w-64 bg-card border-r border-border shadow-sm">
      <div className="p-6">
<div className="flex items-center gap-2 mb-8">
  <div className="w-10 h-10 flex items-center justify-center">
    <img
      src="/logo.png"
      alt="logo Siskoven"
      className="w-full h-full object-contain"
    />
  </div>
  <span className="text-xl font-bold text-primary">Siskoven</span>
</div>


        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                variant={activeView === item.id ? "default" : "ghost"}
                className="w-full justify-start gap-2"
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Button>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
