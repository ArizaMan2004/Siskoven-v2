"use client"

import { useEffect, useState } from "react"
import { Check, Landmark, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePricingSettings } from "@/hooks/use-pricing-settings"
import { formatMoney } from "@/lib/pricing"
import { type TaxSettings, computeTaxes } from "@/lib/taxes"

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Interruptor accesible: es un botón real, no un div con onClick. */
function Toggle({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  )
}

/**
 * IVA e IGTF.
 *
 * Los dos arrancan apagados: un comercio que no factura con IVA no debe
 * encontrarse cobrándolo de un día para otro por una actualización del sistema.
 */
export default function TaxSettingsCard() {
  const { taxes, saveTaxes, saving } = usePricingSettings()
  const [draft, setDraft] = useState<TaxSettings>(taxes)
  const [saved, setSaved] = useState(false)

  useEffect(() => setDraft(taxes), [taxes])

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [saved])

  const dirty = JSON.stringify(draft) !== JSON.stringify(taxes)

  const handleSave = async () => {
    try {
      await saveTaxes(draft)
      setSaved(true)
    } catch {
      /* el hook ya deja el error en consola */
    }
  }

  // Ejemplo en vivo: una venta de 100 pagada entera en efectivo en divisa.
  // Es el caso que más confunde, porque lleva los dos impuestos a la vez.
  const ejemplo = computeTaxes({
    lines: [{ amount: 100, ivaCategory: "general" }],
    settings: draft,
    montoEnDivisa: 100,
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="text-primary size-4" />
          Impuestos
        </CardTitle>
        <CardDescription>
          El IVA depende de qué vendes. El IGTF depende de en qué te pagan.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ------------------------------------------------------------ IVA */}
        <div className="space-y-3">
          <Toggle
            id="iva-enabled"
            checked={draft.ivaEnabled}
            onChange={(value) => setDraft({ ...draft, ivaEnabled: value })}
            label="Cobrar IVA"
            description="Desglosa el impuesto en la nota de entrega."
          />

          {draft.ivaEnabled && (
            <div className="border-border space-y-3 border-l-2 pl-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="iva-rate" className="text-sm font-medium">
                    Tasa general (%)
                  </label>
                  <Input
                    id="iva-rate"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.5"
                    value={draft.ivaRate}
                    onChange={(event) => setDraft({ ...draft, ivaRate: Number(event.target.value) || 0 })}
                  />
                  <p className="text-muted-foreground text-xs">En Venezuela, 16%.</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="iva-reduced" className="text-sm font-medium">
                    Tasa reducida (%)
                  </label>
                  <Input
                    id="iva-reduced"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.5"
                    value={draft.ivaReducedRate}
                    onChange={(event) =>
                      setDraft({ ...draft, ivaReducedRate: Number(event.target.value) || 0 })
                    }
                  />
                  <p className="text-muted-foreground text-xs">Para los rubros que la tengan.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="iva-included" className="text-sm font-medium">
                  Tus precios…
                </label>
                <select
                  id="iva-included"
                  className={SELECT_CLASS}
                  value={draft.pricesIncludeIva ? "incluido" : "aparte"}
                  onChange={(event) =>
                    setDraft({ ...draft, pricesIncludeIva: event.target.value === "incluido" })
                  }
                >
                  <option value="incluido">Ya llevan el IVA incluido</option>
                  <option value="aparte">Van sin IVA, se suma al final</option>
                </select>
                <p className="text-muted-foreground text-xs">
                  En una bodega el precio del anaquel es el que paga el cliente: IVA incluido. Una
                  distribuidora que factura a otros comercios suele cotizar sin IVA.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ----------------------------------------------------------- IGTF */}
        <div className="space-y-3 border-t pt-4">
          <Toggle
            id="igtf-enabled"
            checked={draft.igtfEnabled}
            onChange={(value) => setDraft({ ...draft, igtfEnabled: value })}
            label="Cobrar IGTF"
            description="Solo sobre la parte que el cliente paga en divisas o cripto."
          />

          {draft.igtfEnabled && (
            <div className="border-border space-y-1.5 border-l-2 pl-4">
              <label htmlFor="igtf-rate" className="text-sm font-medium">
                Tasa del IGTF (%)
              </label>
              <Input
                id="igtf-rate"
                type="number"
                inputMode="decimal"
                min="0"
                max="20"
                step="0.5"
                value={draft.igtfRate}
                onChange={(event) => setDraft({ ...draft, igtfRate: Number(event.target.value) || 0 })}
                className="max-w-40"
              />
              <p className="text-muted-foreground text-xs">
                Hoy en Venezuela es 3%. Se cobra sobre el efectivo en divisas, Zelle y Binance; los
                pagos en bolívares no lo causan.
              </p>
            </div>
          )}
        </div>

        {/* -------------------------------------------------------- ejemplo */}
        <div className="rounded-lg border border-dashed p-3 text-sm">
          <p className="mb-2 font-medium">Ejemplo: una venta de $100 pagada en efectivo en divisas</p>
          <dl className="space-y-1">
            {draft.ivaEnabled && (
              <>
                <div className="text-muted-foreground flex justify-between">
                  <dt>Base imponible</dt>
                  <dd className="tabular-nums">{formatMoney(ejemplo.baseImponible)}</dd>
                </div>
                <div className="text-muted-foreground flex justify-between">
                  <dt>IVA ({draft.ivaRate}%)</dt>
                  <dd className="tabular-nums">{formatMoney(ejemplo.ivaTotal)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between">
              <dt>Total de la factura</dt>
              <dd className="tabular-nums font-medium">{formatMoney(ejemplo.totalFactura)}</dd>
            </div>
            {draft.igtfEnabled && (
              <div className="text-muted-foreground flex justify-between">
                <dt>IGTF ({draft.igtfRate}%)</dt>
                <dd className="tabular-nums">{formatMoney(ejemplo.igtf)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t pt-1">
              <dt className="font-semibold">El cliente paga</dt>
              <dd className="tabular-nums font-semibold">{formatMoney(ejemplo.totalAPagar)}</dd>
            </div>
          </dl>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving || !dirty} className="gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}
            {saving ? "Guardando" : saved ? "Guardado" : "Guardar impuestos"}
          </Button>
          {dirty && !saving && <span className="text-muted-foreground text-xs">Hay cambios sin guardar</span>}
        </div>
      </CardContent>
    </Card>
  )
}
