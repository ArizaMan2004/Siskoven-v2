"use client"

import { useAuth } from "@/lib/auth-context"
import { useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import Sidebar from "./sidebar"
// ******************************************************************
// ⭐️ CORRECCIÓN 1: Asegurando que se importen las vistas correctas
// Asumo que están en la misma carpeta que el Dashboard:
import ProductsView from "./products-view" 
import SalesView from "./sales-view"
import StatisticsView from "./statistics-view"
import ReportsView from "./reports-view"
// ******************************************************************
import TrialExpirationModal from "./trial-expiration-modal"
import { Menu, X } from "lucide-react"

export default function Dashboard() {
  const { user, logout, isTrialExpired } = useAuth()
  const [businessName, setBusinessName] = useState("Mi Comercio")
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isDesktopOpen, setIsDesktopOpen] = useState(true)
  const [activeView, setActiveView] = useState("products")

  useEffect(() => {
    if (user) {
      const fetchBusinessName = async () => {
        try {
          const userDoc = await getDoc(doc(db, "usuarios", user.uid))
          if (userDoc.exists()) {
            setBusinessName(userDoc.data().businessName || "Mi Comercio")
          }
        } catch (error) {
          console.error("Error fetching business name:", error)
        }
      }
      fetchBusinessName()
    }
  }, [user])

  return (
    <div className="flex min-h-screen bg-background">
      {isTrialExpired && <TrialExpirationModal />}

      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        isDesktopOpen={isDesktopOpen}
        setIsDesktopOpen={setIsDesktopOpen}
      />

      {isMobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setIsMobileOpen(false)} />
      )}

      <div
        className={`flex-1 flex flex-col w-full transition-all duration-300 ${isDesktopOpen ? "lg:ml-64" : "lg:ml-0"}`}
      >
        <header className="border-b border-border bg-card shadow-sm">
          <div className="flex items-center justify-between px-6 py-4">
            <Button variant="ghost" size="icon" className="lg:hidden mr-4" onClick={() => setIsMobileOpen(true)}>
              <Menu className="w-6 h-6" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex"
              onClick={() => setIsDesktopOpen(!isDesktopOpen)}
            >
              {isDesktopOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
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
          {/* *************************************************************** */}
          {/* ⭐️ CORRECCIÓN 2: Renderizar el componente real en lugar del mensaje "Próximamente" */}
          {activeView === "sales" && <SalesView />}
          {activeView === "statistics" && <StatisticsView />}
          {activeView === "reports" && <ReportsView />}
          {/* *************************************************************** */}
        </main>
      </div>
    </div>
  )
}