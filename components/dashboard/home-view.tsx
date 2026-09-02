"use client"

import { useCallback, useEffect, useState } from "react"
import { m } from "framer-motion"
import { collection, getDocs, query, where } from "firebase/firestore"
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  HandCoins,
  Loader2,
  PackageX,
  Receipt,
  ShoppingCart,
  Wallet,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useRates } from "@/hooks/use-rates"
import { db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatCard } from "@/components/ui/stat-card"
import { formatBs, formatMoney } from "@/lib/pricing"
import { reportFirestoreError } from "@/lib/sync-status"
import { getTurnoAbierto, type Turno } from "@/lib/cash-service"
import { listarDeudas, resumirCartera } from "@/lib/customers"
import { loadProductsWithCosts, resumirStock, type ResumenStock } from "@/lib/products-service"
import { listarGastos, resumirGastos } from "@/lib/expenses"
import { fadeUp, listItem, staggerContainer } from "@/lib/motion"

interface Props {
  /** Para que los accesos rápidos lleven de verdad a algún sitio. */
  irA: (vista: string) => void
}

/** "Buenos días" / "Buenas tardes" / "Buenas noches", según el reloj de quien mira. */
function saludo(): string {
  const hora = new Date().getHours()
  if (hora < 12) return "Buenos días"
  if (hora < 19) return "Buenas tardes"
  return "Buenas noches"
}

const HOY = () =>
  new Date().toLocaleDateString("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

interface ResumenHoy {
  ventas: number
  totalUsd: number
}

/**
 * Pantalla de inicio: qué pasa hoy y qué hace falta atender.
 *
 * No es un tablero de estadísticas. Para eso están Estadísticas y Resumen. Esto
 * responde a lo que se pregunta al abrir el sistema por la mañana: ¿está la caja
 * abierta?, ¿cuánto llevamos vendido?, ¿hay algo que se me esté escapando?
 *
 * Cada bloque depende de un permiso, así que un cajero ve tres cosas y el dueño
 * ocho. La alternativa —enseñar todo y tachar lo prohibido— convierte la primera
 * pantalla del día en un inventario de lo que no puedes hacer.
 */
export default function HomeView({ irA }: Props) {
  const { user, negocioId, allows, userData } = useAuth()
  const { rate } = useRates()

  const [turno, setTurno] = useState<Turno | null>(null)
  const [hoy, setHoy] = useState<ResumenHoy>({ ventas: 0, totalUsd: 0 })
  const [stock, setStock] = useState<ResumenStock | null>(null)
  const [porCobrarUsd, setPorCobrarUsd] = useState<number | null>(null)
  const [vencidoUsd, setVencidoUsd] = useState(0)
  const [gastoMesUsd, setGastoMesUsd] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const puedeVender = allows("sales.create")
  const puedeCaja = allows("cash.openShift")
  const puedeProductos = allows("products.view")
  const puedeClientes = allows("customers.view")
  const puedeGastos = allows("expenses.view")
  const puedeCostos = allows("costs.view")

  const cargar = useCallback(async () => {
    if (!negocioId || !user) return
    setLoading(true)

    // Todo en paralelo y cada cosa con su propio try: si el cajero no puede
    // leer los gastos, eso no puede tumbar el resto de la pantalla.
    const tareas: Array<Promise<unknown>> = []

    if (puedeCaja) {
      tareas.push(
        getTurnoAbierto(negocioId, user.uid)
          .then(setTurno)
          .catch(() => setTurno(null)),
      )
    }

    tareas.push(
      (async () => {
        try {
          const snapshot = await getDocs(
            query(collection(db, "ventas"), where("negocioId", "==", negocioId)),
          )

          const inicioDelDia = new Date()
          inicioDelDia.setHours(0, 0, 0, 0)

          // Quien no puede ver las ventas de todos ve solo las suyas, igual que
          // en la pantalla de ventas: los dos números tienen que coincidir.
          const soloMias = !allows("sales.viewAll")

          let ventas = 0
          let totalUsd = 0

          for (const documento of snapshot.docs) {
            const datos = documento.data()
            if (soloMias && datos.cajeroUid && datos.cajeroUid !== user.uid) continue

            const crudo = datos.createdAt
            const fecha =
              typeof crudo?.toDate === "function" ? crudo.toDate() : crudo ? new Date(crudo) : null
            if (!fecha || Number.isNaN(fecha.getTime()) || fecha < inicioDelDia) continue

            ventas += 1
            totalUsd += Number(datos.totalUsd) || 0
          }

          setHoy({ ventas, totalUsd: Math.round(totalUsd * 100) / 100 })
        } catch (error) {
          reportFirestoreError(error)
        }
      })(),
    )

    if (puedeProductos) {
      tareas.push(
        loadProductsWithCosts(negocioId)
          .then((productos) => setStock(resumirStock(productos)))
          .catch(() => setStock(null)),
      )
    }

    if (puedeClientes) {
      tareas.push(
        listarDeudas({ negocioId, soloPendientes: true })
          .then((deudas) => {
            const cartera = resumirCartera(deudas)
            setPorCobrarUsd(cartera.totalUsd)
            setVencidoUsd(cartera.vencidoUsd)
          })
          .catch(() => setPorCobrarUsd(null)),
      )
    }

    if (puedeGastos) {
      const inicioDelMes = new Date()
      inicioDelMes.setDate(1)
      inicioDelMes.setHours(0, 0, 0, 0)

      tareas.push(
        listarGastos({ negocioId, desde: inicioDelMes })
          .then((gastos) => setGastoMesUsd(resumirGastos(gastos).costoOperativoUsd))
          .catch(() => setGastoMesUsd(null)),
      )
    }

    await Promise.allSettled(tareas)
    setLoading(false)
  }, [negocioId, user, puedeCaja, puedeProductos, puedeClientes, puedeGastos, allows])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" aria-hidden />
      </div>
    )
  }

  const nombreCorto = (userData?.businessName ?? "").split(" ")[0]
  const alertas = construirAlertas({ stock, vencidoUsd, turno, puedeCaja })

  return (
    <div className="space-y-5">
      <m.div variants={fadeUp} initial="hidden" animate="visible">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {saludo()}
          {nombreCorto ? `, ${nombreCorto}` : ""}
        </h2>
        <p className="text-muted-foreground mt-0.5 text-sm capitalize">{HOY()}</p>
      </m.div>

      {/* El estado de la caja va primero y ocupa el ancho: es lo que decide si
          se puede trabajar o no. Enterarse a media mañana de que nadie abrió el
          turno significa que las ventas de toda la mañana no cuadran con nada. */}
      {puedeCaja && (
        <m.div variants={fadeUp} initial="hidden" animate="visible">
          <Card
            className={
              turno ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"
            }
          >
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
              <div className="flex items-start gap-3">
                <Wallet
                  className={`mt-0.5 size-5 shrink-0 ${
                    turno ? "text-success" : "text-warning-foreground dark:text-warning"
                  }`}
                  aria-hidden
                />
                <div>
                  <p className="font-semibold">
                    {turno ? "Tu caja está abierta" : "No tienes la caja abierta"}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {turno
                      ? `Desde las ${turno.abiertoEn?.toDate?.().toLocaleTimeString("es-VE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}. Al cerrar cuentas lo que hay y se compara con lo que debería haber.`
                      : "Ábrela antes de vender: es lo que permite cuadrar al final del turno."}
                  </p>
                </div>
              </div>

              <Button
                variant={turno ? "outline" : "default"}
                onClick={() => irA("cash")}
                className="shrink-0 gap-2"
              >
                {turno ? "Ver la caja" : "Abrir caja"}
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </CardContent>
          </Card>
        </m.div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label={allows("sales.viewAll") ? "Vendido hoy" : "Vendiste hoy"}
          value={formatMoney(hoy.totalUsd)}
          hint={rate ? formatBs(hoy.totalUsd * rate) : undefined}
          icon={CircleDollarSign}
        />
        <StatCard
          label="Ventas de hoy"
          value={String(hoy.ventas)}
          hint={
            hoy.ventas > 0
              ? `${formatMoney(hoy.totalUsd / hoy.ventas)} por venta`
              : "Todavía ninguna"
          }
          icon={ShoppingCart}
        />

        {puedeClientes && porCobrarUsd !== null && (
          <StatCard
            label="Te deben"
            value={formatMoney(porCobrarUsd)}
            hint={vencidoUsd > 0 ? `${formatMoney(vencidoUsd)} ya vencido` : undefined}
            icon={HandCoins}
          />
        )}

        {puedeGastos && gastoMesUsd !== null && (
          <StatCard
            label="Gastado este mes"
            value={formatMoney(gastoMesUsd)}
            hint="Sin contar inversión ni retiros"
            icon={Receipt}
          />
        )}

        {puedeProductos && stock && puedeCostos && (
          <StatCard
            label="Inventario"
            value={stock.valorCostoUsd !== null ? formatMoney(stock.valorCostoUsd) : "—"}
            hint="A precio de costo"
            icon={PackageX}
          />
        )}
      </div>

      {alertas.length > 0 && (
        <Card className="border-warning/40">
          <CardContent className="pt-6">
            <p className="mb-3 flex items-center gap-2 font-semibold">
              <AlertTriangle
                className="text-warning-foreground dark:text-warning size-4"
                aria-hidden
              />
              Cosas que atender
            </p>

            <m.ul
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="space-y-2"
            >
              {alertas.map((alerta, indice) => (
                <m.li key={alerta.texto} custom={indice} variants={listItem}>
                  <button
                    type="button"
                    onClick={() => irA(alerta.vista)}
                    className="hover:bg-muted/50 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors"
                  >
                    <span className="text-sm">{alerta.texto}</span>
                    <ArrowRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </button>
                </m.li>
              ))}
            </m.ul>
          </CardContent>
        </Card>
      )}

      <div>
        <p className="mb-2 text-sm font-medium">Ir directo a</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {puedeVender && (
            <AccesoRapido icon={ShoppingCart} label="Vender" onClick={() => irA("sales")} />
          )}
          {puedeCaja && <AccesoRapido icon={Wallet} label="Caja" onClick={() => irA("cash")} />}
          {puedeGastos && (
            <AccesoRapido icon={Receipt} label="Anotar gasto" onClick={() => irA("gastos")} />
          )}
          {puedeClientes && (
            <AccesoRapido icon={HandCoins} label="Cobrar" onClick={() => irA("clientes")} />
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function AccesoRapido({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Wallet
  label: string
  onClick: () => void
}) {
  return (
    <m.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="bg-card hover:border-primary/40 hover:bg-primary/5 flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-4 shadow-sm transition-colors"
    >
      <Icon className="text-primary size-6" aria-hidden />
      <span className="text-sm font-medium">{label}</span>
    </m.button>
  )
}

/**
 * Lo que reclama atención hoy, en orden de urgencia.
 *
 * Solo lo accionable: nada de "vas bien". Una lista que a veces está vacía se
 * lee entera; una que siempre tiene algo se ignora entera.
 */
function construirAlertas(params: {
  stock: ResumenStock | null
  vencidoUsd: number
  turno: Turno | null
  puedeCaja: boolean
}): Array<{ texto: string; vista: string }> {
  const alertas: Array<{ texto: string; vista: string }> = []

  if (params.vencidoUsd > 0) {
    alertas.push({
      texto: `${formatMoney(params.vencidoUsd)} en deudas que ya pasaron de su fecha`,
      vista: "clientes",
    })
  }

  const agotados = params.stock?.agotados.length ?? 0
  if (agotados > 0) {
    alertas.push({
      texto: `${agotados} ${agotados === 1 ? "producto agotado" : "productos agotados"}`,
      vista: "products",
    })
  }

  const bajos = params.stock?.bajos.length ?? 0
  if (bajos > 0) {
    alertas.push({
      texto: `${bajos} ${bajos === 1 ? "producto" : "productos"} por debajo del mínimo`,
      vista: "products",
    })
  }

  return alertas
}
