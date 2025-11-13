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
import { Menu, X } from "lucide-react"

export default function Dashboard() {
  const { user, logout, isTrialExpired } = useAuth()
  const [businessName, setBusinessName] = useState("Mi Comercio")
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isDesktopOpen, setIsDesktopOpen] = useState(true)
  const [activeView, setActiveView] = useState("products")
  // ✅ REINCORPORACIÓN DE ESTADOS PARA EL TRIAL
  const [userPlan, setUserPlan] = useState("")
  const [remainingDays, setRemainingDays] = useState<number | null>(null)


  useEffect(() => {
    if (user) {
      const fetchUserData = async () => {
        try {
          const userDoc = await getDoc(doc(db, "usuarios", user.uid))
          if (userDoc.exists()) {
            const data = userDoc.data()
            setBusinessName(data.businessName || "Mi Comercio")
            setUserPlan(data.plan || "")

            // ✅ LÓGICA DE CÁLCULO DE DÍAS RESTANTES
            if (data.plan === "trial" && data.trialEndsAt) {
              
              // Firebase Timestamp necesita toDate()
              const trialEndTimestamp = data.trialEndsAt.toDate().getTime()
              const now = new Date().getTime()
              const timeRemainingMs = trialEndTimestamp - now
              
              if (timeRemainingMs > 0) {
                // Math.ceil asegura que un tiempo parcial se cuente como un día completo
                const days = Math.ceil(timeRemainingMs / (1000 * 60 * 60 * 24))
                setRemainingDays(days)
              } else {
                setRemainingDays(0) // Prueba expirada o terminando
              }
            }
          }
        } catch (error) {
          console.error("Error fetching user data:", error)
        }
      }
      fetchUserData()
    }
  }, [user])

  return (
    <div className="flex min-h-screen bg-background">
      {/* 🛑 LÓGICA DE BLOQUEO: Si el trial ha expirado, SOLO renderiza el modal. */}
      {isTrialExpired ? (
        <TrialExpirationModal />
      ) : (
        <>
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
                  
                  {/* ⭐️ CORRECCIÓN MODO OSCURO: Estado de la prueba (Restante) */}
                  {userPlan === "trial" && remainingDays !== null && remainingDays > 0 && (
                    <p className="
                      text-sm font-semibold 
                      text-orange-600 dark:text-orange-300 
                      mt-1 p-1 
                      bg-yellow-100/50 dark:bg-yellow-900/30 
                      rounded-md inline-block
                    ">
                      Período de prueba: {remainingDays} {remainingDays === 1 ? 'día' : 'días'} restantes ⏳
                    </p>
                  )}
                  
                  {/* ⭐️ CORRECCIÓN MODO OSCURO: Estado de la prueba (Expirado) */}
                  {userPlan === "trial" && remainingDays === 0 && (
                    <p className="
                      text-sm font-semibold 
                      text-red-600 dark:text-red-300 
                      mt-1 p-1 
                      bg-red-100/50 dark:bg-red-900/30 
                      rounded-md inline-block
                    ">
                      Período de prueba finalizado. ¡Actualiza tu plan! 🛑
                    </p>
                  )}
                  
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
        </>
      )}
    </div>
  )
}