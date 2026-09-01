"use client"

import { useCallback, useEffect, useState } from "react"
import { collection, getDocs, query, where } from "firebase/firestore"
import { m } from "framer-motion"
import { AlertTriangle, CheckCircle2, Loader2, TrendingDown } from "lucide-react"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { useRates } from "@/hooks/use-rates"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/pricing"
import { reportFirestoreError } from "@/lib/sync-status"
import { fadeUp } from "@/lib/motion"
import {
  type CapitalizationReport,
  type CurrentCosts,
  analyzeCapitalization,
  verdict,
} from "@/lib/capitalization"

interface CapitalizationCardProps {
  /** Inicio del período, en hora local (YYYY-MM-DD). Vacío = sin límite. */
  dateFrom?: string
  dateTo?: string
}

const TONE_STYLES = {
  good: {
    icon: CheckCircle2,
    box: "border-success/40 bg-success/10",
    text: "text-success",
  },
  warning: {
    icon: AlertTriangle,
    box: "border-warning/50 bg-warning/15",
    text: "text-warning-foreground dark:text-warning",
  },
  bad: {
    icon: TrendingDown,
    box: "border-destructive/40 bg-destructive/10",
    text: "text-destructive",
  },
}

/**
 * "¿Puedo reponer lo que vendí?"
 *
 * Solo la ve quien puede ver costos: el cálculo entero gira alrededor de a
 * cuánto compras.
 */
export default function CapitalizationCard({ dateFrom, dateTo }: CapitalizationCardProps) {
  const { user, negocioId, allows } = useAuth()
  const { rate } = useRates()
  const [report, setReport] = useState<CapitalizationReport | null>(null)
  const [loading, setLoading] = useState(true)

  const puedeVerCostos = allows("costs.view")

  const cargar = useCallback(async () => {
    if (!user || !negocioId || !puedeVerCostos) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const negocio = negocioId ?? user.uid

      const [ventasSnap, costosSnap, costosVentaSnap] = await Promise.all([
        getDocs(query(collection(db, "ventas"), where("negocioId", "==", negocio))),
        // El costo de HOY vive en su propia colección, que solo pueden leer
        // encargados y dueños. Ver lib/products-service.ts.
        getDocs(query(collection(db, "productos_costos"), where("negocioId", "==", negocio))),
        // El costo que tenía la mercancía CUANDO se vendió.
        getDocs(query(collection(db, "ventas_costos"), where("negocioId", "==", negocio))),
      ])

      const currentCosts: CurrentCosts = new Map()
      for (const document of costosSnap.docs) {
        const costo = Number(document.data().costUsd)
        if (Number.isFinite(costo) && costo > 0) currentCosts.set(document.id, costo)
      }

      // Las líneas con su costo histórico, emparejadas por id de venta.
      const costosPorVenta = new Map<string, Array<Record<string, unknown>>>()
      for (const document of costosVentaSnap.docs) {
        const items = document.data().items
        if (Array.isArray(items)) costosPorVenta.set(document.id, items)
      }

      const sales = ventasSnap.docs
        .map((document) => {
          const venta = document.data()
          const costos = costosPorVenta.get(document.id)
          if (!costos) return venta

          // Se reconstruye cada línea con su costo, que es lo que necesita el
          // análisis. La venta en sí nunca lo lleva dentro.
          const porProducto = new Map(costos.map((linea) => [linea.productId, linea]))
          return {
            ...venta,
            items: (venta.items ?? []).map((item: Record<string, unknown>) => ({
              ...item,
              costUsdUnit:
                Number((porProducto.get(item.productId) as { costUsdUnit?: number })?.costUsdUnit) || 0,
            })),
          }
        })
        .filter((venta) => {
          const fecha = venta.createdAt?.toDate?.()
          if (!fecha) return false
          // Comparación en hora local: en UTC las ventas de la tarde caerían
          // en el día siguiente y descuadrarían el corte del período.
          const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`
          if (dateFrom && clave < dateFrom) return false
          if (dateTo && clave > dateTo) return false
          return true
        }) as never[]

      setReport(analyzeCapitalization({ sales, currentCosts, rateNow: rate }))
    } catch (error) {
      console.error("Error analizando la reposición:", error)
      reportFirestoreError(error)
    } finally {
      setLoading(false)
    }
  }, [user, negocioId, puedeVerCostos, dateFrom, dateTo, rate])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (!puedeVerCostos) return null

  if (loading) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex items-center justify-center gap-2 py-10">
          <Loader2 className="size-4 animate-spin" />
          Calculando la reposición…
        </CardContent>
      </Card>
    )
  }

  if (!report) return null

  const veredicto = verdict(report)
  const tone = TONE_STYLES[veredicto.tone]
  const Icon = tone.icon

  return (
    <m.div variants={fadeUp} initial="hidden" animate="visible">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">¿Puedes reponer lo que vendiste?</CardTitle>
          <CardDescription>
            Compara lo que cobraste contra lo que cuesta hoy volver a comprar esa misma mercancía.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* El veredicto, que es lo único que mucha gente va a leer */}
          <div className={`flex items-start gap-3 rounded-lg border p-3.5 ${tone.box}`}>
            <Icon className={`mt-0.5 size-5 shrink-0 ${tone.text}`} aria-hidden />
            <div className="min-w-0">
              <p className={`font-semibold ${tone.text}`}>{veredicto.headline}</p>
              <p className="text-foreground/80 mt-0.5 text-sm">{veredicto.detail}</p>
            </div>
          </div>

          {report.unidadesVendidas > 0 && (
            <>
              {/* Las dos ganancias, una al lado de la otra */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Ganancia según los reportes</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {formatMoney(report.utilidadContableUsd)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Ingreso menos lo que te costó entonces
                  </p>
                </div>

                <div className="border-primary/40 bg-primary/5 rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Ganancia real</p>
                  <p
                    className={`mt-1 text-xl font-semibold tabular-nums ${
                      report.utilidadRealUsd < 0 ? "text-destructive" : "text-primary"
                    }`}
                  >
                    {formatMoney(report.utilidadRealUsd)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Lo que queda después de reponer
                  </p>
                </div>
              </div>

              {report.utilidadIlusoriaUsd > 0.01 && (
                <p className="text-muted-foreground text-sm">
                  De la ganancia que muestran los reportes,{" "}
                  <strong className="text-foreground">{formatMoney(report.utilidadIlusoriaUsd)}</strong>{" "}
                  se los come el aumento de los costos. No es dinero disponible: ya está comprometido
                  con el próximo pedido.
                </p>
              )}

              <dl className="divide-border divide-y text-sm">
                <div className="flex justify-between py-2">
                  <dt className="text-muted-foreground">Cobrado en el período</dt>
                  <dd className="tabular-nums">{formatMoney(report.ingresoUsd)}</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-muted-foreground">Te costó entonces</dt>
                  <dd className="tabular-nums">{formatMoney(report.costoHistoricoUsd)}</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-muted-foreground">Reponerlo cuesta hoy</dt>
                  <dd className="tabular-nums font-medium">{formatMoney(report.costoReposicionUsd)}</dd>
                </div>
              </dl>

              {/* Qué productos se encarecieron */}
              {report.productosCriticos.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">Los que más subieron</p>
                  <ul className="divide-border divide-y">
                    {report.productosCriticos.map((producto) => (
                      <li key={producto.productId} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm">{producto.name}</p>
                          <p className="text-muted-foreground text-xs tabular-nums">
                            {formatMoney(producto.costoAntes)} → {formatMoney(producto.costoHoy)} por unidad
                          </p>
                        </div>
                        <span className="text-destructive shrink-0 text-sm font-medium tabular-nums">
                          +{producto.variacion.toFixed(1)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* La erosión se declara aparte porque depende de un supuesto */}
              {report.erosionBsUsd > 0.01 && (
                <p className="text-muted-foreground border-t pt-3 text-xs">
                  Además, los bolívares que cobraste valen hoy{" "}
                  <strong className="text-foreground">{formatMoney(report.erosionBsUsd)}</strong> menos que
                  el día que entraron, porque la tasa subió. Esto solo te afecta si todavía los tienes
                  sin cambiar.
                </p>
              )}

              {report.productosSinDato > 0 && (
                <p className="text-muted-foreground text-xs">
                  {report.productosSinDato}{" "}
                  {report.productosSinDato === 1
                    ? "producto vendido ya no está en el inventario, así que no se pudo comparar su costo."
                    : "productos vendidos ya no están en el inventario, así que no se pudo comparar su costo."}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </m.div>
  )
}
