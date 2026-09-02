"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import Dashboard from "@/components/dashboard/dashboard"

export default function PanelPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  // Sin sesión no hay panel. La comprobación de verdad la hacen las reglas de
  // Firestore; esto solo evita enseñar una pantalla vacía.
  useEffect(() => {
    if (!loading && !user) router.replace("/entrar")
  }, [user, loading, router])

  if (loading || !user) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="border-primary mx-auto mb-4 size-12 animate-spin rounded-full border-b-2" />
          <p className="text-muted-foreground">Cargando…</p>
        </div>
      </div>
    )
  }

  return <Dashboard />
}
