"use client"

import { useEffect, useState } from "react"
import { Check, Coins, Loader2, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePricingSettings } from "@/hooks/use-pricing-settings"
import { useRates } from "@/hooks/use-rates"
import {
  BS_ROUNDING_OPTIONS,
  ROUNDING_OPTIONS,
  type PricingSettings,
  formatBs,
  formatMoney,
  roundTo,
} from "@/lib/pricing"

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * Ajustes de cómo se cobra en divisa. Antes el sistema aplicaba a la fuerza un
 * 30% de descuento y redondeaba al dólar entero; ahora el comercio decide, y
 * por defecto no se toca nada.
 */
export default function PricingSettingsCard() {
  const { settings, save, saving } = usePricingSettings()
  const { rate } = useRates()
  const [draft, setDraft] = useState<PricingSettings>(settings)
  const [saved, setSaved] = useState(false)

  useEffect(() => setDraft(settings), [settings])

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [saved])

  const handleSave = async () => {
    try {
      await save(draft)
      setSaved(true)
    } catch {
      /* el hook ya deja el error en consola */
    }
  }

  // Ejemplo en vivo con un precio de lista cualquiera, para que se entienda
  // el efecto de los ajustes sin tener que guardar y volver al inventario.
  const samplePrice = 12.37
  const discounted = samplePrice * (1 - (Number(draft.divisaDiscountPercent) || 0) / 100)
  const preview = roundTo(discounted, draft.divisaRounding, draft.divisaRoundingMode)
  const previewBs = rate ? roundTo(preview * rate, draft.bsRounding, draft.bsRoundingMode) : null

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4 text-primary" />
          Cómo cobras en divisa
        </CardTitle>
        <CardDescription>
          Opcional. Si no tocas nada, el precio que cobras es el mismo precio de lista, con sus céntimos.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="divisa-discount" className="text-sm font-medium">
              Descuento al pagar en divisa
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="divisa-discount"
                type="number"
                min="0"
                max="99"
                step="1"
                inputMode="decimal"
                value={draft.divisaDiscountPercent}
                onChange={(event) =>
                  setDraft({ ...draft, divisaDiscountPercent: Number(event.target.value) || 0 })
                }
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">0% = sin descuento.</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="divisa-rounding" className="text-sm font-medium">
              Redondeo del precio en divisa
            </label>
            <select
              id="divisa-rounding"
              className={SELECT_CLASS}
              value={draft.divisaRounding}
              onChange={(event) => setDraft({ ...draft, divisaRounding: Number(event.target.value) })}
            >
              {ROUNDING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Para no tener que dar vuelto en céntimos.</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="divisa-rounding-mode" className="text-sm font-medium">
              Hacia dónde redondea
            </label>
            <select
              id="divisa-rounding-mode"
              className={SELECT_CLASS}
              value={draft.divisaRoundingMode}
              disabled={!draft.divisaRounding}
              onChange={(event) =>
                setDraft({ ...draft, divisaRoundingMode: event.target.value as PricingSettings["divisaRoundingMode"] })
              }
            >
              <option value="nearest">Al más cercano</option>
              <option value="up">Siempre hacia arriba</option>
              <option value="down">Siempre hacia abajo</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="bs-rounding" className="text-sm font-medium">
              Redondeo del precio en bolívares
            </label>
            <select
              id="bs-rounding"
              className={SELECT_CLASS}
              value={draft.bsRounding}
              onChange={(event) => setDraft({ ...draft, bsRounding: Number(event.target.value) })}
            >
              {BS_ROUNDING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ----------------------------------------------------- impresión */}
        <div className="space-y-3 border-t pt-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Printer className="text-primary size-4" />
            Impresora de recibos
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="paper-width" className="text-sm font-medium">
                Ancho del papel
              </label>
              <select
                id="paper-width"
                className={SELECT_CLASS}
                value={draft.paperWidth}
                onChange={(event) =>
                  setDraft({ ...draft, paperWidth: Number(event.target.value) === 80 ? 80 : 58 })
                }
              >
                <option value={58}>58 mm (el rollo más común)</option>
                <option value={80}>80 mm (rollo ancho)</option>
              </select>
              <p className="text-muted-foreground text-xs">
                Mídelo o míralo en la caja del rollo. Con el ancho equivocado el recibo sale cortado
                o diminuto.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="auto-print" className="text-sm font-medium">
                Al confirmar una venta
              </label>
              <select
                id="auto-print"
                className={SELECT_CLASS}
                value={draft.autoPrint ? "auto" : "manual"}
                onChange={(event) => setDraft({ ...draft, autoPrint: event.target.value === "auto" })}
              >
                <option value="manual">Preguntar / imprimir a mano</option>
                <option value="auto">Imprimir el recibo automáticamente</option>
              </select>
              <p className="text-muted-foreground text-xs">
                La impresora debe estar instalada en el sistema como una impresora normal.
              </p>
            </div>
          </div>
        </div>

        {/* Vista previa: el mismo número en divisa y en bolívares */}
        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-sm">
          <p className="mb-1 font-medium">Ejemplo</p>
          <p className="text-muted-foreground">
            Un producto de lista a {formatMoney(samplePrice)} se cobraría a{" "}
            <span className="font-semibold text-foreground">{formatMoney(preview)}</span>
            {previewBs !== null ? (
              <>
                {" "}
                — es decir <span className="font-semibold text-foreground">{formatBs(previewBs)}</span>
              </>
            ) : (
              " (falta la tasa para ver los bolívares)"
            )}
            .
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving || !dirty} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saving ? "Guardando" : saved ? "Guardado" : "Guardar ajustes"}
          </Button>
          {dirty && !saving && <span className="text-xs text-muted-foreground">Hay cambios sin guardar</span>}
        </div>
      </CardContent>
    </Card>
  )
}
