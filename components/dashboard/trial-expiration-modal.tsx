"use client"

import { useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle, Copy, Phone } from "lucide-react"
import { ADMIN_CONFIG } from "@/lib/admin-config"
import { useState } from "react"

export default function TrialExpirationModal() {
  const { isTrialExpired, userData, logout } = useAuth()
  const [copied, setCopied] = useState(false)

  if (!isTrialExpired || !userData || userData.plan !== "trial") {
    return null
  }

  const handleCopyPhone = () => {
    navigator.clipboard.writeText(ADMIN_CONFIG.phone)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <CardTitle>Período de Prueba Expirado</CardTitle>
          </div>
          <CardDescription>Tu prueba gratuita de 7 días ha terminado</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-foreground">
            Para continuar usando Venko, necesitas adquirir un código exclusivo de registro para acceder al plan
            permanente.
          </p>

          <div className="bg-primary/10 p-4 rounded-lg space-y-3">
            <p className="text-sm font-medium text-foreground">Contacta al administrador:</p>
            <div className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary" />
              <p className="text-lg font-bold text-primary">{ADMIN_CONFIG.phone}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Solicita tu código exclusivo y proporciona tu correo: <strong>{userData.email}</strong>
            </p>
          </div>

          <div className="space-y-2">
            <Button onClick={handleCopyPhone} className="w-full bg-primary hover:bg-primary/90 gap-2">
              <Copy className="w-4 h-4" />
              {copied ? "Copiado!" : "Copiar Número"}
            </Button>
            <Button onClick={() => logout()} variant="outline" className="w-full">
              Cerrar Sesión
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
