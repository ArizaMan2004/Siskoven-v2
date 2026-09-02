"use client"

import { type FormEvent, useState } from "react"
import Link from "next/link"
import { AnimatePresence, m } from "framer-motion"
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth"
import { doc, setDoc } from "firebase/firestore"
import { buscarInvitacion, marcarInvitacionAceptada } from "@/lib/team"
import { useGoogleReCaptcha } from "react-google-recaptcha-v3"
import { AlertCircle, ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2, MailCheck } from "lucide-react"
import { auth, db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AuthShell from "./auth-shell"
import { viewTransition } from "@/lib/motion"

const RUBROS = [
  "Bodega o abasto",
  "Ropa y calzado",
  "Restaurante o cafetería",
  "Electrónica",
  "Repuestos",
  "Ferretería",
  "Distribuidora",
  "Servicios",
  "Otro",
]

/** Prefijos de teléfono venezolanos. */
const PREFIJOS = ["0412", "0414", "0416", "0424", "0426", "0422"]

const SELECT_CLASS =
  "h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

interface RegisterWizardProps {
  onGoToLogin: () => void
}

/**
 * Alta en tres pasos.
 *
 * Un formulario largo asusta; tres pantallas cortas con su barra de progreso
 * se completan mucho más. Los datos se guardan de una sola vez al final: si
 * alguien abandona a mitad, no queda una cuenta huérfana sin negocio.
 */
export default function RegisterWizard({ onGoToLogin }: RegisterWizardProps) {
  const { executeRecaptcha } = useGoogleReCaptcha()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [verPassword, setVerPassword] = useState(false)

  // Paso 1
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [password2, setPassword2] = useState("")

  // Paso 2
  const [businessName, setBusinessName] = useState("")
  /** Si venía invitado, a qué negocio entró y con qué rol. Se enseña al final. */
  const [seUnioA, setSeUnioA] = useState<{ negocio: string; rol: string } | null>(null)
  const [rubro, setRubro] = useState(RUBROS[0])
  const [prefijo, setPrefijo] = useState(PREFIJOS[0])
  const [telefono, setTelefono] = useState("")

  const validarPaso1 = () => {
    if (!email.trim() || !email.includes("@")) return "Escribe un correo válido."
    if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres."
    if (password !== password2) return "Las dos contraseñas no coinciden."
    return ""
  }

  const siguiente = () => {
    const fallo = validarPaso1()
    if (fallo) {
      setError(fallo)
      return
    }
    setError("")
    setStep(2)
  }

  const crearCuenta = async (event: FormEvent) => {
    event.preventDefault()

    if (!businessName.trim()) {
      setError("Escribe el nombre de tu negocio.")
      return
    }

    setLoading(true)
    setError("")

    try {
      // reCAPTCHA. Si no llegó a cargar se deja pasar en vez de bloquear el
      // registro: perder un alta legítima es peor que dejar entrar un bot que
      // después tendrá que verificar el correo igualmente.
      if (executeRecaptcha) {
        const token = await executeRecaptcha("registro")
        const respuesta = await fetch("/api/verify-recaptcha", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
        const datos = await respuesta.json()
        if (datos?.success === false) {
          setError("No pudimos verificar que eres una persona. Vuelve a intentarlo.")
          setLoading(false)
          return
        }
      }

      const credenciales = await createUserWithEmailAndPassword(auth, email.trim(), password)
      await sendEmailVerification(credenciales.user)

      // La invitación se busca AQUÍ y no antes porque las reglas solo dejan
      // leerla a quien ya inició sesión con ese correo. Antes de crear la
      // cuenta, cualquiera podría listar a quién han invitado.
      const invitacion = await buscarInvitacion(email.trim())

      const comun = {
        email: email.trim(),
        telefono: telefono.trim() ? `${prefijo}${telefono.replace(/\D/g, "")}` : null,
        isActive: true,
        emailVerified: false,
        plan: "trial" as const,
        createdAt: new Date(),
      }

      if (invitacion) {
        // Se une al negocio que lo invitó, con los permisos que le pusieron.
        // El negocio, el rol y los permisos tienen que calcar la invitación:
        // las reglas lo comprueban documento contra documento.
        await setDoc(doc(db, "usuarios", credenciales.user.uid), {
          ...comun,
          businessName: invitacion.negocioNombre,
          negocioId: invitacion.negocioId,
          role: "staff",
          rolId: invitacion.rolId,
          rolNombre: invitacion.rolNombre,
          permisos: invitacion.permisos,
          invitacionId: invitacion.id,
        })

        // Se marca usada después del alta, no antes: si el alta fallara, la
        // invitación quedaría gastada y la persona no podría volver a intentarlo.
        await marcarInvitacionAceptada(invitacion.id, credenciales.user.uid)

        setSeUnioA({ negocio: invitacion.negocioNombre, rol: invitacion.rolNombre })
      } else {
        // Quien se registra sin invitación abre su propio negocio y es su dueño.
        // El plan SIEMPRE arranca en prueba: las reglas rechazan cualquier otra
        // cosa, porque ahí estaba el agujero de regalarse el plan completo.
        await setDoc(doc(db, "usuarios", credenciales.user.uid), {
          ...comun,
          businessName: businessName.trim(),
          rubro,
          negocioId: credenciales.user.uid,
          role: "owner",
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
      }

      // Se cierra la sesión para obligar a verificar el correo antes de entrar.
      await auth.signOut()
      setStep(3)
    } catch (err) {
      const codigo = (err as { code?: string })?.code
      setError(
        codigo === "auth/email-already-in-use"
          ? "Ese correo ya tiene una cuenta. Inicia sesión o usa otro."
          : codigo === "auth/weak-password"
            ? "La contraseña es demasiado débil."
            : codigo === "auth/invalid-email"
              ? "El correo no parece válido."
              : "No se pudo crear la cuenta. Vuelve a intentarlo.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell step={step} totalSteps={3} estimate="~2 min">
      <AnimatePresence mode="wait">
        {/* -------------------------------------------------------- paso 1 */}
        {step === 1 && (
          <m.div key="paso1" variants={viewTransition} initial="hidden" animate="visible" exit="exit">
            <h1 className="text-2xl font-semibold tracking-tight">Crea tu cuenta</h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Empezamos por tu acceso. Después van los datos del negocio.
            </p>

            <div className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">
                  Correo electrónico
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="tucorreo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                  autoFocus
                />
                <p className="text-muted-foreground text-xs">
                  Te mandaremos un correo para verificarlo. Usa uno al que tengas acceso.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium">
                  Contraseña
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={verPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Al menos 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-11"
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

              <div className="space-y-1.5">
                <label htmlFor="password2" className="text-sm font-medium">
                  Repite la contraseña
                </label>
                <Input
                  id="password2"
                  type={verPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && siguiente()}
                  className="h-11"
                />
              </div>
            </div>

            {error && (
              <p className="text-destructive mt-4 flex items-start gap-2 text-sm">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            <Button onClick={siguiente} className="mt-6 h-11 w-full gap-2">
              Siguiente
              <ArrowRight className="size-4" />
            </Button>

            <p className="text-muted-foreground mt-6 text-center text-sm">
              ¿Ya tienes cuenta?{" "}
              <button type="button" onClick={onGoToLogin} className="text-primary font-medium hover:underline">
                Inicia sesión
              </button>
            </p>
          </m.div>
        )}

        {/* -------------------------------------------------------- paso 2 */}
        {step === 2 && (
          <m.form
            key="paso2"
            onSubmit={crearCuenta}
            variants={viewTransition}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <h1 className="text-2xl font-semibold tracking-tight">Tu negocio</h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Con esto configuramos el sistema a tu medida. Todo se puede cambiar después.
            </p>

            <div className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="negocio" className="text-sm font-medium">
                  Nombre del negocio
                </label>
                <Input
                  id="negocio"
                  placeholder="Bodega La Esquina"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="h-11"
                  autoFocus
                />
                <p className="text-muted-foreground text-xs">
                  Es el que saldrá en tus recibos y notas de entrega. Si te invitaron a un negocio
                  que ya existe, pon lo que quieras: al crear la cuenta te uniremos a ese negocio y
                  este nombre se descarta.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="rubro" className="text-sm font-medium">
                  ¿A qué te dedicas?
                </label>
                <select
                  id="rubro"
                  className={`${SELECT_CLASS} w-full`}
                  value={rubro}
                  onChange={(e) => setRubro(e.target.value)}
                >
                  {RUBROS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="telefono" className="text-sm font-medium">
                  Teléfono <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <div className="flex gap-2">
                  <select
                    className={`${SELECT_CLASS} w-24 shrink-0`}
                    value={prefijo}
                    onChange={(e) => setPrefijo(e.target.value)}
                    aria-label="Prefijo"
                  >
                    {PREFIJOS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <Input
                    id="telefono"
                    type="tel"
                    inputMode="numeric"
                    placeholder="1234567"
                    maxLength={7}
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ""))}
                    className="h-11"
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  Solo para poder ayudarte si algo falla. No lo compartimos con nadie.
                </p>
              </div>
            </div>

            {error && (
              <p className="text-destructive mt-4 flex items-start gap-2 text-sm">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            <div className="mt-6 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError("")
                  setStep(1)
                }}
                disabled={loading}
                className="h-11 gap-2"
              >
                <ArrowLeft className="size-4" />
                Atrás
              </Button>
              <Button type="submit" disabled={loading} className="h-11 flex-1 gap-2">
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                {loading ? "Creando la cuenta…" : "Crear mi cuenta"}
              </Button>
            </div>

            <p className="text-muted-foreground mt-4 text-center text-xs">
              7 días de prueba. Sin tarjeta de crédito.
            </p>
          </m.form>
        )}

        {/* -------------------------------------------------------- paso 3 */}
        {step === 3 && (
          <m.div
            key="paso3"
            variants={viewTransition}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="text-center"
          >
            <div className="bg-success/15 mx-auto grid size-14 place-items-center rounded-full">
              <MailCheck className="text-success size-7" aria-hidden />
            </div>

            <h1 className="mt-5 text-2xl font-semibold tracking-tight">Revisa tu correo</h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Te enviamos un mensaje a <strong className="text-foreground">{email}</strong> para
              verificar la cuenta. Ábrelo y pulsa el enlace.
            </p>

            {/* Quien llegó invitado tiene que enterarse de a qué negocio entró y
                con qué rol: si no, la primera vez que abra el sistema no va a
                entender por qué le faltan pantallas. */}
            {seUnioA ? (
              <p className="bg-primary/10 text-primary mt-4 rounded-lg px-4 py-3 text-sm">
                Te uniste a <strong>{seUnioA.negocio}</strong> como{" "}
                <strong>{seUnioA.rol}</strong>. Al verificar el correo entrarás directo ahí.
              </p>
            ) : null}

            <div className="bg-muted/50 mt-6 rounded-lg p-4 text-left text-sm">
              <p className="font-medium">¿No te llegó?</p>
              <ul className="text-muted-foreground mt-2 space-y-1.5">
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Mira en la carpeta de correo no deseado.
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Puede tardar un par de minutos en llegar.
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Si te equivocaste de correo, vuelve a registrarte con el correcto.
                </li>
              </ul>
            </div>

            <Button onClick={onGoToLogin} className="mt-6 h-11 w-full">
              Ya lo verifiqué, entrar
            </Button>

            <p className="text-muted-foreground mt-4 text-xs">
              <Link href="/" className="hover:underline">
                Volver al inicio
              </Link>
            </p>
          </m.div>
        )}
      </AnimatePresence>
    </AuthShell>
  )
}
