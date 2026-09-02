"use client"

import { m } from "framer-motion"
import { AlertTriangle, PackageX, PackageSearch, Boxes } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { formatMoney } from "@/lib/pricing"
import { fadeUp } from "@/lib/motion"
import type { ProductWithCost, ResumenStock } from "@/lib/products-service"

interface Props {
  resumen: ResumenStock
  /** Cuántos productos hay en total, para saber si merece la pena avisar. */
  totalProductos: number
  onVerProducto?: (producto: ProductWithCost) => void
}

/**
 * Alerta de inventario: qué se agotó y qué está por agotarse.
 *
 * Solo aparece cuando hay algo que decir. Una tarjeta permanente de "todo
 * bien" se convierte en parte del decorado y deja de leerse, y entonces
 * tampoco se lee el día que sí importa.
 */
export default function StockAlertCard({ resumen, totalProductos, onVerProducto }: Props) {
  const hayAlgo = resumen.agotados.length > 0 || resumen.bajos.length > 0

  // Nadie ha puesto mínimos todavía: en vez de callar, se explica para qué
  // sirven. Un aviso que nunca salta es un aviso roto.
  if (!hayAlgo && resumen.vigilados === 0 && totalProductos > 0) {
    return (
      <m.div variants={fadeUp} initial="hidden" animate="visible">
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 pt-6">
            <PackageSearch className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-medium">Nadie te va a avisar cuando algo se acabe</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Ponle un mínimo a los productos que no puedes dejar de tener. Cuando queden esa
                cantidad o menos, aparecerán aquí. Se hace al editar cada producto.
              </p>
            </div>
          </CardContent>
        </Card>
      </m.div>
    )
  }

  if (!hayAlgo) return null

  return (
    <m.div variants={fadeUp} initial="hidden" animate="visible">
      <Card className="border-warning/50 bg-warning/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="text-warning-foreground dark:text-warning mt-0.5 size-5 shrink-0"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {resumen.agotados.length > 0 && (
                  <>
                    {resumen.agotados.length}{" "}
                    {resumen.agotados.length === 1 ? "producto agotado" : "productos agotados"}
                  </>
                )}
                {resumen.agotados.length > 0 && resumen.bajos.length > 0 && " · "}
                {resumen.bajos.length > 0 && (
                  <>
                    {resumen.bajos.length}{" "}
                    {resumen.bajos.length === 1 ? "por agotarse" : "por agotarse"}
                  </>
                )}
              </p>

              <ul className="mt-3 space-y-1.5">
                {[...resumen.agotados, ...resumen.bajos].slice(0, 6).map((producto) => {
                  const agotado = (Number(producto.quantity) || 0) <= 0

                  return (
                    <li key={producto.id}>
                      <button
                        type="button"
                        onClick={() => onVerProducto?.(producto)}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {agotado ? (
                            <PackageX className="text-destructive size-4 shrink-0" aria-hidden />
                          ) : (
                            <Boxes
                              className="text-warning-foreground dark:text-warning size-4 shrink-0"
                              aria-hidden
                            />
                          )}
                          <span className="truncate text-sm">{producto.name}</span>
                        </span>

                        <span
                          className={`shrink-0 text-sm font-medium tabular-nums ${
                            agotado ? "text-destructive" : ""
                          }`}
                        >
                          {agotado
                            ? "agotado"
                            : `quedan ${producto.quantity}${
                                producto.stockMinimo ? ` de ${producto.stockMinimo}` : ""
                              }`}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              {resumen.agotados.length + resumen.bajos.length > 6 && (
                <p className="text-muted-foreground mt-2 px-2 text-xs">
                  y {resumen.agotados.length + resumen.bajos.length - 6} más.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </m.div>
  )
}

/** Valor del inventario, para la cabecera de Productos. */
export function StockValueCard({ resumen }: { resumen: ResumenStock }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 pt-6">
        <div>
          <p className="text-muted-foreground text-xs">Vale a precio de costo</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {/* Sin costos a la vista no se enseña un cero, que se leería como
                "tu inventario no vale nada". */}
            {resumen.valorCostoUsd !== null ? formatMoney(resumen.valorCostoUsd) : "—"}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">Lo que tienes invertido</p>
        </div>

        <div>
          <p className="text-muted-foreground text-xs">Vale a precio de venta</p>
          <p className="text-primary mt-1 text-xl font-semibold tabular-nums">
            {formatMoney(resumen.valorVentaUsd)}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">Si lo vendieras todo</p>
        </div>
      </CardContent>
    </Card>
  )
}
