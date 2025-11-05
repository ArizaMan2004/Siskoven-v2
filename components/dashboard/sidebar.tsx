"use client"

import { Button } from "@/components/ui/button"
import { Package, ShoppingCart, BarChart3, TrendingUp } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

interface SidebarProps {
  activeView: string
  setActiveView: (view: string) => void
  isMobileOpen: boolean
  setIsMobileOpen: (isOpen: boolean) => void
  isDesktopOpen: boolean
  setIsDesktopOpen: (isOpen: boolean) => void
}

export default function Sidebar({
  activeView,
  setActiveView,
  isMobileOpen,
  setIsMobileOpen,
  isDesktopOpen,
  setIsDesktopOpen,
}: SidebarProps) {
  const menuItems = [
    { id: "products", label: "Productos", icon: Package },
    { id: "sales", label: "Punto de Venta", icon: ShoppingCart },
    { id: "statistics", label: "Estadísticas", icon: TrendingUp },
    { id: "reports", label: "Reportes", icon: BarChart3 },
  ]

  const sidebarClasses = `
    w-64 bg-card border-r border-border shadow-sm z-50 transition-transform duration-300
    
    fixed inset-y-0 left-0 h-full transform 
    ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
    
    lg:fixed lg:inset-y-0 lg:left-0 lg:h-full lg:w-64 lg:transform lg:transition-transform lg:duration-300
    ${isDesktopOpen ? "lg:translate-x-0" : "lg:-translate-x-full"}
  `

  return (
    <aside className={sidebarClasses}>
      <div className="p-6 flex flex-col h-full">
        {/* Header con logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 flex items-center justify-center">
            <img src="/logo.png" alt="logo Siskoven" className="w-full h-full object-contain" />
          </div>
          <span className="text-xl font-bold text-primary">Siskoven</span>
        </div>

        {/* Navegación */}
        <nav className="space-y-2 flex-1">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.id}
                onClick={() => {
                  setActiveView(item.id)
                  setIsMobileOpen(false)
                }}
                variant={activeView === item.id ? "default" : "ghost"}
                className="w-full justify-start gap-2"
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Button>
            )
          })}
        </nav>

        <div className="pt-6 border-t border-border flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Tema</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}
