"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import {
  AlertTriangle,
  CalendarClock,
  HandCoins,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useRates } from "@/hooks/use-rates"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { StatCard } from "@/components/ui/stat-card"
import { EmptyState, PageHeader } from "@/components/ui/page-header"
import { ModalHeader, ModalShell } from "@/components/ui/modal-shell"
import { formatBs, formatMoney } from "@/lib/pricing"
import { reportFirestoreError } from "@/lib/sync-status"
import { listItem, popIn, staggerContainer } from "@/lib/motion"
import { METHOD_LABELS, USD_METHODS, BS_METHODS } from "@/lib/cash-service"
import {
  type Cliente,
  type CuentaPorCobrar,
  type DatosCliente,
  diasDeAtraso,
  guardarCliente,
  listarDeudas,
  listarClientes,
  registrarAbono,
  resumirCartera,
} from "@/lib/customers"

const SELECT_CLASS =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

type Pestaña = "clientes" | "cobrar"

/**
 * Clientes y lo que te deben.
 *
 * Las dos pestañas responden a las dos formas de llegar aquí: "quiero ver a
 * Yorbis" (buscas la persona) y "¿quién me debe?" (buscas la deuda). Meterlo
 * todo en una sola lista obliga a la segunda pregunta a recorrer la primera.
 */
export default function CustomersView() {
  const { user, negocioId, allows } = useAuth()
  const { rate } = useRates()

  const [pestaña, setPestaña] = useState<Pestaña>("clientes")
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [deudas, setDeudas] = useState<CuentaPorCobrar[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState("")

  const [editando, setEditando] = useState<Cliente | null>(null)
  const [creando, setCreando] = useState(false)
  const [abriendo, setAbriendo] = useState<Cliente | null>(null)
  const [cobrando, setCobrando] = useState<CuentaPorCobrar | null>(null)

  const puedeGestionar = allows("customers.manage")
  const puedeCobrar = allows("receivables.collect")

  const cargar = useCallback(async () => {
    if (!negocioId) return
    setLoading(true)

    try {
      const [nuevosClientes, nuevasDeudas] = await Promise.all([
        listarClientes(negocioId),
        listarDeudas({ negocioId, soloPendientes: true }),
      ])

      setClientes(nuevosClientes)
      setDeudas(nuevasDeudas)
    } catch (error) {
      reportFirestoreError(error)
    } finally {
      setLoading(false)
    }
  }, [negocioId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const cartera = useMemo(() => resumirCartera(deudas), [deudas])

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return clientes

    return clientes.filter(
      (cliente) =>
        cliente.nombre.toLowerCase().includes(texto) ||
        cliente.documento?.toLowerCase().includes(texto) ||
        cliente.telefono?.includes(texto),
    )
  }, [clientes, busqueda])

  // Lo vencido primero, y dentro de eso lo más atrasado: es el orden en que se
  // hacen las llamadas.
  const deudasOrdenadas = useMemo(
    () =>
      [...deudas].sort((a, b) => {
        const atrasoA = diasDeAtraso(a) ?? -9999
        const atrasoB = diasDeAtraso(b) ?? -9999
        return atrasoB - atrasoA
      }),
    [deudas],
  )

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" aria-hidden />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clientes"
        description="Quién te compra y quién te debe"
        actions={
          puedeGestionar ? (
            <Button onClick={() => setCreando(true)} className="gap-2">
              <Plus className="size-4" aria-hidden />
              Nuevo cliente
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Clientes" value={String(clientes.length)} icon={Users} />
        <StatCard
          label="Te deben"
          value={formatMoney(cartera.totalUsd)}
          hint={rate ? formatBs(cartera.totalUsd * rate) : undefined}
          icon={HandCoins}
        />
        <StatCard
          label="Ya vencido"
          value={formatMoney(cartera.vencidoUsd)}
          hint={cartera.vencidoUsd > 0 ? "Pasó de su fecha" : "Nada atrasado"}
          icon={AlertTriangle}
        />
        <StatCard
          label="Con deuda"
          value={String(cartera.clientesConDeuda)}
          hint={`de ${clientes.length}`}
          icon={UserRound}
        />
      </div>

      <div className="bg-muted inline-flex w-full rounded-lg p-1 sm:w-auto">
        {[
          { id: "clientes" as const, label: "Todos" },
          { id: "cobrar" as const, label: `Por cobrar (${deudas.length})` },
        ].map((opcion) => (
          <button
            key={opcion.id}
            type="button"
            onClick={() => setPestaña(opcion.id)}
            className={`relative flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
              pestaña === opcion.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {pestaña === opcion.id && (
              <m.span
                layoutId="tab-clientes"
                className="bg-background absolute inset-0 rounded-md shadow-sm"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{opcion.label}</span>
          </button>
        ))}
      </div>

      {pestaña === "clientes" ? (
        <>
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Buscar por nombre, cédula o teléfono"
              className="pl-9"
            />
          </div>

          {filtrados.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  icon={Users}
                  title={busqueda ? "Nadie con ese nombre" : "Todavía no tienes clientes"}
                  description={
                    busqueda
                      ? "Prueba con parte del nombre, o con la cédula."
                      : "Registrar a quien te compra sirve para dos cosas: facturarle con sus datos sin volver a preguntárselos, y poder fiarle sabiendo cuánto debe."
                  }
                  action={
                    !busqueda && puedeGestionar ? (
                      <Button onClick={() => setCreando(true)} className="gap-2">
                        <Plus className="size-4" aria-hidden />
                        Registrar el primero
                      </Button>
                    ) : null
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <m.ul
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="divide-border divide-y"
                >
                  {filtrados.map((cliente, indice) => (
                    <m.li key={cliente.id} custom={indice} variants={listItem}>
                      <button
                        type="button"
                        onClick={() => setAbriendo(cliente)}
                        className="hover:bg-muted/40 flex w-full items-center gap-3 p-4 text-left transition-colors"
                      >
                        <span
                          className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold"
                          aria-hidden
                        >
                          {cliente.nombre.charAt(0).toUpperCase()}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 font-medium">
                            <span className="truncate">{cliente.nombre}</span>
                            {!cliente.activo && (
                              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px]">
                                inactivo
                              </span>
                            )}
                          </p>
                          <p className="text-muted-foreground truncate text-sm">
                            {[cliente.documento, cliente.telefono].filter(Boolean).join(" · ") ||
                              "Sin datos de contacto"}
                          </p>
                        </div>

                        {cliente.saldoDeudaUsd > 0 ? (
                          <span className="shrink-0 text-right">
                            <span className="text-destructive block font-semibold tabular-nums">
                              {formatMoney(cliente.saldoDeudaUsd)}
                            </span>
                            <span className="text-muted-foreground text-xs">debe</span>
                          </span>
                        ) : null}
                      </button>
                    </m.li>
                  ))}
                </m.ul>
              </CardContent>
            </Card>
          )}
        </>
      ) : deudas.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={HandCoins}
              title="No te debe nadie"
              description="Cuando vendas fiado, la deuda aparece aquí con su fecha para que sepas a quién llamar."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <m.ul
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="divide-border divide-y"
            >
              {deudasOrdenadas.map((deuda, indice) => {
                const atraso = diasDeAtraso(deuda)
                const vencida = atraso !== null && atraso > 0

                return (
                  <m.li
                    key={deuda.id}
                    custom={indice}
                    variants={listItem}
                    className="flex flex-wrap items-center gap-3 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{deuda.clienteNombre}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        {deuda.numeroDocumento ? (
                          <span className="text-muted-foreground">{deuda.numeroDocumento}</span>
                        ) : null}

                        {atraso === null ? (
                          <span className="text-muted-foreground">Sin fecha de pago</span>
                        ) : vencida ? (
                          <span className="text-destructive font-medium">
                            {atraso} {atraso === 1 ? "día" : "días"} de atraso
                          </span>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <CalendarClock className="size-3" aria-hidden />
                            vence en {Math.abs(atraso)} {Math.abs(atraso) === 1 ? "día" : "días"}
                          </span>
                        )}

                        {deuda.abonadoUsd > 0 && (
                          <span className="text-muted-foreground">
                            · abonó {formatMoney(deuda.abonadoUsd)} de {formatMoney(deuda.montoUsd)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className={`font-semibold tabular-nums ${vencida ? "text-destructive" : ""}`}
                      >
                        {formatMoney(deuda.saldoUsd)}
                      </p>
                      {rate ? (
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {formatBs(deuda.saldoUsd * rate)}
                        </p>
                      ) : null}
                    </div>

                    {puedeCobrar && (
                      <Button size="sm" onClick={() => setCobrando(deuda)} className="shrink-0">
                        Abonar
                      </Button>
                    )}
                  </m.li>
                )
              })}
            </m.ul>
          </CardContent>
        </Card>
      )}

      <AnimatePresence>
        {(creando || editando) && (
          <DialogoCliente
            cliente={editando}
            onClose={() => {
              setCreando(false)
              setEditando(null)
            }}
            onGuardado={cargar}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {abriendo && (
          <FichaCliente
            cliente={abriendo}
            onClose={() => setAbriendo(null)}
            onEditar={() => {
              setEditando(abriendo)
              setAbriendo(null)
            }}
            onCobrar={(deuda) => {
              setCobrando(deuda)
              setAbriendo(null)
            }}
            puedeGestionar={puedeGestionar}
            puedeCobrar={puedeCobrar}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cobrando && (
          <DialogoAbono
            deuda={cobrando}
            onClose={() => setCobrando(null)}
            onAbonado={cargar}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------

function DialogoCliente({
  cliente,
  onClose,
  onGuardado,
}: {
  cliente: Cliente | null
  onClose: () => void
  onGuardado: () => Promise<void>
}) {
  const { user, negocioId } = useAuth()
  const [datos, setDatos] = useState<DatosCliente>({
    nombre: cliente?.nombre ?? "",
    documento: cliente?.documento ?? "",
    telefono: cliente?.telefono ?? "",
    email: cliente?.email ?? "",
    direccion: cliente?.direccion ?? "",
    notas: cliente?.notas ?? "",
    limiteCreditoUsd: cliente?.limiteCreditoUsd ?? 0,
  })
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState("")

  const guardar = async () => {
    if (!user || !negocioId) return
    if (!datos.nombre.trim()) {
      setError("El nombre hace falta: es por lo que vas a buscarlo.")
      return
    }

    setTrabajando(true)
    try {
      await guardarCliente({
        negocioId,
        clienteId: cliente?.id ?? null,
        datos,
        creadoPor: user.uid,
      })
      await onGuardado()
      onClose()
    } catch (fallo) {
      reportFirestoreError(fallo)
      setError("No se pudo guardar el cliente.")
      setTrabajando(false)
    }
  }

  const campo = (clave: keyof DatosCliente, valor: string) =>
    setDatos((previo) => ({ ...previo, [clave]: valor }))

  return (
    <ModalShell onClose={onClose} title={cliente ? "Editar cliente" : "Nuevo cliente"}>
      <ModalHeader
        title={cliente ? "Editar cliente" : "Nuevo cliente"}
        description="Solo el nombre es obligatorio. Lo demás lo puedes completar después."
        onClose={onClose}
      />

      <div className="space-y-3">
        <div>
          <label htmlFor="cliente-nombre" className="mb-1.5 block text-sm font-medium">
            Nombre o razón social
          </label>
          <Input
            id="cliente-nombre"
            value={datos.nombre}
            onChange={(evento) => campo("nombre", evento.target.value)}
            placeholder="Yorbis Rodríguez"
            autoFocus
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cliente-documento" className="mb-1.5 block text-sm font-medium">
              Cédula o RIF
            </label>
            <Input
              id="cliente-documento"
              value={datos.documento}
              onChange={(evento) => campo("documento", evento.target.value)}
              placeholder="V-12345678"
            />
          </div>

          <div>
            <label htmlFor="cliente-telefono" className="mb-1.5 block text-sm font-medium">
              Teléfono
            </label>
            <Input
              id="cliente-telefono"
              value={datos.telefono}
              onChange={(evento) => campo("telefono", evento.target.value)}
              placeholder="0414-1234567"
              inputMode="tel"
            />
          </div>
        </div>

        <div>
          <label htmlFor="cliente-direccion" className="mb-1.5 block text-sm font-medium">
            Dirección
          </label>
          <Input
            id="cliente-direccion"
            value={datos.direccion}
            onChange={(evento) => campo("direccion", evento.target.value)}
            placeholder="Av. Principal, local 4"
          />
        </div>

        <div>
          <label htmlFor="cliente-limite" className="mb-1.5 block text-sm font-medium">
            Hasta cuánto se le puede fiar
          </label>
          <Input
            id="cliente-limite"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={datos.limiteCreditoUsd || ""}
            onChange={(evento) =>
              setDatos((previo) => ({
                ...previo,
                limiteCreditoUsd: Number(evento.target.value) || 0,
              }))
            }
            placeholder="0"
          />
          <p className="text-muted-foreground mt-1.5 text-xs">
            En divisa. Déjalo en cero para no poner tope: cero significa sin límite, no
            &ldquo;no se le fía&rdquo;. Para eso último, desactiva al cliente.
          </p>
        </div>

        <div>
          <label htmlFor="cliente-notas" className="mb-1.5 block text-sm font-medium">
            Notas
          </label>
          <Input
            id="cliente-notas"
            value={datos.notas}
            onChange={(evento) => campo("notas", evento.target.value)}
            placeholder="Paga los viernes"
          />
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={trabajando} className="flex-1">
            {trabajando && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Guardar
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------

function FichaCliente({
  cliente,
  onClose,
  onEditar,
  onCobrar,
  puedeGestionar,
  puedeCobrar,
}: {
  cliente: Cliente
  onClose: () => void
  onEditar: () => void
  onCobrar: (deuda: CuentaPorCobrar) => void
  puedeGestionar: boolean
  puedeCobrar: boolean
}) {
  const { negocioId } = useAuth()
  const [deudas, setDeudas] = useState<CuentaPorCobrar[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!negocioId) return
    let cancelado = false

    listarDeudas({ negocioId, clienteId: cliente.id })
      .then((resultado) => {
        if (!cancelado) setDeudas(resultado)
      })
      .catch(reportFirestoreError)
      .finally(() => {
        if (!cancelado) setCargando(false)
      })

    return () => {
      cancelado = true
    }
  }, [negocioId, cliente.id])

  const pendientes = deudas.filter((deuda) => deuda.estado !== "pagada")

  return (
    <m.div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <m.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        onClick={(evento) => evento.stopPropagation()}
        className="bg-card flex h-full w-full max-w-md flex-col border-l shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{cliente.nombre}</h3>
            <p className="text-muted-foreground truncate text-sm">
              {[cliente.documento, cliente.telefono].filter(Boolean).join(" · ") || "Sin contacto"}
            </p>
          </div>

          <div className="flex shrink-0 gap-1">
            {puedeGestionar && (
              <Button variant="ghost" size="icon" onClick={onEditar} aria-label="Editar">
                <Pencil className="size-4" aria-hidden />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
              <X className="size-5" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">Debe ahora</p>
              <p
                className={`mt-1 text-xl font-semibold tabular-nums ${
                  cliente.saldoDeudaUsd > 0 ? "text-destructive" : ""
                }`}
              >
                {formatMoney(cliente.saldoDeudaUsd)}
              </p>
            </div>

            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">Tope de fiado</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {cliente.limiteCreditoUsd > 0 ? formatMoney(cliente.limiteCreditoUsd) : "Sin tope"}
              </p>
            </div>
          </div>

          {cliente.direccion ? (
            <p className="text-muted-foreground text-sm">{cliente.direccion}</p>
          ) : null}

          {cliente.notas ? (
            <p className="bg-muted/40 rounded-md px-3 py-2 text-sm">{cliente.notas}</p>
          ) : null}

          {cliente.telefono ? (
            <a
              href={`tel:${cliente.telefono.replace(/[^\d+]/g, "")}`}
              className="text-primary flex items-center gap-2 text-sm font-medium"
            >
              <Phone className="size-4" aria-hidden />
              Llamar a {cliente.telefono}
            </a>
          ) : null}

          <div>
            <p className="mb-2 font-medium">
              Deudas {pendientes.length > 0 && `(${pendientes.length} sin pagar)`}
            </p>

            {cargando ? (
              <div className="flex justify-center py-8">
                <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden />
              </div>
            ) : deudas.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nunca le has fiado nada. Cuando lo hagas, aparece aquí.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {deudas.map((deuda) => {
                  const atraso = diasDeAtraso(deuda)
                  const pagada = deuda.estado === "pagada"

                  return (
                    <li key={deuda.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {deuda.numeroDocumento || "Sin número"}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {deuda.fecha?.toDate?.().toLocaleDateString("es-VE", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {pagada
                            ? " · pagada"
                            : atraso !== null && atraso > 0
                              ? ` · ${atraso} días de atraso`
                              : ""}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={`text-sm font-semibold tabular-nums ${
                            pagada ? "text-muted-foreground line-through" : ""
                          }`}
                        >
                          {formatMoney(pagada ? deuda.montoUsd : deuda.saldoUsd)}
                        </span>

                        {!pagada && puedeCobrar && (
                          <Button size="sm" variant="outline" onClick={() => onCobrar(deuda)}>
                            Abonar
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </m.aside>
    </m.div>
  )
}

// ---------------------------------------------------------------------------

function DialogoAbono({
  deuda,
  onClose,
  onAbonado,
}: {
  deuda: CuentaPorCobrar
  onClose: () => void
  onAbonado: () => Promise<void>
}) {
  const { user, negocioId } = useAuth()
  const { rate } = useRates()

  const [monto, setMonto] = useState("")
  const [metodo, setMetodo] = useState<string>("cash")
  const [nota, setNota] = useState("")
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState("")

  const montoNumero = Number(monto) || 0
  const restante = Math.round((deuda.saldoUsd - montoNumero) * 100) / 100

  const registrar = async () => {
    if (!user || !negocioId) return

    setTrabajando(true)
    setError("")
    try {
      const resultado = await registrarAbono({
        negocioId,
        deuda,
        montoUsd: montoNumero,
        metodo,
        nota,
        registradoPor: user.uid,
      })

      await onAbonado()
      onClose()
      void resultado
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo registrar el abono.")
      setTrabajando(false)
    }
  }

  return (
    <ModalShell onClose={onClose} title="Registrar abono">
      <ModalHeader
        title="Registrar abono"
        description={`${deuda.clienteNombre} debe ${formatMoney(deuda.saldoUsd)}`}
        onClose={onClose}
      />

      <div className="space-y-4">
        <div>
          <label htmlFor="abono-monto" className="mb-1.5 block text-sm font-medium">
            Cuánto abona
          </label>
          <Input
            id="abono-monto"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={monto}
            onChange={(evento) => setMonto(evento.target.value)}
            placeholder="0,00"
            autoFocus
          />

          {/* Pagar todo de un golpe es el caso más común, y teclear el importe
              exacto invita a equivocarse por un centavo. */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-1.5 h-7 px-2 text-xs"
            onClick={() => setMonto(String(deuda.saldoUsd))}
          >
            Paga todo ({formatMoney(deuda.saldoUsd)})
          </Button>

          {montoNumero > 0 && rate ? (
            <p className="text-muted-foreground mt-1 text-xs tabular-nums">
              son {formatBs(montoNumero * rate)} a la tasa de hoy
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="abono-metodo" className="mb-1.5 block text-sm font-medium">
            Con qué paga
          </label>
          <select
            id="abono-metodo"
            value={metodo}
            onChange={(evento) => setMetodo(evento.target.value)}
            className={SELECT_CLASS}
          >
            <optgroup label="En divisa">
              {USD_METHODS.map((id) => (
                <option key={id} value={id}>
                  {METHOD_LABELS[id] ?? id}
                </option>
              ))}
            </optgroup>
            <optgroup label="En bolívares">
              {BS_METHODS.map((id) => (
                <option key={id} value={id}>
                  {METHOD_LABELS[id] ?? id}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div>
          <label htmlFor="abono-nota" className="mb-1.5 block text-sm font-medium">
            Nota <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <Input
            id="abono-nota"
            value={nota}
            onChange={(evento) => setNota(evento.target.value)}
            placeholder="Referencia del pago móvil"
          />
        </div>

        {montoNumero > 0 && montoNumero <= deuda.saldoUsd ? (
          <p
            className={`rounded-md px-3 py-2 text-sm ${
              restante < 0.01 ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            {restante < 0.01
              ? "Con esto queda saldada."
              : `Después de este abono le quedarían ${formatMoney(restante)}.`}
          </p>
        ) : null}

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={registrar}
            disabled={trabajando || montoNumero <= 0}
            className="flex-1"
          >
            {trabajando && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Registrar
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
