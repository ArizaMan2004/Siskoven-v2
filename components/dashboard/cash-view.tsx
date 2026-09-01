"use client"

import { useCallback, useEffect, useState } from "react"
import { collection, getDocs, query, where } from "firebase/firestore"
import { AnimatePresence, m } from "framer-motion"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Lock,
  LockOpen,
  Receipt,
  Wallet,
} from "lucide-react"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { useRates } from "@/hooks/use-rates"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatCard } from "@/components/ui/stat-card"
import { EmptyState, PageHeader } from "@/components/ui/page-header"
import { formatBs, formatMoney } from "@/lib/pricing"
import { reportFirestoreError } from "@/lib/sync-status"
import { listItem, popIn, staggerContainer } from "@/lib/motion"
import {
  BS_METHODS,
  METHOD_LABELS,
  type MovimientoCaja,
  MOTIVOS_ENTRADA,
  MOTIVOS_SALIDA,
  type ResumenTurno,
  type Turno,
  USD_METHODS,
  abrirTurno,
  cerrarTurno,
  getMovimientos,
  getTurnoAbierto,
  isUsdMethod,
  registrarMovimiento,
  resumirTurno,
} from "@/lib/cash-service"

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const ALL_METHODS = [...USD_METHODS, ...BS_METHODS]

/** Formatea un importe en la moneda que corresponde al método. */
function formatByMethod(method: string, amount: number): string {
  return isUsdMethod(method) ? formatMoney(amount) : formatBs(amount)
}

export default function CashView() {
  const { user, userData, negocioId, allows } = useAuth()
  const { rate } = useRates()

  const [turno, setTurno] = useState<Turno | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([])
  const [resumen, setResumen] = useState<ResumenTurno | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)

  // Apertura
  const [fondoUsd, setFondoUsd] = useState("")
  const [fondoBs, setFondoBs] = useState("")

  // Movimiento
  const [showMovimiento, setShowMovimiento] = useState<"entrada" | "salida" | null>(null)
  const [movMetodo, setMovMetodo] = useState<string>("cash")
  const [movMonto, setMovMonto] = useState("")
  const [movMotivo, setMovMotivo] = useState(MOTIVOS_SALIDA[0])

  // Cierre
  const [showCierre, setShowCierre] = useState(false)
  const [conteo, setConteo] = useState<Record<string, string>>({})
  const [notasCierre, setNotasCierre] = useState("")

  const cargar = useCallback(async () => {
    if (!user || !negocioId) return
    setLoading(true)

    try {
      const abierto = await getTurnoAbierto(negocioId, user.uid)
      setTurno(abierto)

      if (!abierto) {
        setMovimientos([])
        setResumen(null)
        return
      }

      // Las ventas del turno y sus movimientos, para calcular lo esperado.
      const [ventasSnapshot, movs] = await Promise.all([
        getDocs(query(collection(db, "ventas"), where("turnoId", "==", abierto.id))),
        getMovimientos(abierto.id),
      ])

      const ventas = ventasSnapshot.docs.map((document) => document.data())
      setMovimientos(movs)
      setResumen(resumirTurno(abierto, ventas as never[], movs))
    } catch (error) {
      console.error("Error cargando la caja:", error)
      reportFirestoreError(error)
    } finally {
      setLoading(false)
    }
  }, [user, negocioId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const handleAbrir = async () => {
    if (!user || !negocioId) return
    setWorking(true)

    try {
      await abrirTurno({
        negocioId,
        cajeroUid: user.uid,
        cajeroNombre: userData?.businessName || user.email || "Cajero",
        cajeroEmail: user.email ?? "",
        fondoInicial: {
          usd: Number.parseFloat(fondoUsd) || 0,
          bs: Number.parseFloat(fondoBs) || 0,
        },
      })
      setFondoUsd("")
      setFondoBs("")
      await cargar()
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo abrir la caja.")
    } finally {
      setWorking(false)
    }
  }

  const handleMovimiento = async () => {
    if (!user || !negocioId || !turno || !showMovimiento) return
    setWorking(true)

    try {
      await registrarMovimiento({
        negocioId,
        turnoId: turno.id,
        tipo: showMovimiento,
        metodo: movMetodo,
        monto: Number.parseFloat(movMonto) || 0,
        moneda: isUsdMethod(movMetodo) ? "USD" : "BS",
        motivo: movMotivo,
        creadoPor: user.uid,
      })
      setShowMovimiento(null)
      setMovMonto("")
      await cargar()
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo registrar el movimiento.")
    } finally {
      setWorking(false)
    }
  }

  const handleCerrar = async () => {
    if (!turno || !resumen) return

    const conteoFinal: Record<string, number> = {}
    for (const [metodo, valor] of Object.entries(conteo)) {
      const numero = Number.parseFloat(valor)
      if (Number.isFinite(numero)) conteoFinal[metodo] = numero
    }

    // Los métodos con dinero esperado que el cajero no contó valen cero, no se
    // ignoran: si esperabas 300 en Zelle y no lo cuentas, eso es un faltante.
    for (const metodo of Object.keys(resumen.esperado)) {
      if (!(metodo in conteoFinal)) conteoFinal[metodo] = 0
    }

    setWorking(true)
    try {
      const diferencias = await cerrarTurno({
        turnoId: turno.id,
        conteoFinal,
        esperadoFinal: resumen.esperado,
        notas: notasCierre,
        tasa: rate,
      })

      const descuadres = Object.entries(diferencias).filter(([, valor]) => Math.abs(valor) > 0.01)
      alert(
        descuadres.length === 0
          ? "Caja cerrada y cuadrada. Todo coincide."
          : `Caja cerrada con diferencias:\n${descuadres
              .map(([metodo, valor]) => `· ${METHOD_LABELS[metodo] ?? metodo}: ${valor > 0 ? "sobra" : "falta"} ${formatByMethod(metodo, Math.abs(valor))}`)
              .join("\n")}`,
      )

      setShowCierre(false)
      setConteo({})
      setNotasCierre("")
      await cargar()
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo cerrar la caja.")
    } finally {
      setWorking(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Cargando la caja…
      </div>
    )
  }

  // ---------------------------------------------------------------- sin turno
  if (!turno) {
    return (
      <div className="space-y-5">
        <PageHeader title="Caja" description="Abre tu turno para empezar a cobrar" />

        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LockOpen className="text-primary size-4" />
              Abrir caja
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Cuenta el dinero con el que arrancas. Al cerrar, el sistema comparará esta cantidad más
              lo vendido contra lo que tengas en la gaveta.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="fondo-usd" className="text-sm font-medium">
                  Fondo en divisas
                </label>
                <Input
                  id="fondo-usd"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={fondoUsd}
                  onChange={(event) => setFondoUsd(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="fondo-bs" className="text-sm font-medium">
                  Fondo en bolívares
                </label>
                <Input
                  id="fondo-bs"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={fondoBs}
                  onChange={(event) => setFondoBs(event.target.value)}
                />
              </div>
            </div>

            <Button onClick={handleAbrir} disabled={working} className="w-full gap-2">
              {working ? <Loader2 className="size-4 animate-spin" /> : <LockOpen className="size-4" />}
              Abrir caja
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // -------------------------------------------------------------- turno abierto
  const abiertoDesde = turno.abiertoEn?.toDate?.()
  const metodosConMovimiento = ALL_METHODS.filter(
    (metodo) => (resumen?.esperado[metodo] ?? 0) !== 0 || (resumen?.ventas[metodo] ?? 0) !== 0,
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Caja"
        description={
          abiertoDesde
            ? `Turno abierto desde las ${abiertoDesde.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}`
            : "Turno abierto"
        }
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setShowMovimiento("entrada"); setMovMotivo(MOTIVOS_ENTRADA[0]) }}>
              <ArrowDownLeft className="size-4" />
              Entrada
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setShowMovimiento("salida"); setMovMotivo(MOTIVOS_SALIDA[0]) }}>
              <ArrowUpRight className="size-4" />
              Salida
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setShowCierre(true)}>
              <Lock className="size-4" />
              Cerrar caja
            </Button>
          </>
        }
      />

      <m.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        <m.div custom={0} variants={listItem}>
          <StatCard label="Ventas del turno" value={String(resumen?.cantidadVentas ?? 0)} icon={Receipt} />
        </m.div>
        <m.div custom={1} variants={listItem}>
          <StatCard label="Cobrado en divisas" value={formatMoney(resumen?.totalVentasUsd ?? 0)} icon={Wallet} />
        </m.div>
        <m.div custom={2} variants={listItem}>
          <StatCard label="Cobrado en bolívares" value={formatBs(resumen?.totalVentasBs ?? 0)} icon={Wallet} />
        </m.div>
        <m.div custom={3} variants={listItem}>
          <StatCard
            label="Fondo inicial"
            value={formatMoney(turno.fondoInicial?.usd ?? 0)}
            hint={turno.fondoInicial?.bs ? formatBs(turno.fondoInicial.bs) : undefined}
            icon={LockOpen}
          />
        </m.div>
      </m.div>

      {/* Lo que debería haber, método por método */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lo que debería haber en caja</CardTitle>
        </CardHeader>
        <CardContent>
          {metodosConMovimiento.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Todavía no ha entrado dinero en este turno"
              description="Cuando registres la primera venta, aquí verás cuánto debería haber por cada método de pago."
            />
          ) : (
            <ul className="divide-border divide-y">
              {metodosConMovimiento.map((metodo) => (
                <li key={metodo} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm">{METHOD_LABELS[metodo] ?? metodo}</span>
                  <span className="font-semibold tabular-nums">
                    {formatByMethod(metodo, resumen?.esperado[metodo] ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Movimientos que no son ventas */}
      {movimientos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Entradas y salidas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-border divide-y">
              {movimientos.map((movimiento) => (
                <li key={movimiento.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{movimiento.motivo}</p>
                    <p className="text-muted-foreground text-xs">
                      {METHOD_LABELS[movimiento.metodo] ?? movimiento.metodo} ·{" "}
                      {movimiento.createdAt?.toDate?.().toLocaleTimeString("es-VE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${
                      movimiento.tipo === "salida" ? "text-destructive" : "text-success"
                    }`}
                  >
                    {movimiento.tipo === "salida" ? "−" : "+"}
                    {formatByMethod(movimiento.metodo, movimiento.monto)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------- diálogo movimiento */}
      <AnimatePresence>
        {showMovimiento && (
          <m.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowMovimiento(null)}
          >
            <m.div
              variants={popIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bg-card w-full max-w-md rounded-xl border p-5 shadow-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-lg font-semibold">
                {showMovimiento === "entrada" ? "Entrada de dinero" : "Salida de dinero"}
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Queda registrado a tu nombre y no se puede borrar.
              </p>

              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="mov-metodo" className="text-sm font-medium">Método</label>
                  <select
                    id="mov-metodo"
                    className={SELECT_CLASS}
                    value={movMetodo}
                    onChange={(event) => setMovMetodo(event.target.value)}
                  >
                    {ALL_METHODS.map((metodo) => (
                      <option key={metodo} value={metodo}>
                        {METHOD_LABELS[metodo]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="mov-monto" className="text-sm font-medium">
                    Monto en {isUsdMethod(movMetodo) ? "divisas" : "bolívares"}
                  </label>
                  <Input
                    id="mov-monto"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={movMonto}
                    onChange={(event) => setMovMonto(event.target.value)}
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="mov-motivo" className="text-sm font-medium">Motivo</label>
                  <select
                    id="mov-motivo"
                    className={SELECT_CLASS}
                    value={movMotivo}
                    onChange={(event) => setMovMotivo(event.target.value)}
                  >
                    {(showMovimiento === "entrada" ? MOTIVOS_ENTRADA : MOTIVOS_SALIDA).map((motivo) => (
                      <option key={motivo} value={motivo}>
                        {motivo}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowMovimiento(null)}>
                  Cancelar
                </Button>
                <Button className="flex-1 gap-2" onClick={handleMovimiento} disabled={working}>
                  {working ? <Loader2 className="size-4 animate-spin" /> : null}
                  Registrar
                </Button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* --------------------------------------------------------- cierre de caja */}
      <AnimatePresence>
        {showCierre && (
          <m.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <m.div
              variants={popIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bg-card max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border p-5 shadow-lg"
            >
              <h3 className="text-lg font-semibold">Cerrar caja</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Cuenta el dinero y escribe lo que hay de verdad. No mires lo esperado antes de
                contar: el cuadre solo sirve si el conteo es a ciegas.
              </p>

              <div className="mt-4 space-y-3">
                {metodosConMovimiento.map((metodo) => (
                  <div key={metodo} className="space-y-1.5">
                    <label htmlFor={`conteo-${metodo}`} className="text-sm font-medium">
                      {METHOD_LABELS[metodo] ?? metodo}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        ({isUsdMethod(metodo) ? "divisas" : "bolívares"})
                      </span>
                    </label>
                    <Input
                      id={`conteo-${metodo}`}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={conteo[metodo] ?? ""}
                      onChange={(event) => setConteo({ ...conteo, [metodo]: event.target.value })}
                    />
                  </div>
                ))}

                <div className="space-y-1.5">
                  <label htmlFor="notas-cierre" className="text-sm font-medium">
                    Notas (opcional)
                  </label>
                  <Input
                    id="notas-cierre"
                    placeholder="Ej: faltó un billete de 20"
                    value={notasCierre}
                    onChange={(event) => setNotasCierre(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowCierre(false)}>
                  Seguir vendiendo
                </Button>
                <Button className="flex-1 gap-2" onClick={handleCerrar} disabled={working}>
                  {working ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
                  Cerrar turno
                </Button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
