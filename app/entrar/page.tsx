"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import LoginPanel from "@/components/auth/login-panel"
import RegisterWizard from "@/components/auth/register-wizard"

function Cargando() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="border-primary mx-auto mb-4 size-12 animate-spin rounded-full border-b-2" />
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    </div>
  )
}

function Entrar() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  // La portada enlaza a /entrar?registro=1 para abrir directamente el alta.
  const [modo, setModo] = useState<"login" | "registro">(
    searchParams.get("registro") ? "registro" : "login",
  )

  useEffect(() => {
    if (!loading && user) router.replace("/panel")
  }, [user, loading, router])

  if (loading || user) return <Cargando />

  return modo === "registro" ? (
    <RegisterWizard onGoToLogin={() => setModo("login")} />
  ) : (
    <LoginPanel onGoToRegister={() => setModo("registro")} />
  )
}

export default function EntrarPage() {
  // useSearchParams obliga a un límite de Suspense en el App Router.
  return (
    <Suspense fallback={<Cargando />}>
      <Entrar />
    </Suspense>
  )
}
