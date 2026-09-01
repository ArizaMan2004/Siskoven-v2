import type { LucideIcon } from "lucide-react"
import { TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

export interface StatCardProps {
  label: string
  /** La cifra protagonista. Se pasa ya formateada. */
  value: string
  /** Línea secundaria: el mismo dato en otra moneda, o un detalle. */
  hint?: string
  icon?: LucideIcon
  /**
   * Variación respecto al período anterior, en porcentaje.
   * Se acompaña SIEMPRE de flecha y signo: el color por sí solo no sirve para
   * quien no distingue el verde del rojo.
   */
  deltaPercent?: number | null
  /** Cuando "menos es mejor" (por ejemplo, gastos). */
  invertDelta?: boolean
  className?: string
}

/**
 * Cifra destacada. No lleva gráfico: cuando el dato es un solo número, un
 * número grande y legible comunica mejor que cualquier gráfico.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  deltaPercent,
  invertDelta = false,
  className,
}: StatCardProps) {
  const hasDelta = typeof deltaPercent === "number" && Number.isFinite(deltaPercent)
  const isUp = hasDelta && deltaPercent! > 0
  const isFlat = hasDelta && Math.abs(deltaPercent!) < 0.05
  const isGood = invertDelta ? !isUp : isUp

  return (
    <div
      className={cn(
        // h-full para que las tarjetas de una misma fila midan igual aunque
        // una etiqueta ocupe dos líneas.
        "bg-card text-card-foreground h-full rounded-xl border p-4 shadow-sm sm:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm font-medium">{label}</p>
        {Icon ? <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden /> : null}
      </div>

      {/* En un teléfono estrecho "Bs 48.320,00" no cabe a 24px y se partía en
          dos líneas. Se reduce el cuerpo en móvil en vez de recortar la cifra:
          el importe exacto no se abrevia nunca. */}
      <p className="mt-2 text-lg leading-tight font-semibold tracking-tight tabular-nums sm:text-2xl lg:text-3xl">
        {value}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}

        {hasDelta && !isFlat ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-sm font-medium",
              isGood ? "text-success" : "text-destructive",
            )}
          >
            {isUp ? (
              <TrendingUp className="size-3.5" aria-hidden />
            ) : (
              <TrendingDown className="size-3.5" aria-hidden />
            )}
            {isUp ? "+" : ""}
            {deltaPercent!.toFixed(1)}%
          </span>
        ) : null}
      </div>
    </div>
  )
}
