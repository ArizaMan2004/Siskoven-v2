"use client"

import { useAuth } from "@/lib/auth-context"
import LoginForm from "@/components/auth/login-form"
import Dashboard from "@/components/dashboard/dashboard"

export default function Home() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    )
  }

  // ✅ Ya no necesitamos RecaptchaProviderWrapper aquí.
  return user ? <Dashboard /> : <LoginForm />
}
