"use client"

import { useCallback, useEffect, useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  Landmark,
  Loader2,
  Plus,
  Smartphone,
  Wallet,
  X,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useRates } from "@/hooks/use-rates"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { StatCard } from "@/components/ui/stat-card"
import { EmptyState, PageHeader } from "@/components/ui/page-header"
import { formatBs, formatMoney } from "@/lib/pricing"
import { reportFirestoreError } from "@/lib/sync-status"
import { listItem, popIn, staggerContainer } from "@/lib/motion"
import {
  type Cuenta,
  type Moneda,
  type Movimiento,
  TIPOS_CUENTA,
  type TipoCuenta,
  crearCuenta,
  listarCuentas,
  listarMovimientos,
  totalizar,
  transferir,
} from "@/lib/accounts"

const SELECT_CLASS =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const ICONO: Record<TipoCuenta, typeof Wallet> = {
  efectivo: Banknote,
  banco: Landmark,
  digital: Smartphone,
}

/** El saldo se pinta en la moneda de la cuenta, nunca convertido. */
function saldoDe(cuenta: Cuenta): string {
  return cuenta.moneda === "USD" ? formatMoney(cuenta.saldo) : formatBs(cuenta.saldo)
}

export default function AccountsView() {
  const { negocioId, allows } = useAuth()
  const { rate } = useRates()

  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [loading, setLoading] = useState(true)

  const [nueva, setNueva] = useState(false)
  const [transferencia, setTransferencia] = useState(false)
  const [detalle, setDetalle] = useState<Cuenta | null>(null)
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [cargandoLibro, setCargandoLibro] = useState(false)

  const puedeGestionar = allows("accounts.manage")

  const cargar = useCallback(async () => {
    if (!negocioId) return
    setLoading(true)
    try {
      setCuentas(await listarCuentas(negocioId))
    } catch (error) {
      console.error("Error cargando cuentas:", error)
      reportFirestoreError(error)
    } finally {
      setLoading(false)
    }
  }, [negocioId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const abrirLibro = async (cuenta: Cuenta) => {
    if (!negocioId) return
    setDetalle(cuenta)
    setCargandoLibro(true)
    try {
      setMovimientos(await listarMovimientos({ negocioId, cuentaId: cuenta.id, maximo: 60 }))
    } catch (error) {
      console.error("Error cargando el libro:", error)
      reportFirestoreError(error)
    } finally {
      setCargandoLibro(false)
    }
  }

  const totales = totalizar(cuentas, rate)

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center gap-2 py-16">
        <Loader2 className="size-5 animate-spin" />
        Cargando tus cuentas…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cuentas"
        description="Dónde está el dinero de tu negocio, ahora mismo"
        actions={
          puedeGestionar ? (
            <>
              {cuentas.length > 1 && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTransferencia(true)}>
                  <ArrowRightLeft className="size-4" />
                  Transferir
                </Button>
              )}
              <Button size="sm" className="gap-1.5" onClick={() => setNueva(true)}>
                <Plus className="size-4" />
                Nueva cuenta
              </Button>
            </>
          ) : null
        }
      />

      {cuentas.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Wallet}
              title="Todavía no tienes cuentas"
              description="Crea una por cada sitio donde guardas dinero: la gaveta, tu cuenta del banco, Zelle. Después podrás ver cuánto hay en cada una sin sumar tickets."
              action={
                puedeGestionar ? (
                  <Button onClick={() => setNueva(true)} className="gap-2">
                    <Plus className="size-4" />
                    Crear la primera
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            <StatCard label="En divisas" value={formatMoney(totales.totalUsd)} icon={Banknote} />
            <StatCard label="En bolívares" value={formatBs(totales.totalBs)} icon={Landmark} />
            <StatCard
              label="Todo junto"
              value={
                totales.totalEquivalenteUsd !== null
                  ? formatMoney(totales.totalEquivalenteUsd)
                  : "falta la tasa"
              }
              hint={
                totales.totalEquivalenteUsd !== null
                  ? "Bolívares convertidos a la tasa de hoy"
                  : "Sin tasa no se convierte nada"
              }
              icon={Wallet}
              className="col-span-2 lg:col-span-1"
            />
          </div>

          {/* Las cuentas, en tarjetas. Se pulsan para ver su libro. */}
          <m.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {cuentas.map((cuenta, indice) => {
              const Icono = ICONO[cuenta.tipo] ?? Wallet
              const enRojo = cuenta.saldo < 0

              return (
                <m.button
                  key={cuenta.id}
                  custom={indice}
                  variants={listItem}
                  onClick={() => void abrirLibro(cuenta)}
                  className="bg-card hover:border-primary/40 rounded-xl border p-5 text-left shadow-sm transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{cuenta.nombre}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {cuenta.entidad || TIPOS_CUENTA.find((t) => t.id === cuenta.tipo)?.label}
                        {cuenta.referencia ? ` ·· ${cuenta.referencia}` : ""}
                      </p>
                    </div>
                    <span className="bg-primary/10 grid size-9 shrink-0 place-items-center rounded-lg">
                      <Icono className="text-primary size-4" aria-hidden />
                    </span>
                  </div>

                  <p
                    className={`mt-5 text-2xl font-semibold tabular-nums ${enRojo ? "text-destructive" : ""}`}
                  >
                    {saldoDe(cuenta)}
                  </p>

                  {/* Un saldo negativo en efectivo casi siempre significa que
                      falta registrar una entrada, no que se deba dinero. */}
                  {enRojo && (
                    <p className="text-destructive mt-1 text-xs">
                      En negativo: revisa si falta registrar un ingreso.
                    </p>
                  )}
                </m.button>
              )
            })}
          </m.div>
        </>
      )}

      {/* ------------------------------------------------------ nueva cuenta */}
      <AnimatePresence>
        {nueva && (
          <DialogoNuevaCuenta
            onClose={() => setNueva(false)}
            onCreada={async () => {
              setNueva(false)
              await cargar()
            }}
          />
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------ transferencia */}
      <AnimatePresence>
        {transferencia && (
          <DialogoTransferencia
            cuentas={cuentas}
            onClose={() => setTransferencia(false)}
            onHecha={async () => {
              setTransferencia(false)
              await cargar()
            }}
          />
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------- libro mayor */}
      <AnimatePresence>
        {detalle && (
          <m.div
            className="fixed inset-0 z-50 flex justify-end bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDetalle(null)}
          >
            <m.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              onClick={(event) => event.stopPropagation()}
              className="bg-card flex h-full w-full max-w-md flex-col border-l"
            >
              <div className="flex items-start justify-between gap-3 border-b p-5">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{detalle.nombre}</p>
                  <p className="text-2xl font-bold tabular-nums">{saldoDe(detalle)}</p>
                </div>
                <button
                  onClick={() => setDetalle(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Cerrar"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {cargandoLibro ? (
                  <div className="text-muted-foreground flex items-center justify-center gap-2 py-10">
                    <Loader2 className="size-4 animate-spin" />
                    Cargando movimientos…
                  </div>
                ) : movimientos.length === 0 ? (
                  <EmptyState
                    icon={Wallet}
                    title="Sin movimientos todavía"
                    description="Aquí aparecerá cada entrada y cada salida de esta cuenta, con su fecha y su motivo."
                  />
                ) : (
                  <ul className="divide-border divide-y">
                    {movimientos.map((movimiento) => {
                      const esIngreso = movimiento.tipo === "ingreso"
                      const importe =
                        movimiento.moneda === "USD"
                          ? formatMoney(movimiento.monto)
                          : formatBs(movimiento.monto)

                      return (
                        <li key={movimiento.id} className="flex items-start gap-3 py-3">
                          <span
                            className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${
                              esIngreso ? "bg-success/15" : "bg-destructive/10"
                            }`}
                          >
                            {esIngreso ? (
                              <ArrowDownLeft className="text-success size-4" aria-hidden />
                            ) : (
                              <ArrowUpRight className="text-destructive size-4" aria-hidden />
                            )}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{movimiento.concepto}</p>
                            <p className="text-muted-foreground text-xs">
                              {movimiento.fecha?.toDate?.().toLocaleString("es-VE", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 text-sm font-semibold tabular-nums ${
                              esIngreso ? "text-success" : "text-destructive"
                            }`}
                          >
                            {esIngreso ? "+" : "−"}
                            {importe}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </m.aside>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Envoltorio({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <m.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <m.div
        variants={popIn}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(event) => event.stopPropagation()}
        className="bg-card max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border p-5 shadow-lg"
      >
        {children}
      </m.div>
    </m.div>
  )
}

function DialogoNuevaCuenta({ onClose, onCreada }: { onClose: () => void; onCreada: () => void }) {
  const { user, negocioId } = useAuth()
  const [nombre, setNombre] = useState("")
  const [tipo, setTipo] = useState<TipoCuenta>("efectivo")
  const [moneda, setMoneda] = useState<Moneda>("USD")
  const [entidad, setEntidad] = useState("")
  const [referencia, setReferencia] = useState("")
  const [saldo, setSaldo] = useState("")
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")

  const guardar = async () => {
    if (!user || !negocioId) return
    if (!nombre.trim()) {
      setError("Ponle un nombre para reconocerla.")
      return
    }

    setWorking(true)
    try {
      await crearCuenta({
        negocioId,
        nombre,
        tipo,
        moneda,
        entidad,
        referencia,
        saldoInicial: Number.parseFloat(saldo) || 0,
        creadoPor: user.uid,
      })
      onCreada()
    } catch (err) {
      console.error(err)
      reportFirestoreError(err)
      setError("No se pudo crear la cuenta.")
    } finally {
      setWorking(false)
    }
  }

  return (
    <Envoltorio onClose={onClose}>
      <h3 className="text-lg font-semibold">Nueva cuenta</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        Una por cada sitio donde guardas dinero.
      </p>

      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="cuenta-nombre" className="text-sm font-medium">Nombre</label>
          <Input
            id="cuenta-nombre"
            placeholder="Gaveta de la tienda"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="h-11"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="cuenta-tipo" className="text-sm font-medium">Tipo</label>
            <select
              id="cuenta-tipo"
              className={SELECT_CLASS}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoCuenta)}
            >
              {TIPOS_CUENTA.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              {TIPOS_CUENTA.find((t) => t.id === tipo)?.ayuda}
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cuenta-moneda" className="text-sm font-medium">Moneda</label>
            <select
              id="cuenta-moneda"
              className={SELECT_CLASS}
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as Moneda)}
            >
              <option value="USD">Divisas ($)</option>
              <option value="BS">Bolívares (Bs)</option>
            </select>
            <p className="text-muted-foreground text-xs">No se puede cambiar después.</p>
          </div>
        </div>

        {tipo !== "efectivo" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="cuenta-entidad" className="text-sm font-medium">
                {tipo === "banco" ? "Banco" : "Servicio"}
              </label>
              <Input
                id="cuenta-entidad"
                placeholder={tipo === "banco" ? "Banesco" : "Zelle"}
                value={entidad}
                onChange={(e) => setEntidad(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cuenta-ref" className="text-sm font-medium">Últimos dígitos</label>
              <Input
                id="cuenta-ref"
                placeholder="4821"
                maxLength={4}
                value={referencia}
                onChange={(e) => setReferencia(e.target.value.replace(/\D/g, ""))}
                className="h-11"
              />
              {/* Solo los últimos cuatro: el número completo de una cuenta no
                  tiene por qué estar guardado aquí. */}
              <p className="text-muted-foreground text-xs">Solo para distinguirla.</p>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="cuenta-saldo" className="text-sm font-medium">
            ¿Cuánto hay ahora?
          </label>
          <Input
            id="cuenta-saldo"
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder="0.00"
            value={saldo}
            onChange={(e) => setSaldo(e.target.value)}
            className="h-11"
          />
          <p className="text-muted-foreground text-xs">
            Entra como primer movimiento, para que el libro cuadre desde el día uno.
          </p>
        </div>
      </div>

      {error && <p className="text-destructive mt-3 text-sm">{error}</p>}

      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose} disabled={working}>
          Cancelar
        </Button>
        <Button className="flex-1 gap-2" onClick={guardar} disabled={working}>
          {working ? <Loader2 className="size-4 animate-spin" /> : null}
          Crear
        </Button>
      </div>
    </Envoltorio>
  )
}

function DialogoTransferencia({
  cuentas,
  onClose,
  onHecha,
}: {
  cuentas: Cuenta[]
  onClose: () => void
  onHecha: () => void
}) {
  const { user, negocioId } = useAuth()
  const { rate } = useRates()

  const [desde, setDesde] = useState(cuentas[0]?.id ?? "")
  const [hasta, setHasta] = useState(cuentas[1]?.id ?? "")
  const [monto, setMonto] = useState("")
  const [montoDestino, setMontoDestino] = useState("")
  const [concepto, setConcepto] = useState("")
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")

  const cuentaOrigen = cuentas.find((c) => c.id === desde)
  const cuentaDestino = cuentas.find((c) => c.id === hasta)
  const cambiaMoneda = cuentaOrigen && cuentaDestino && cuentaOrigen.moneda !== cuentaDestino.moneda

  // Con cambio de moneda se propone la conversión a la tasa del día, pero se
  // deja editar: el banco casi nunca te da exactamente la tasa oficial.
  const sugerir = (valor: string) => {
    setMonto(valor)
    if (!cambiaMoneda || !rate) {
      setMontoDestino(valor)
      return
    }
    const numero = Number.parseFloat(valor)
    if (!Number.isFinite(numero)) {
      setMontoDestino("")
      return
    }
    const convertido =
      cuentaOrigen!.moneda === "USD" ? numero * rate : numero / rate
    setMontoDestino(convertido.toFixed(2))
  }

  const enviar = async () => {
    if (!user || !negocioId || !cuentaOrigen || !cuentaDestino) return

    const salida = Number.parseFloat(monto)
    const entrada = Number.parseFloat(montoDestino)

    if (!Number.isFinite(salida) || salida <= 0) {
      setError("Escribe cuánto sale.")
      return
    }
    if (!Number.isFinite(entrada) || entrada <= 0) {
      setError("Escribe cuánto entra.")
      return
    }
    if (salida > cuentaOrigen.saldo) {
      setError(`En ${cuentaOrigen.nombre} solo hay ${saldoDe(cuentaOrigen)}.`)
      return
    }

    setWorking(true)
    try {
      await transferir({
        negocioId,
        desdeCuentaId: desde,
        hastaCuentaId: hasta,
        monto: salida,
        monedaOrigen: cuentaOrigen.moneda,
        montoDestino: entrada,
        monedaDestino: cuentaDestino.moneda,
        concepto: concepto || `De ${cuentaOrigen.nombre} a ${cuentaDestino.nombre}`,
        creadoPor: user.uid,
      })
      onHecha()
    } catch (err) {
      console.error(err)
      reportFirestoreError(err)
      setError(err instanceof Error ? err.message : "No se pudo transferir.")
    } finally {
      setWorking(false)
    }
  }

  return (
    <Envoltorio onClose={onClose}>
      <h3 className="text-lg font-semibold">Transferir entre cuentas</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        Mover dinero de un sitio a otro no es un gasto ni un ingreso: no toca tu utilidad.
      </p>

      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="tr-desde" className="text-sm font-medium">Sale de</label>
          <select id="tr-desde" className={SELECT_CLASS} value={desde} onChange={(e) => setDesde(e.target.value)}>
            {cuentas.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {cuenta.nombre} — {saldoDe(cuenta)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="tr-hasta" className="text-sm font-medium">Entra en</label>
          <select id="tr-hasta" className={SELECT_CLASS} value={hasta} onChange={(e) => setHasta(e.target.value)}>
            {cuentas
              .filter((cuenta) => cuenta.id !== desde)
              .map((cuenta) => (
                <option key={cuenta.id} value={cuenta.id}>
                  {cuenta.nombre} — {saldoDe(cuenta)}
                </option>
              ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="tr-monto" className="text-sm font-medium">
            Sale {cuentaOrigen ? `(${cuentaOrigen.moneda === "USD" ? "$" : "Bs"})` : ""}
          </label>
          <Input
            id="tr-monto"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={monto}
            onChange={(e) => sugerir(e.target.value)}
            className="h-11"
          />
        </div>

        {cambiaMoneda && (
          <div className="space-y-1.5">
            <label htmlFor="tr-destino" className="text-sm font-medium">
              Entra ({cuentaDestino!.moneda === "USD" ? "$" : "Bs"})
            </label>
            <Input
              id="tr-destino"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={montoDestino}
              onChange={(e) => setMontoDestino(e.target.value)}
              className="h-11"
            />
            <p className="text-muted-foreground text-xs">
              Propuesto a la tasa de hoy. Cámbialo si el banco te dio otra.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="tr-concepto" className="text-sm font-medium">
            Concepto <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <Input
            id="tr-concepto"
            placeholder="Depósito del cierre del viernes"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      {error && <p className="text-destructive mt-3 text-sm">{error}</p>}

      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose} disabled={working}>
          Cancelar
        </Button>
        <Button className="flex-1 gap-2" onClick={enviar} disabled={working}>
          {working ? <Loader2 className="size-4 animate-spin" /> : null}
          Transferir
        </Button>
      </div>
    </Envoltorio>
  )
}
