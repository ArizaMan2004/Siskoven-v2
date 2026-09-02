"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import {
  Building2,
  CalendarClock,
  Loader2,
  Plus,
  Receipt,
  TrendingDown,
  Wallet,
  X,
} from "lucide-react"
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
  CATEGORIAS_SUGERIDAS,
  type Gasto,
  PERIODOS,
  type PeriodoRecurrencia,
  type Proveedor,
  TIPOS_GASTO,
  type TipoGasto,
  crearProveedor,
  listarGastos,
  listarProveedores,
  registrarGasto,
  resumirGastos,
  tipoDe,
} from "@/lib/expenses"
import {
  type Cuenta,
  listarCuentas,
  registrarMovimiento,
} from "@/lib/accounts"

const SELECT_CLASS =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const RANGOS = [
  { id: "mes", label: "Este mes" },
  { id: "trimestre", label: "3 meses" },
  { id: "todo", label: "Todo" },
] as const

type Rango = (typeof RANGOS)[number]["id"]

function desdeDe(rango: Rango): Date | undefined {
  const ahora = new Date()
  if (rango === "mes") return new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  if (rango === "trimestre") return new Date(ahora.getFullYear(), ahora.getMonth() - 2, 1)
  return undefined
}

export default function ExpensesView() {
  const { negocioId, allows } = useAuth()

  const [gastos, setGastos] = useState<Gasto[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [rango, setRango] = useState<Rango>("mes")
  const [loading, setLoading] = useState(true)
  const [nuevo, setNuevo] = useState(false)

  const puedeRegistrar = allows("expenses.create")

  const cargar = useCallback(async () => {
    if (!negocioId) return
    setLoading(true)
    try {
      const [listaGastos, listaCuentas, listaProveedores] = await Promise.all([
        listarGastos({ negocioId, desde: desdeDe(rango) }),
        listarCuentas(negocioId),
        listarProveedores(negocioId),
      ])
      setGastos(listaGastos)
      setCuentas(listaCuentas)
      setProveedores(listaProveedores)
    } catch (error) {
      console.error("Error cargando gastos:", error)
      reportFirestoreError(error)
    } finally {
      setLoading(false)
    }
  }, [negocioId, rango])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const resumen = useMemo(() => resumirGastos(gastos), [gastos])

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center gap-2 py-16">
        <Loader2 className="size-5 animate-spin" />
        Cargando gastos…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Gastos"
        description="En qué se te va la plata"
        actions={
          <>
            <div className="flex gap-1.5">
              {RANGOS.map((opcion) => (
                <Button
                  key={opcion.id}
                  size="sm"
                  variant={rango === opcion.id ? "default" : "outline"}
                  onClick={() => setRango(opcion.id)}
                >
                  {opcion.label}
                </Button>
              ))}
            </div>
            {puedeRegistrar && (
              <Button size="sm" className="gap-1.5" onClick={() => setNuevo(true)}>
                <Plus className="size-4" />
                Registrar gasto
              </Button>
            )}
          </>
        }
      />

      {/* La cifra que importa va primero y sola: es la que se resta de las
          ventas para saber si el negocio gana. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Costo de operar"
          value={formatMoney(resumen.costoOperativoUsd)}
          hint="Fijos + variables + discrecionales"
          icon={TrendingDown}
          className="col-span-2"
        />
        <StatCard
          label="Inversión"
          value={formatMoney(resumen.porTipo.inversion)}
          hint="No resta de la utilidad"
          icon={Building2}
        />
        <StatCard
          label="Retiros"
          value={formatMoney(resumen.porTipo.retiro)}
          hint="Lo que sacaste para ti"
          icon={Wallet}
        />
      </div>

      {/* Reparto por tipo, con la explicación de cuáles cuentan. */}
      {gastos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cómo se reparte</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {TIPOS_GASTO.map((tipo) => {
                const monto = resumen.porTipo[tipo.id]
                if (!monto) return null
                const porcentaje = resumen.totalSalidasUsd
                  ? (monto / resumen.totalSalidasUsd) * 100
                  : 0

                return (
                  <li key={tipo.id}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tipo.chip}`}>
                          {tipo.label}
                        </span>
                        {!tipo.afectaUtilidad && (
                          <span className="text-muted-foreground text-xs">no resta utilidad</span>
                        )}
                      </span>
                      <span className="font-semibold tabular-nums">{formatMoney(monto)}</span>
                    </div>
                    <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                      <div
                        className={tipo.afectaUtilidad ? "bg-primary h-full" : "bg-muted-foreground/40 h-full"}
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* En qué categorías y con qué proveedores */}
      {resumen.porCategoria.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Por categoría</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-border divide-y">
                {resumen.porCategoria.slice(0, 7).map((entrada) => (
                  <li
                    key={`${entrada.tipo}-${entrada.categoria}`}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="min-w-0 truncate text-sm">{entrada.categoria}</span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatMoney(entrada.totalUsd)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">A quién le compras</CardTitle>
            </CardHeader>
            <CardContent>
              {resumen.porProveedor.length === 0 ? (
                <p className="text-muted-foreground py-4 text-sm">
                  Todavía no has asociado gastos a ningún proveedor.
                </p>
              ) : (
                <ul className="divide-border divide-y">
                  {resumen.porProveedor.slice(0, 7).map((entrada) => (
                    <li key={entrada.nombre} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{entrada.nombre}</p>
                        <p className="text-muted-foreground text-xs">
                          {entrada.veces} {entrada.veces === 1 ? "compra" : "compras"}
                        </p>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatMoney(entrada.totalUsd)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* El detalle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {gastos.length} {gastos.length === 1 ? "gasto" : "gastos"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gastos.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nada registrado en este período"
              description="Anota lo que sale: alquiler, mercancía, flete, hasta el pastel de un cumpleaños. Sin eso, la utilidad que ves no es la real."
              action={
                puedeRegistrar ? (
                  <Button onClick={() => setNuevo(true)} className="gap-2">
                    <Plus className="size-4" />
                    Registrar el primero
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <m.ul
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="divide-border divide-y"
            >
              {gastos.map((gasto, indice) => {
                const definicion = tipoDe(gasto.tipo)
                return (
                  <m.li
                    key={gasto.id}
                    custom={indice}
                    variants={listItem}
                    className="flex items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{gasto.concepto}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${definicion.chip}`}>
                          {definicion.label}
                        </span>
                        <span className="text-muted-foreground text-xs">{gasto.categoria}</span>
                        {gasto.proveedorNombre && (
                          <span className="text-muted-foreground text-xs">· {gasto.proveedorNombre}</span>
                        )}
                        {gasto.recurrencia?.activa && (
                          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                            <CalendarClock className="size-3" aria-hidden />
                            {PERIODOS.find((p) => p.id === gasto.recurrencia?.periodo)?.label}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">{formatMoney(gasto.montoUsd)}</p>
                      <p className="text-muted-foreground text-xs">
                        {gasto.fecha?.toDate?.().toLocaleDateString("es-VE", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </p>
                    </div>
                  </m.li>
                )
              })}
            </m.ul>
          )}
        </CardContent>
      </Card>

      <AnimatePresence>
        {nuevo && (
          <DialogoGasto
            cuentas={cuentas}
            proveedores={proveedores}
            onClose={() => setNuevo(false)}
            onGuardado={async () => {
              setNuevo(false)
              await cargar()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------

function DialogoGasto({
  cuentas,
  proveedores,
  onClose,
  onGuardado,
}: {
  cuentas: Cuenta[]
  proveedores: Proveedor[]
  onClose: () => void
  onGuardado: () => void
}) {
  const { user, negocioId } = useAuth()
  const { rate } = useRates()

  const [tipo, setTipo] = useState<TipoGasto>("variable")
  const [categoria, setCategoria] = useState(CATEGORIAS_SUGERIDAS.variable[0])
  const [concepto, setConcepto] = useState("")
  const [proveedorId, setProveedorId] = useState("")
  const [nuevoProveedor, setNuevoProveedor] = useState("")
  const [monto, setMonto] = useState("")
  const [moneda, setMoneda] = useState<"USD" | "BS">("USD")
  const [cuentaId, setCuentaId] = useState("")
  const [repetir, setRepetir] = useState<PeriodoRecurrencia | "">("")
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")

  const definicion = tipoDe(tipo)
  const cuenta = cuentas.find((c) => c.id === cuentaId)

  const cambiarTipo = (siguiente: TipoGasto) => {
    setTipo(siguiente)
    setCategoria(CATEGORIAS_SUGERIDAS[siguiente][0])
    // La recurrencia solo tiene sentido en los fijos.
    if (siguiente !== "fijo") setRepetir("")
  }

  const guardar = async () => {
    if (!user || !negocioId) return

    const importe = Number.parseFloat(monto)
    if (!Number.isFinite(importe) || importe <= 0) {
      setError("Escribe cuánto se gastó.")
      return
    }
    if (!concepto.trim()) {
      setError("Escribe en qué se gastó. Un gasto sin concepto no sirve de nada dentro de un mes.")
      return
    }

    // Se guardan las dos monedas siempre, con la tasa del momento: releer un
    // gasto de hace seis meses convirtiéndolo a la tasa de hoy daría una cifra
    // que nunca ocurrió.
    const montoUsd = moneda === "USD" ? importe : rate ? importe / rate : 0
    const montoBs = moneda === "BS" ? importe : rate ? importe * rate : 0

    if (moneda === "BS" && !rate) {
      setError("No hay tasa cargada, así que no se puede convertir. Actualízala primero.")
      return
    }

    setWorking(true)
    try {
      let proveedorFinalId = proveedorId || null
      let proveedorNombre =
        proveedores.find((p) => p.id === proveedorId)?.nombre ?? null

      // Crear el proveedor al vuelo: obligar a salir de aquí para darlo de
      // alta hace que la gente deje el campo vacío y después no se sepa a
      // quién se le compró.
      if (!proveedorFinalId && nuevoProveedor.trim()) {
        proveedorFinalId = await crearProveedor({
          negocioId,
          nombre: nuevoProveedor.trim(),
        })
        proveedorNombre = nuevoProveedor.trim()
      }

      const gastoId = await registrarGasto({
        negocioId,
        tipo,
        categoria,
        concepto,
        proveedorId: proveedorFinalId,
        proveedorNombre,
        montoUsd: Math.round(montoUsd * 100) / 100,
        montoBs: Math.round(montoBs * 100) / 100,
        tasa: rate,
        metodoPago: cuenta?.nombre ?? "Sin especificar",
        recurrencia: repetir ? { periodo: repetir } : null,
        creadoPor: user.uid,
      })

      // Si se indicó de qué cuenta salió, el saldo baja. Ahí está el círculo
      // que cierra la tesorería: el gasto no es solo un apunte, es plata que
      // salió de un sitio concreto.
      if (cuenta) {
        await registrarMovimiento({
          negocioId,
          cuentaId: cuenta.id,
          tipo: "egreso",
          monto: cuenta.moneda === "USD" ? montoUsd : montoBs,
          moneda: cuenta.moneda,
          concepto: concepto.trim(),
          origen: "gasto",
          origenId: gastoId,
          creadoPor: user.uid,
        })
      }

      onGuardado()
    } catch (err) {
      console.error(err)
      reportFirestoreError(err)
      setError(err instanceof Error ? err.message : "No se pudo registrar el gasto.")
    } finally {
      setWorking(false)
    }
  }

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
        className="bg-card max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold">Registrar gasto</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>

        {/* El tipo va primero porque cambia todo lo demás, y cada opción
            explica qué es en vez de dar por hecho que se sabe. */}
        <div className="mt-4 space-y-2">
          <label className="text-sm font-medium">¿Qué clase de gasto es?</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {TIPOS_GASTO.map((opcion) => (
              <button
                key={opcion.id}
                type="button"
                onClick={() => cambiarTipo(opcion.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  tipo === opcion.id ? "border-primary bg-primary/5" : "hover:border-primary/40"
                }`}
              >
                <p className="text-sm font-medium">{opcion.label}</p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{opcion.ejemplos}</p>
              </button>
            ))}
          </div>

          {!definicion.afectaUtilidad && (
            <p className="bg-muted/50 text-muted-foreground rounded-md p-2.5 text-xs">
              {definicion.descripcion} Sale dinero, pero no cuenta como costo del mes.
            </p>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="g-concepto" className="text-sm font-medium">¿En qué se gastó?</label>
            <Input
              id="g-concepto"
              placeholder="Telas para la tanda de camisas"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              className="h-11"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="g-categoria" className="text-sm font-medium">Categoría</label>
              <input
                id="g-categoria"
                list="categorias-sugeridas"
                className={SELECT_CLASS}
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              />
              {/* Lista abierta: se sugieren categorías pero se puede escribir
                  cualquiera. Una lista cerrada obliga a meter cosas donde no
                  van, y entonces el reporte deja de servir. */}
              <datalist id="categorias-sugeridas">
                {CATEGORIAS_SUGERIDAS[tipo].map((sugerencia) => (
                  <option key={sugerencia} value={sugerencia} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="g-monto" className="text-sm font-medium">Monto</label>
              <div className="flex gap-2">
                <Input
                  id="g-monto"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="h-11"
                />
                <select
                  className={`${SELECT_CLASS} w-20 shrink-0`}
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value as "USD" | "BS")}
                  aria-label="Moneda"
                >
                  <option value="USD">$</option>
                  <option value="BS">Bs</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="g-proveedor" className="text-sm font-medium">
              Proveedor <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            {proveedores.length > 0 && (
              <select
                id="g-proveedor"
                className={SELECT_CLASS}
                value={proveedorId}
                onChange={(e) => {
                  setProveedorId(e.target.value)
                  if (e.target.value) setNuevoProveedor("")
                }}
              >
                <option value="">— ninguno o uno nuevo —</option>
                {proveedores.map((proveedor) => (
                  <option key={proveedor.id} value={proveedor.id}>
                    {proveedor.nombre}
                  </option>
                ))}
              </select>
            )}
            {!proveedorId && (
              <Input
                placeholder="Telas El Castillo"
                value={nuevoProveedor}
                onChange={(e) => setNuevoProveedor(e.target.value)}
                className="h-11"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="g-cuenta" className="text-sm font-medium">¿De dónde salió el dinero?</label>
            <select
              id="g-cuenta"
              className={SELECT_CLASS}
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
            >
              <option value="">— no descontar de ninguna cuenta —</option>
              {cuentas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              {cuenta
                ? `Se descontará de ${cuenta.nombre}.`
                : "Sin cuenta, el gasto queda anotado pero ningún saldo baja."}
            </p>
          </div>

          {tipo === "fijo" && (
            <div className="space-y-1.5">
              <label htmlFor="g-repetir" className="text-sm font-medium">
                ¿Se repite?
              </label>
              <select
                id="g-repetir"
                className={SELECT_CLASS}
                value={repetir}
                onChange={(e) => setRepetir(e.target.value as PeriodoRecurrencia | "")}
              >
                <option value="">No, es una sola vez</option>
                {PERIODOS.map((periodo) => (
                  <option key={periodo.id} value={periodo.id}>
                    {periodo.label}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Te avisaremos antes de que toque otra vez.
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-destructive mt-3 text-sm">{error}</p>}

        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={working}>
            Cancelar
          </Button>
          <Button className="flex-1 gap-2" onClick={guardar} disabled={working}>
            {working ? <Loader2 className="size-4 animate-spin" /> : null}
            Registrar
          </Button>
        </div>
      </m.div>
    </m.div>
  )
}
