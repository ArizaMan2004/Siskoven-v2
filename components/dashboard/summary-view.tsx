"use client"

import { useCallback, useEffect, useState } from "react"
import { m } from "framer-motion"
import { Info, Loader2, TrendingDown, TrendingUp } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useRates } from "@/hooks/use-rates"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { formatBs, formatMoney } from "@/lib/pricing"
import { reportFirestoreError } from "@/lib/sync-status"
import { TIPOS_GASTO } from "@/lib/expenses"
import {
  type Periodo,
  type ResumenFinanciero,
  calcularResumen,
  etiquetaPeriodo,
  periodosHabituales,
  veredicto,
} from "@/lib/summary"
import { fadeUp, listItem, staggerContainer } from "@/lib/motion"

const PERIODOS = periodosHabituales()

/**
 * Resumen: si el negocio gana o pierde.
 *
 * La pantalla es una cuenta de arriba abajo, no un mosaico de tarjetas. Las
 * tarjetas sueltas dan cinco números sin relación entre sí; una cuenta enseña de
 * dónde sale cada resta, que es justo lo que hay que entender para poder
 * cambiarlo. La cifra grande va abajo, como en cualquier factura.
 */
export default function SummaryView() {
  const { negocioId, allows } = useAuth()
  const { rate } = useRates()

  const [periodo, setPeriodo] = useState<Periodo>(PERIODOS[2])
  const [resumen, setResumen] = useState<ResumenFinanciero | null>(null)
  const [loading, setLoading] = useState(true)

  const puedeVerCostos = allows("costs.view")

  const cargar = useCallback(async () => {
    if (!negocioId) return
    setLoading(true)

    try {
      setResumen(await calcularResumen({ negocioId, periodo }))
    } catch (error) {
      reportFirestoreError(error)
      setResumen(null)
    } finally {
      setLoading(false)
    }
  }, [negocioId, periodo])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const juicio = resumen ? veredicto(resumen) : null

  return (
    <div className="space-y-5">
      <PageHeader title="Resumen" description="Si el negocio gana o pierde, y por qué" />

      <div className="flex flex-wrap gap-2">
        {PERIODOS.map((opcion) => {
          const activo = opcion.label === periodo.label

          return (
            <button
              key={opcion.label}
              type="button"
              onClick={() => setPeriodo(opcion)}
              className={`relative rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                activo
                  ? "border-primary/40 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {activo && (
                <m.span
                  layoutId="periodo-resumen"
                  className="bg-primary/10 absolute inset-0 rounded-full"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{opcion.label}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="text-muted-foreground size-6 animate-spin" aria-hidden />
        </div>
      ) : !resumen ? (
        <Card>
          <CardContent className="text-muted-foreground pt-6 text-sm">
            No se pudieron cargar los datos de este período.
          </CardContent>
        </Card>
      ) : (
        <>
          {juicio && (
            <m.div variants={fadeUp} initial="hidden" animate="visible">
              <Card
                className={
                  juicio.tono === "bien"
                    ? "border-success/40 bg-success/5"
                    : juicio.tono === "mal"
                      ? "border-destructive/40 bg-destructive/5"
                      : juicio.tono === "justo"
                        ? "border-warning/40 bg-warning/5"
                        : ""
                }
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    {juicio.tono === "mal" ? (
                      <TrendingDown className="text-destructive mt-1 size-6 shrink-0" aria-hidden />
                    ) : juicio.tono === "bien" ? (
                      <TrendingUp className="text-success mt-1 size-6 shrink-0" aria-hidden />
                    ) : null}

                    <div>
                      <p className="text-xl font-semibold tracking-tight sm:text-2xl">
                        {juicio.titular}
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">{juicio.explicacion}</p>
                      <p className="text-muted-foreground mt-2 text-xs">
                        {etiquetaPeriodo(periodo)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </m.div>
          )}

          {/* La confesión va arriba del todo, no en una nota al pie. Si el número
              está inflado, hay que saberlo ANTES de leerlo. */}
          {resumen.ventasSinCosto > 0 && puedeVerCostos && (
            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="flex items-start gap-3 pt-6">
                <Info
                  className="text-warning-foreground dark:text-warning mt-0.5 size-5 shrink-0"
                  aria-hidden
                />
                <div className="text-sm">
                  <p className="font-medium">
                    La utilidad está inflada: faltan costos en {resumen.ventasSinCosto}{" "}
                    {resumen.ventasSinCosto === 1 ? "venta" : "ventas"}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Son {formatMoney(resumen.ventasSinCostoUsd)} vendidos cuya mercancía se anotó
                    sin costo, porque quien facturó no tiene permiso para ver los costos. Esas
                    ventas están contando como si fueran ganancia entera. Ponle el costo a esos
                    productos en el inventario para que la cuenta cierre.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <m.ul
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="space-y-1"
              >
                <Linea
                  indice={0}
                  etiqueta="Ventas"
                  detalle={`${resumen.numeroVentas} ${resumen.numeroVentas === 1 ? "venta" : "ventas"}`}
                  montoUsd={resumen.ventasUsd}
                  rate={rate}
                />

                {puedeVerCostos && (
                  <>
                    <Linea
                      indice={1}
                      etiqueta="Costo de lo vendido"
                      detalle="Lo que te costó la mercancía que salió"
                      montoUsd={-resumen.costoVendidoUsd}
                      rate={rate}
                    />

                    <Subtotal
                      indice={2}
                      etiqueta="Utilidad bruta"
                      detalle={`Margen del ${resumen.margenBrutoPct.toFixed(1)}%`}
                      montoUsd={resumen.utilidadBrutaUsd}
                      rate={rate}
                    />
                  </>
                )}

                <Linea
                  indice={3}
                  etiqueta="Gastos de operar"
                  detalle="Fijos, variables y discrecionales"
                  montoUsd={-resumen.gastos.costoOperativoUsd}
                  rate={rate}
                />

                {/* El desglose de gastos, indentado bajo su línea: se ve de dónde
                    sale la resta sin tener que cambiar de pantalla. */}
                <li className="border-border/60 ml-4 border-l pl-4">
                  <ul className="space-y-1 py-1">
                    {TIPOS_GASTO.filter((tipo) => tipo.afectaUtilidad).map((tipo) => {
                      const monto = resumen.gastos.porTipo[tipo.id] ?? 0
                      if (monto <= 0) return null

                      return (
                        <li
                          key={tipo.id}
                          className="text-muted-foreground flex items-center justify-between gap-3 text-sm"
                        >
                          <span>{tipo.label}</span>
                          <span className="tabular-nums">{formatMoney(monto)}</span>
                        </li>
                      )
                    })}
                  </ul>
                </li>

                <Subtotal
                  indice={4}
                  etiqueta="Utilidad"
                  detalle={
                    puedeVerCostos
                      ? `${resumen.margenNetoPct.toFixed(1)}% de lo vendido`
                      : "Sin descontar el costo de la mercancía: no tienes permiso para verlo"
                  }
                  montoUsd={resumen.utilidadUsd}
                  rate={rate}
                  destacado
                />
              </m.ul>
            </CardContent>
          </Card>

          {/* Inversión y retiros: salieron del bolsillo, pero no son gastos del
              mes. Van fuera de la cuenta para no falsear la utilidad, y a la
              vista para que nadie se pregunte dónde fue a parar ese dinero. */}
          {(resumen.inversionUsd > 0 || resumen.retirosUsd > 0) && (
            <Card>
              <CardContent className="pt-6">
                <p className="font-semibold">Salidas que no son gastos</p>
                <p className="text-muted-foreground mt-0.5 mb-4 text-sm">
                  Salió dinero, pero no resta de la utilidad de arriba: una estantería sigue siendo
                  tuya, y repartirte lo que ganaste no es un costo de operar.
                </p>

                <ul className="divide-border divide-y">
                  {resumen.inversionUsd > 0 && (
                    <li className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium">Inversión</p>
                        <p className="text-muted-foreground text-xs">
                          Se convirtió en algo que el negocio conserva
                        </p>
                      </div>
                      <span className="font-semibold tabular-nums">
                        {formatMoney(resumen.inversionUsd)}
                      </span>
                    </li>
                  )}

                  {resumen.retirosUsd > 0 && (
                    <li className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium">Retiros</p>
                        <p className="text-muted-foreground text-xs">Lo que sacaste para ti</p>
                      </div>
                      <span className="font-semibold tabular-nums">
                        {formatMoney(resumen.retirosUsd)}
                      </span>
                    </li>
                  )}

                  <li className="flex items-center justify-between gap-3 py-2.5">
                    <p className="text-sm font-medium">
                      {resumen.utilidadUsd - resumen.retirosUsd >= 0
                        ? "Se quedó en el negocio"
                        : "Sacaste más de lo que ganó"}
                    </p>
                    <span
                      className={`font-semibold tabular-nums ${
                        resumen.utilidadUsd - resumen.retirosUsd < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {formatMoney(resumen.utilidadUsd - resumen.retirosUsd)}
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          )}

          {resumen.gastos.porCategoria.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="mb-4 font-semibold">En qué se fue</p>

                <ul className="space-y-3">
                  {resumen.gastos.porCategoria.slice(0, 8).map((entrada) => {
                    const proporcion =
                      resumen.gastos.totalSalidasUsd > 0
                        ? (entrada.totalUsd / resumen.gastos.totalSalidasUsd) * 100
                        : 0
                    const definicion = TIPOS_GASTO.find((tipo) => tipo.id === entrada.tipo)

                    return (
                      <li key={`${entrada.tipo}-${entrada.categoria}`}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{entrada.categoria}</span>
                            {definicion && !definicion.afectaUtilidad && (
                              <span className="text-muted-foreground shrink-0 text-xs">
                                no resta
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 font-medium tabular-nums">
                            {formatMoney(entrada.totalUsd)}
                          </span>
                        </div>
                        <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                          <div
                            className={
                              definicion?.afectaUtilidad
                                ? "bg-primary h-full"
                                : "bg-muted-foreground/40 h-full"
                            }
                            style={{ width: `${Math.min(proporcion, 100)}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Linea({
  indice,
  etiqueta,
  detalle,
  montoUsd,
  rate,
}: {
  indice: number
  etiqueta: string
  detalle?: string
  montoUsd: number
  rate: number | null
}) {
  const negativo = montoUsd < 0

  return (
    <m.li
      custom={indice}
      variants={listItem}
      className="flex items-start justify-between gap-3 py-2"
    >
      <div className="min-w-0">
        <p className="font-medium">{etiqueta}</p>
        {detalle ? <p className="text-muted-foreground text-xs">{detalle}</p> : null}
      </div>

      <div className="shrink-0 text-right">
        <p className={`font-semibold tabular-nums ${negativo ? "text-muted-foreground" : ""}`}>
          {negativo ? "−" : ""}
          {formatMoney(Math.abs(montoUsd))}
        </p>
        {rate ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatBs(Math.abs(montoUsd) * rate)}
          </p>
        ) : null}
      </div>
    </m.li>
  )
}

function Subtotal({
  indice,
  etiqueta,
  detalle,
  montoUsd,
  rate,
  destacado = false,
}: {
  indice: number
  etiqueta: string
  detalle?: string
  montoUsd: number
  rate: number | null
  destacado?: boolean
}) {
  return (
    <m.li
      custom={indice}
      variants={listItem}
      className={`flex items-start justify-between gap-3 border-t py-3 ${destacado ? "mt-1 border-t-2" : ""}`}
    >
      <div className="min-w-0">
        <p className={destacado ? "text-lg font-semibold" : "font-semibold"}>{etiqueta}</p>
        {detalle ? <p className="text-muted-foreground text-xs">{detalle}</p> : null}
      </div>

      <div className="shrink-0 text-right">
        <p
          className={`font-semibold tabular-nums ${
            destacado ? "text-xl sm:text-2xl" : ""
          } ${montoUsd < 0 ? "text-destructive" : destacado ? "text-success" : ""}`}
        >
          {formatMoney(montoUsd)}
        </p>
        {rate ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatBs(Math.abs(montoUsd) * rate)}
          </p>
        ) : null}
      </div>
    </m.li>
  )
}
