"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore"
import { AnimatePresence, m } from "framer-motion"
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  Search,
  Users,
  Wallet,
} from "lucide-react"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { useSuperAdmin } from "@/hooks/use-super-admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatCard } from "@/components/ui/stat-card"
import { EmptyState, PageHeader } from "@/components/ui/page-header"
import { formatMoney } from "@/lib/pricing"
import { listItem, popIn, staggerContainer } from "@/lib/motion"
import {
  type AccountState,
  type AccountSummary,
  PAID_PLANS,
  PAYMENT_METHOD_LABELS,
  PLANS,
  type PaymentMethod,
  type PlanId,
  STATE_LABELS,
  nextExpiry,
  toAccountSummary,
} from "@/lib/subscriptions"

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const STATE_STYLES: Record<AccountState, string> = {
  prueba: "bg-secondary text-secondary-foreground",
  activa: "bg-success/15 text-success",
  por_vencer: "bg-warning/20 text-warning-foreground dark:text-warning",
  vencida: "bg-destructive/15 text-destructive",
  desactivada: "bg-muted text-muted-foreground",
}

const FILTERS: Array<{ id: "todas" | AccountState; label: string }> = [
  { id: "todas", label: "Todas" },
  { id: "prueba", label: "En prueba" },
  { id: "por_vencer", label: "Por vencer" },
  { id: "vencida", label: "Vencidas" },
  { id: "activa", label: "Al día" },
  { id: "desactivada", label: "Desactivadas" },
]

function formatDate(date: Date | null): string {
  if (!date) return "sin fecha"
  return date.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })
}

/**
 * Panel de administración del SaaS.
 *
 * Está montado sobre confirmación MANUAL de pagos, no sobre una pasarela:
 * Stripe no opera en Venezuela, así que el dinero entra por Zelle, Binance o
 * pago móvil y aquí se registra a mano. Registrar un pago escribe un recibo
 * inmutable y empuja la fecha de vencimiento de la cuenta.
 */
export default function AdminPage() {
  const { user } = useAuth()
  const { isSuperAdmin, loading: checkingAccess } = useSuperAdmin()

  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"todas" | AccountState>("todas")
  const [working, setWorking] = useState(false)

  // Diálogo de cobro
  const [charging, setCharging] = useState<AccountSummary | null>(null)
  const [plan, setPlan] = useState<PlanId>("mensual")
  const [monto, setMonto] = useState("")
  const [metodo, setMetodo] = useState<PaymentMethod>("zelle")
  const [referencia, setReferencia] = useState("")
  const [notas, setNotas] = useState("")

  const cargar = useCallback(async () => {
    if (!isSuperAdmin) return
    setLoading(true)

    try {
      // Solo los dueños: los cajeros y encargados no tienen suscripción propia,
      // dependen de la de su negocio.
      const snapshot = await getDocs(query(collection(db, "usuarios"), where("role", "==", "owner")))
      const lista = snapshot.docs.map((document) => toAccountSummary(document.id, document.data()))

      // Lo urgente primero: vencidas, luego por vencer, luego el resto.
      const prioridad: Record<AccountState, number> = {
        vencida: 0,
        por_vencer: 1,
        prueba: 2,
        activa: 3,
        desactivada: 4,
      }
      lista.sort(
        (a, b) =>
          prioridad[a.estado] - prioridad[b.estado] ||
          (a.diasRestantes ?? 9999) - (b.diasRestantes ?? 9999),
      )

      setAccounts(lista)
    } catch (error) {
      console.error("Error cargando las cuentas:", error)
    } finally {
      setLoading(false)
    }
  }, [isSuperAdmin])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const abrirCobro = (cuenta: AccountSummary) => {
    setCharging(cuenta)
    setPlan("mensual")
    setMonto(String(PLANS.mensual.price))
    setMetodo("zelle")
    setReferencia("")
    setNotas("")
  }

  const registrarPago = async () => {
    if (!charging || !user) return

    const montoUsd = Number.parseFloat(monto)
    if (!Number.isFinite(montoUsd) || montoUsd <= 0) {
      alert("Escribe el monto que recibiste.")
      return
    }
    if (!referencia.trim()) {
      alert("Escribe la referencia del pago. Sin ella no hay forma de rastrearlo después.")
      return
    }

    setWorking(true)
    try {
      // Si la cuenta sigue vigente, el tiempo se suma a lo que le queda: quien
      // renueva antes de tiempo no pierde los días que ya pagó.
      const vigenteHasta = nextExpiry(charging.vence, plan)

      await addDoc(collection(db, "pagos"), {
        uid: charging.uid,
        negocioId: charging.uid,
        businessName: charging.businessName,
        email: charging.email,
        plan,
        montoUsd,
        metodo,
        referencia: referencia.trim(),
        notas: notas.trim() || null,
        vigenteHasta: Timestamp.fromDate(vigenteHasta),
        registradoPor: user.uid,
        createdAt: Timestamp.now(),
      })

      await updateDoc(doc(db, "usuarios", charging.uid), {
        plan,
        subscriptionEndsAt: Timestamp.fromDate(vigenteHasta),
        isActive: true,
      })

      setCharging(null)
      await cargar()
      alert(`Pago registrado. La cuenta queda activa hasta el ${formatDate(vigenteHasta)}.`)
    } catch (error) {
      console.error("Error registrando el pago:", error)
      alert("No se pudo registrar el pago.")
    } finally {
      setWorking(false)
    }
  }

  const alternarActiva = async (cuenta: AccountSummary) => {
    const desactivar = cuenta.isActive
    const mensaje = desactivar
      ? `¿Desactivar la cuenta de ${cuenta.businessName}? No podrá entrar hasta que la reactives. Sus datos se conservan.`
      : `¿Reactivar la cuenta de ${cuenta.businessName}?`

    if (!confirm(mensaje)) return

    setWorking(true)
    try {
      await updateDoc(doc(db, "usuarios", cuenta.uid), { isActive: !cuenta.isActive })
      await cargar()
    } catch (error) {
      console.error("Error cambiando el estado de la cuenta:", error)
      alert("No se pudo cambiar el estado de la cuenta.")
    } finally {
      setWorking(false)
    }
  }

  const extenderPrueba = async (cuenta: AccountSummary) => {
    if (!confirm(`¿Dar 7 días más de prueba a ${cuenta.businessName}?`)) return

    setWorking(true)
    try {
      const nueva = nextExpiry(cuenta.vence, "trial")
      await updateDoc(doc(db, "usuarios", cuenta.uid), {
        subscriptionEndsAt: Timestamp.fromDate(nueva),
        isActive: true,
      })
      await cargar()
    } catch (error) {
      console.error("Error extendiendo la prueba:", error)
      alert("No se pudo extender la prueba.")
    } finally {
      setWorking(false)
    }
  }

  const visibles = useMemo(() => {
    const termino = search.trim().toLowerCase()
    return accounts.filter((cuenta) => {
      if (filter !== "todas" && cuenta.estado !== filter) return false
      if (!termino) return true
      return (
        cuenta.businessName.toLowerCase().includes(termino) ||
        cuenta.email.toLowerCase().includes(termino)
      )
    })
  }, [accounts, search, filter])

  const resumen = useMemo(() => {
    const activas = accounts.filter((c) => c.estado === "activa" || c.estado === "por_vencer")
    // Ingreso recurrente mensual: cada plan aporta su precio repartido en meses.
    const mrr = activas.reduce((sum, cuenta) => sum + (PLANS[cuenta.plan]?.perMonth ?? 0), 0)

    return {
      total: accounts.length,
      enPrueba: accounts.filter((c) => c.estado === "prueba").length,
      porVencer: accounts.filter((c) => c.estado === "por_vencer").length,
      vencidas: accounts.filter((c) => c.estado === "vencida").length,
      mrr,
    }
  }, [accounts])

  // ------------------------------------------------------------------ acceso
  if (checkingAccess) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center gap-2">
        <Loader2 className="size-5 animate-spin" />
        Comprobando permisos…
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="space-y-2 pt-6 text-center">
            <AlertTriangle className="text-muted-foreground mx-auto size-8" />
            <p className="font-semibold">Esta página no es para tu cuenta</p>
            <p className="text-muted-foreground text-sm">
              El panel de administración es solo para quien administra Siskoven.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="Administración"
          description="Cuentas, suscripciones y pagos de Siskoven"
          actions={
            <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={loading}>
              <RotateCcw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          }
        />

        <m.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        >
          <m.div custom={0} variants={listItem}>
            <StatCard label="Cuentas" value={String(resumen.total)} icon={Users} />
          </m.div>
          <m.div custom={1} variants={listItem}>
            <StatCard
              label="Ingreso mensual"
              value={formatMoney(resumen.mrr)}
              hint="Suma de los planes al día"
              icon={Wallet}
            />
          </m.div>
          <m.div custom={2} variants={listItem}>
            <StatCard label="Por vencer" value={String(resumen.porVencer)} hint="Próximos 5 días" icon={Clock} />
          </m.div>
          <m.div custom={3} variants={listItem}>
            <StatCard label="Vencidas" value={String(resumen.vencidas)} hint={`${resumen.enPrueba} en prueba`} icon={AlertTriangle} />
          </m.div>
        </m.div>

        {/* Filtros */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Buscar por negocio o correo…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={filter === option.id ? "default" : "outline"}
                onClick={() => setFilter(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Listado */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {visibles.length} {visibles.length === 1 ? "cuenta" : "cuentas"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 py-10">
                <Loader2 className="size-4 animate-spin" />
                Cargando cuentas…
              </div>
            ) : visibles.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No hay cuentas que coincidan"
                description="Prueba con otro filtro o limpia la búsqueda."
              />
            ) : (
              <ul className="divide-border divide-y">
                {visibles.map((cuenta) => (
                  <li key={cuenta.uid} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{cuenta.businessName}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_STYLES[cuenta.estado]}`}
                        >
                          {STATE_LABELS[cuenta.estado]}
                        </span>
                      </div>
                      <p className="text-muted-foreground truncate text-sm">{cuenta.email}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {PLANS[cuenta.plan]?.label ?? cuenta.plan} · vence {formatDate(cuenta.vence)}
                        {cuenta.diasRestantes !== null &&
                          (cuenta.diasRestantes >= 0
                            ? ` · quedan ${cuenta.diasRestantes} ${cuenta.diasRestantes === 1 ? "día" : "días"}`
                            : ` · venció hace ${Math.abs(cuenta.diasRestantes)} ${Math.abs(cuenta.diasRestantes) === 1 ? "día" : "días"}`)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <Button size="sm" onClick={() => abrirCobro(cuenta)} disabled={working}>
                        Registrar pago
                      </Button>
                      {cuenta.plan === "trial" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void extenderPrueba(cuenta)}
                          disabled={working}
                        >
                          +7 días
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void alternarActiva(cuenta)}
                        disabled={working}
                        className={cuenta.isActive ? "text-destructive" : "text-success"}
                        aria-label={cuenta.isActive ? "Desactivar cuenta" : "Reactivar cuenta"}
                      >
                        {cuenta.isActive ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------ registrar pago */}
      <AnimatePresence>
        {charging && (
          <m.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !working && setCharging(null)}
          >
            <m.div
              variants={popIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bg-card max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border p-5 shadow-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-lg font-semibold">Registrar pago</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {charging.businessName} · {charging.email}
              </p>

              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="plan" className="text-sm font-medium">Plan</label>
                  <select
                    id="plan"
                    className={SELECT_CLASS}
                    value={plan}
                    onChange={(event) => {
                      const elegido = event.target.value as PlanId
                      setPlan(elegido)
                      // Se propone el precio de lista, pero se deja editar: a
                      // veces se cobra distinto por una promoción o un ajuste.
                      setMonto(String(PLANS[elegido].price))
                    }}
                  >
                    {PAID_PLANS.map((id) => (
                      <option key={id} value={id}>
                        {PLANS[id].label} — ${PLANS[id].price} (${PLANS[id].perMonth}/mes)
                      </option>
                    ))}
                  </select>
                  <p className="text-muted-foreground text-xs">{PLANS[plan].description}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="monto" className="text-sm font-medium">Monto recibido ($)</label>
                    <Input
                      id="monto"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={monto}
                      onChange={(event) => setMonto(event.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="metodo" className="text-sm font-medium">Método</label>
                    <select
                      id="metodo"
                      className={SELECT_CLASS}
                      value={metodo}
                      onChange={(event) => setMetodo(event.target.value as PaymentMethod)}
                    >
                      {Object.entries(PAYMENT_METHOD_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="referencia" className="text-sm font-medium">Referencia</label>
                  <Input
                    id="referencia"
                    placeholder="Número de la transacción"
                    value={referencia}
                    onChange={(event) => setReferencia(event.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Obligatoria: es lo único que permite rastrear el pago si mañana hay un reclamo.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="notas" className="text-sm font-medium">Notas (opcional)</label>
                  <Input
                    id="notas"
                    value={notas}
                    onChange={(event) => setNotas(event.target.value)}
                  />
                </div>

                <div className="bg-muted/50 rounded-md p-3 text-sm">
                  La cuenta quedará activa hasta el{" "}
                  <strong>{formatDate(nextExpiry(charging.vence, plan))}</strong>.
                  {charging.vence && charging.vence > new Date() && (
                    <span className="text-muted-foreground">
                      {" "}
                      Se suman los días que aún le quedaban.
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCharging(null)}
                  disabled={working}
                >
                  Cancelar
                </Button>
                <Button className="flex-1 gap-2" onClick={registrarPago} disabled={working}>
                  {working ? <Loader2 className="size-4 animate-spin" /> : null}
                  Registrar
                </Button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
