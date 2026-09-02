"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Check, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useRates } from "@/hooks/use-rates"
import { CURRENCY_SYMBOL, formatRateDate, rateLabel } from "@/lib/rates-service"

interface RateWidgetProps {
  /** Vista compacta para cabeceras; la completa incluye selector y tasa manual. */
  compact?: boolean
  className?: string
}

export default function RateWidget({ compact = false, className }: RateWidgetProps) {
  const { active, available, loading, error, refresh, select, setManual } = useRates()
  const [manualInput, setManualInput] = useState("")
  const [manualError, setManualError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [justSaved])

  const handleManualSave = () => {
    const value = Number.parseFloat(manualInput.replace(",", "."))
    if (!Number.isFinite(value) || value <= 0) {
      setManualError("Escribe una tasa mayor que cero.")
      return
    }
    setManualError(null)
    setManual(value)
    setManualInput("")
    setJustSaved(true)
  }

  const rateText = active
    ? `Bs ${active.rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "Sin tasa"

  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${className ?? ""}`}>
        <div className="leading-tight">
          <p className="text-xs text-muted-foreground">{active ? rateLabel(active) : "Tasa"}</p>
          <p className="text-lg font-semibold tabular-nums">{rateText}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void refresh()} disabled={loading} aria-label="Actualizar tasa">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>Tasa de cambio</span>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Actualizando" : "Actualizar"}
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg bg-primary/10 p-4">
          <p className="text-3xl font-bold tabular-nums text-primary sm:text-4xl">{rateText}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {active
              ? `${rateLabel(active)} · por 1 ${CURRENCY_SYMBOL[active.currency]} · ${formatRateDate(active.updatedAt)}`
              : "Todavía no hay tasa. Actualiza o escribe una a mano."}
          </p>
        </div>

        {/* Selector de las cuatro cotizaciones */}
        <div className="grid grid-cols-2 gap-2">
          {available.map(({ selection, label, value }) => {
            const isActive =
              active?.origin === selection.origin && active?.currency === selection.currency
            return (
              <button
                key={label}
                type="button"
                onClick={() => select(selection)}
                disabled={!value}
                className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  isActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <span className="block text-xs text-muted-foreground">{label}</span>
                <span className="block font-semibold tabular-nums">
                  {value ? value.rate.toLocaleString("es-VE", { maximumFractionDigits: 2 }) : "—"}
                </span>
              </button>
            )
          })}
        </div>

        {/* Tasa manual, para cuando el comercio cobra a una tasa propia */}
        <div className="space-y-2">
          <label htmlFor="manual-rate" className="text-sm text-muted-foreground">
            O usa tu propia tasa
          </label>
          <div className="flex gap-2">
            <Input
              id="manual-rate"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="Ej: 900.00"
              value={manualInput}
              onChange={(event) => setManualInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  handleManualSave()
                }
              }}
            />
            <Button onClick={handleManualSave} variant={justSaved ? "default" : "outline"} className="gap-2">
              {justSaved ? <Check className="h-4 w-4" /> : null}
              {justSaved ? "Guardada" : "Usar"}
            </Button>
          </div>
        </div>

        {(manualError || error) && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              {manualError ??
                `No se pudo actualizar la tasa (${error}). Se está usando la última tasa conocida.`}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
