"use client"

import { useAuth } from "@/lib/auth-context"
import { useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import Sidebar from "./sidebar"
import ProductsView from "./products-view"
import SalesView from "./sales-view"
import StatisticsView from "./statistics-view"
import ReportsView from "./reports-view"
import TrialExpirationModal from "./trial-expiration-modal"
import { Menu } from "lucide-react" // ⭐️ CORRECCIÓN: Icono de menú

export default function Dashboard() {
  const { user, logout, isTrialExpired } = useAuth()
  const [businessName, setBusinessName] = useState("Mi Comercio")
  const [activeView, setActiveView] = useState("products")
  
  // ⭐️ CORRECCIÓN: Estado clave para el sidebar móvil
  const [isMobileOpen, setIsMobileOpen] = useState(false) 

  useEffect(() => {
    if (user) {
      const fetchBusinessName = async () => {
        const userDoc = await getDoc(doc(db, "usuarios", user.uid))
        if (userDoc.exists()) {
          setBusinessName(userDoc.data().businessName || "Mi Comercio")
        }
      }
      fetchBusinessName()
    }
  }, [user])

  return (
    // 💡 Ajuste de altura a min-h-screen
    <div className="flex min-h-screen bg-background"> 
      {isTrialExpired && <TrialExpirationModal />}

      {/* 1. SIDEBAR: Pásale el nuevo estado y setter */}
      <Sidebar 
        activeView={activeView} 
        setActiveView={setActiveView} 
        isMobileOpen={isMobileOpen} // Propiedad nueva
        setIsMobileOpen={setIsMobileOpen} // Propiedad nueva
      />
      
      {/* 2. OVERLAY: Fondo oscuro cuando el sidebar está abierto en móvil */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* 3. CONTENIDO PRINCIPAL: Clase lg:ml-64 para el margen en escritorio */}
      <div className="flex-1 flex flex-col w-full **lg:ml-64** transition-all duration-300">
        
        <header className="border-b border-border bg-card shadow-sm">
          <div className="flex items-center justify-between px-6 py-4">
            
            {/* 4. BOTÓN DE HAMBURGUESA: Visible solo en móvil */}
            <Button
                variant="ghost"
                size="icon"
                className="**lg:hidden mr-4**" // Se oculta en lg (escritorio)
                onClick={() => setIsMobileOpen(true)}
            >
                <Menu className="w-6 h-6" />
            </Button>
            
            <div>
              <h1 className="text-2xl font-bold text-foreground">{businessName}</h1>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
            
            <Button
              onClick={logout}
              variant="outline"
              className="text-destructive hover:bg-destructive/10 bg-transparent"
            >
              Cerrar Sesión
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          {activeView === "products" && <ProductsView />}
          {activeView === "sales" && <SalesView />}
          {activeView === "statistics" && <StatisticsView />}
          {activeView === "reports" && <ReportsView />}
        </main>
      </div>
    </div>
  )
}