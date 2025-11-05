"use client"

import { Button } from "@/components/ui/button"
import { Package, ShoppingCart, BarChart3, TrendingUp, Settings } from "lucide-react"

interface SidebarProps {
  activeView: string
  setActiveView: (view: string) => void
  // ⭐️ CORRECCIÓN: Nuevas propiedades para control de estado móvil
  isMobileOpen: boolean 
  setIsMobileOpen: (isOpen: boolean) => void
}

export default function Sidebar({ activeView, setActiveView, isMobileOpen, setIsMobileOpen }: SidebarProps) {
  const menuItems = [
    { id: "products", label: "Productos", icon: Package },
    { id: "sales", label: "Punto de Venta", icon: ShoppingCart },
    { id: "statistics", label: "Estadísticas", icon: TrendingUp },
    { id: "reports", label: "Reportes", icon: BarChart3 },
  ]

  // ⭐️ CORRECCIÓN: Clases para deslizar y ocultar/mostrar
  const sidebarClasses = `
    w-64 bg-card border-r border-border shadow-sm z-50 transition-transform duration-300
    
    // LÓGICA MÓVIL (Drawer): Fijo, ocupa todo el alto, y se desliza
    fixed inset-y-0 left-0 h-full transform 
    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} // Controla la visibilidad
    
    // LÓGICA ESCRITORIO (a partir de lg): Relativo, siempre visible, sin traslación
    lg:relative lg:translate-x-0 lg:block lg:w-64
  `;

  return (
    <aside className={sidebarClasses}>
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
                onClick={() => {
                    setActiveView(item.id);
                    // ⭐️ CORRECCIÓN: Cierra el sidebar después de hacer clic en móvil
                    setIsMobileOpen(false); 
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
      </div>
    </aside>
  )
}