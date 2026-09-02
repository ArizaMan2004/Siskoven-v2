"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import { doc, getDoc } from "firebase/firestore"
import { LogOut } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import Sidebar from "./sidebar"
import BottomNav from "./bottom-nav"
import RateWidget from "./rate-widget"
import ProductsView from "./products-view"
import SalesView from "./sales-view"
import StatisticsView from "./statistics-view"
import ReportsView from "./reports-view"
import CalculatorView from "./CalculatorView"
import CashView from "./cash-view"
import AccountsView from "./accounts-view"
import TrialExpirationModal from "./trial-expiration-modal"
import SyncBanner from "@/components/sync-banner"
import { DEFAULT_VIEW, navItemsFor } from "./navigation"
import { ROLE_LABELS } from "@/lib/roles"
import { viewTransition } from "@/lib/motion"

/** Días completos que quedan de prueba, o null si no aplica. */
function remainingTrialDays(trialEndsAt: unknown): number | null {
  const raw = trialEndsAt as { toDate?: () => Date } | null | undefined
  if (!raw) return null

  const end = typeof raw.toDate === "function" ? raw.toDate() : new Date(raw as unknown as string)
  if (Number.isNaN(end.getTime())) return null

  const msLeft = end.getTime() - Date.now()
  return msLeft > 0 ? Math.ceil(msLeft / (1000 * 60 * 60 * 24)) : 0
}

export default function Dashboard() {
  const { user, logout, isTrialExpired, role } = useAuth()
  const [businessName, setBusinessName] = useState("Mi Comercio")
  const [activeView, setActiveView] = useState(DEFAULT_VIEW)
  const [userPlan, setUserPlan] = useState("")
  const [remainingDays, setRemainingDays] = useState<number | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const fetchUserData = async () => {
      try {
        const userDoc = await getDoc(doc(db, "usuarios", user.uid))
        if (cancelled || !userDoc.exists()) return

        const data = userDoc.data()
        setBusinessName(data.businessName || "Mi Comercio")
        setUserPlan(data.plan || "")

        if (data.plan === "trial") {
          setRemainingDays(remainingTrialDays(data.trialEndsAt))
        }
      } catch (error) {
        console.error("Error fetching user data:", error)
      }
    }

    void fetchUserData()
    return () => {
      cancelled = true
    }
  }, [user])

  // Prueba vencida: se bloquea la app entera y solo queda el aviso.
  if (isTrialExpired) {
    return (
      <div className="bg-background min-h-screen">
        <TrialExpirationModal />
      </div>
    )
  }

  const navItems = navItemsFor(role)
  const activeItem = navItems.find((item) => item.id === activeView)
  const showTrialBanner = userPlan === "trial" && remainingDays !== null

  // Si el rol no alcanza para el módulo abierto (por ejemplo, tras un cambio de
  // permisos), se cae al primero disponible en vez de dejar el panel vacío.
  const resolvedView = activeItem ? activeView : (navItems[0]?.id ?? DEFAULT_VIEW)

  return (
    <div className="bg-background min-h-screen">
      <Sidebar
        items={navItems}
        activeView={resolvedView}
        setActiveView={setActiveView}
        businessName={businessName}
        userEmail={user?.email}
        roleLabel={role ? ROLE_LABELS[role] : null}
        onLogout={logout}
      />

      {/* El margen izquierdo solo existe donde existe la barra lateral. */}
      <div className="flex min-h-screen flex-col lg:ml-64">
        <header className="bg-card/95 sticky top-0 z-20 border-b backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold sm:text-lg">{businessName}</h1>
              {/* En móvil, el nombre del módulo activo hace de migas de pan;
                  en escritorio ya lo dice la barra lateral. */}
              <p className="text-muted-foreground truncate text-xs lg:hidden">{activeItem?.label}</p>
              <p className="text-muted-foreground hidden truncate text-xs lg:block">{user?.email}</p>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              {/* La tasa vigente siempre visible: es el dato que más se consulta. */}
              <RateWidget compact className="hidden sm:flex" />
              <div className="lg:hidden">
                <ThemeToggle />
              </div>
              <Button
                onClick={logout}
                variant="ghost"
                size="icon"
                className="text-muted-foreground lg:hidden"
                aria-label="Cerrar sesión"
              >
                <LogOut className="size-5" />
              </Button>
            </div>
          </div>

          {showTrialBanner ? (
            <div
              className={
                remainingDays === 0
                  ? "bg-destructive/10 text-destructive px-4 py-2 text-center text-xs font-medium sm:px-6"
                  : "bg-warning/15 text-warning-foreground dark:text-warning px-4 py-2 text-center text-xs font-medium sm:px-6"
              }
            >
              {remainingDays === 0
                ? "Tu período de prueba terminó. Contacta al administrador para seguir usando el sistema."
                : `Período de prueba: quedan ${remainingDays} ${remainingDays === 1 ? "día" : "días"}.`}
            </div>
          ) : null}

          {/* Solo aparece cuando algo va mal con la sincronización. */}
          <SyncBanner />
        </header>

        {/* pb-nav deja hueco para la barra inferior del móvil. */}
        <main className="flex-1 px-4 py-4 pb-nav sm:px-6 sm:py-6 lg:pb-6">
          {/* La tasa, que en pantallas pequeñas no cabe en la cabecera. */}
          <RateWidget compact className="mb-4 sm:hidden" />

          {/*
            mode="wait" para que el módulo saliente termine antes de que entre
            el siguiente: si se solapan, dos vistas pesadas se renderizan a la
            vez y el cambio se siente lento justo en el momento que más se nota.
          */}
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={resolvedView}
              variants={viewTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {resolvedView === "sales" && <SalesView />}
              {resolvedView === "cash" && <CashView />}
              {resolvedView === "cuentas" && <AccountsView />}
              {resolvedView === "products" && <ProductsView />}
              {resolvedView === "statistics" && <StatisticsView />}
              {resolvedView === "reports" && <ReportsView />}
              {resolvedView === "calculator" && <CalculatorView />}
            </m.div>
          </AnimatePresence>
        </main>
      </div>

      <BottomNav items={navItems} activeView={resolvedView} setActiveView={setActiveView} />
    </div>
  )
}
