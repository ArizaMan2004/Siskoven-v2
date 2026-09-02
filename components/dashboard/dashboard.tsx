"use client"

import { useEffect, useState } from "react"
import { m } from "framer-motion"
import { doc, getDoc } from "firebase/firestore"
import { LogOut } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import Sidebar from "./sidebar"
import BottomNav from "./bottom-nav"
import RateWidget from "./rate-widget"
import HelpButton from "./help-button"
import HomeView from "./home-view"
import ProductsView from "./products-view"
import SalesView from "./sales-view"
import CustomersView from "./customers-view"
import SummaryView from "./summary-view"
import StatisticsView from "./statistics-view"
import ReportsView from "./reports-view"
import CalculatorView from "./CalculatorView"
import CashView from "./cash-view"
import AccountsView from "./accounts-view"
import ExpensesView from "./expenses-view"
import TeamView from "./team-view"
import TrialExpirationModal from "./trial-expiration-modal"
import SyncBanner from "@/components/sync-banner"
import { DEFAULT_VIEW, navGroupsFor, navItemsFor, navSplitMovil } from "./navigation"
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
  const { user, logout, isTrialExpired, role, rolNombre, permisos } = useAuth()
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

  // El menú se arma con la lista de permisos, no con el rol: desde que los roles
  // los crea el dueño, el rol solo dice si esta persona es el dueño.
  const navItems = navItemsFor(permisos)
  const grupos = navGroupsFor(permisos)
  const { fijos, extra } = navSplitMovil(permisos)
  const activeItem = navItems.find((item) => item.id === activeView)
  const showTrialBanner = userPlan === "trial" && remainingDays !== null

  // Si los permisos no alcanzan para el módulo abierto (por ejemplo, porque el
  // dueño acaba de recortar el rol), se cae al primero disponible en vez de
  // dejar el panel en blanco.
  const resolvedView = activeItem ? activeView : (navItems[0]?.id ?? DEFAULT_VIEW)

  // El dueño se anuncia siempre como "Dueño"; los demás, con el nombre que su
  // rol tenga puesto, que es el que van a reconocer.
  const etiquetaRol =
    role === "owner" ? ROLE_LABELS.owner : rolNombre || (role ? ROLE_LABELS[role] : null)

  return (
    <div className="bg-background min-h-screen">
      <Sidebar
        grupos={grupos}
        activeView={resolvedView}
        setActiveView={setActiveView}
        businessName={businessName}
        userEmail={user?.email}
        roleLabel={etiquetaRol}
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
              <p className="text-muted-foreground hidden truncate text-xs lg:block">
                {user?.email}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              {/* La tasa vigente siempre visible: es el dato que más se consulta. */}
              <RateWidget compact className="hidden sm:flex" />

              {/* La ayuda de la pantalla que se esté mirando. Va aquí y no
                  flotando porque abajo a la derecha vive el distintivo de
                  reCAPTCHA, que Google obliga a mostrar. */}
              <HelpButton vista={resolvedView} />

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
        <main className="pb-nav flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:pb-6">
          {/* La tasa, que en pantallas pequeñas no cabe en la cabecera. */}
          <RateWidget compact className="mb-4 sm:hidden" />

          {/* El módulo cambia remontando por `key`, no con AnimatePresence.
              Ver la nota de lib/motion.ts: con mode="wait" el panel se quedaba
              congelado en el primer módulo que abrieras. */}
          <div key={resolvedView}>
            <m.div variants={viewTransition} initial="hidden" animate="visible">
              {resolvedView === "home" && <HomeView irA={setActiveView} />}
              {resolvedView === "sales" && <SalesView />}
              {resolvedView === "cash" && <CashView />}
              {resolvedView === "clientes" && <CustomersView />}
              {resolvedView === "cuentas" && <AccountsView />}
              {resolvedView === "gastos" && <ExpensesView />}
              {resolvedView === "products" && <ProductsView />}
              {resolvedView === "resumen" && <SummaryView />}
              {resolvedView === "statistics" && <StatisticsView />}
              {resolvedView === "reports" && <ReportsView />}
              {resolvedView === "equipo" && <TeamView />}
              {resolvedView === "calculator" && <CalculatorView />}
            </m.div>
          </div>
        </main>
      </div>

      <BottomNav
        fijos={fijos}
        extra={extra}
        activeView={resolvedView}
        setActiveView={setActiveView}
      />
    </div>
  )
}
