"use client"

import { type FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import {
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react"
import { auth, db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { hasAccess } from "@/lib/subscriptions"
import AuthShell from "./auth-shell"

interface LoginPanelProps {
  onGoToRegister: () => void
}

export default function LoginPanel({ onGoToRegister }: LoginPanelProps) {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [verPassword, setVerPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [aviso, setAviso] = useState("")
  /** Se ofrece reenviar la verificación solo cuando ese es el problema. */
  const [sinVerificar, setSinVerificar] = useState(false)

  const entrar = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError("")
    setAviso("")
    setSinVerificar(false)

    try {
      const credenciales = await signInWithEmailAndPassword(auth, email.trim(), password)
      await credenciales.user.reload()

      if (!credenciales.user.emailVerified) {
        setError("Tu cuenta todavía no está verificada. Revisa tu correo, incluida la carpeta de spam.")
        setSinVerificar(true)
        setLoading(false)
        return
      }

      // El acceso depende del vencimiento real: prueba o suscripción. Se
      // comprueba aquí para dar un mensaje claro, pero quien de verdad lo
      // impone son las reglas de Firestore.
      const documento = await getDoc(doc(db, "usuarios", credenciales.user.uid))
      if (documento.exists() && !hasAccess(documento.data())) {
        await auth.signOut()
        setError(
          "Tu acceso venció. Contacta al administrador para renovar. Tus datos siguen guardados: no se ha borrado nada.",
        )
        setLoading(false)
        return
      }

      router.replace("/panel")
    } catch (err) {
      const codigo = (err as { code?: string })?.code
      setError(
        codigo === "auth/too-many-requests"
          ? "Demasiados intentos seguidos. Espera unos minutos."
          : codigo === "auth/user-disabled"
            ? "Esta cuenta está desactivada. Contacta al administrador."
            : "Correo o contraseña incorrectos.",
      )
      setLoading(false)
    }
  }

  const reenviarVerificacion = async () => {
    if (!auth.currentUser) {
      setError("Vuelve a intentar iniciar sesión para poder reenviarte el correo.")
      return
    }

    setLoading(true)
    try {
      await sendEmailVerification(auth.currentUser)
      setError("")
      setSinVerificar(false)
      setAviso("Te enviamos otro correo de verificación. Revisa tu bandeja y el spam.")
    } catch {
      setError("No se pudo reenviar el correo. Inténtalo en unos minutos.")
    } finally {
      setLoading(false)
    }
  }

  const recuperarPassword = async () => {
    if (!email.trim()) {
      setError("Escribe tu correo arriba y vuelve a pulsar aquí.")
      return
    }

    setLoading(true)
    setError("")
    try {
      await sendPasswordResetEmail(auth, email.trim())
    } catch {
      // Da igual si el correo existe o no: se responde lo mismo. Decir "ese
      // correo no está registrado" le confirma a un desconocido qué cuentas
      // existen en el sistema.
    } finally {
      setAviso(`Si ${email.trim()} tiene una cuenta, le llegará un enlace para cambiar la contraseña.`)
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight">Bienvenido de vuelta</h1>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Entra para administrar tu inventario, tus ventas y tu caja.
      </p>

      <form onSubmit={entrar} className="mt-7 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="login-email" className="text-sm font-medium">
            Correo electrónico
          </label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="tucorreo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
            required
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="login-password" className="text-sm font-medium">
            Contraseña
          </label>
          <div className="relative">
            <Input
              id="login-password"
              type={verPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pr-11"
              required
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setVerPassword((v) => !v)}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
              aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {verPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={recuperarPassword}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Olvidé mi contraseña
          </button>
        </div>

        {error && (
          <div className="text-destructive flex items-start gap-2 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p>{error}</p>
              {sinVerificar && (
                <button
                  type="button"
                  onClick={reenviarVerificacion}
                  className="mt-1 font-medium underline underline-offset-2"
                >
                  Reenviar el correo de verificación
                </button>
              )}
            </div>
          </div>
        )}

        {aviso && (
          <p className="text-success flex items-start gap-2 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            {aviso}
          </p>
        )}

        <Button type="submit" disabled={loading} className="h-11 w-full gap-2">
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {loading ? "Entrando…" : "Iniciar sesión"}
        </Button>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        ¿Nuevo en Siskoven?{" "}
        <button type="button" onClick={onGoToRegister} className="text-primary font-medium hover:underline">
          Crea tu cuenta gratis
        </button>
      </p>
    </AuthShell>
  )
}
