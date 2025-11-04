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

export default function Dashboard() {
  const { user, logout, isTrialExpired } = useAuth()
  const [businessName, setBusinessName] = useState("Mi Comercio")
  const [activeView, setActiveView] = useState("products")

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
    <div className="flex h-screen bg-background">
      {isTrialExpired && <TrialExpirationModal />}

      <Sidebar activeView={activeView} setActiveView={setActiveView} />

      <div className="flex-1 flex flex-col">
        <header className="border-b border-border bg-card shadow-sm">
          <div className="flex items-center justify-between px-6 py-4">
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
