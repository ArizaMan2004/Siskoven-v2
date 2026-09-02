"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import LoginForm from "@/components/auth/login-form"

export default function EntrarPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  // Quien ya tiene sesión no debería ver el formulario de acceso.
  useEffect(() => {
    if (!loading && user) router.replace("/panel")
  }, [user, loading, router])

  if (loading || user) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="border-primary mx-auto mb-4 size-12 animate-spin rounded-full border-b-2" />
          <p className="text-muted-foreground">Cargando…</p>
        </div>
      </div>
    )
  }

  return <LoginForm />
}
