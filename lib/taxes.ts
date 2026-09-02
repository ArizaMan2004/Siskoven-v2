// /lib/taxes.ts
//
// IVA e IGTF.
//
// Dos impuestos que funcionan de forma distinta y que es fácil confundir:
//
// · El IVA (16% general en Venezuela) grava la MERCANCÍA. Depende de qué
//   vendes: los alimentos y medicinas van exentos, el resto al 16%. Se calcula
//   sobre la base imponible, después de descuentos.
//
// · El IGTF (3%) grava la FORMA DE PAGO. No depende de qué vendes sino de en
//   qué te pagan: solo se cobra sobre la parte que el cliente paga en divisas o
//   cripto fuera del sistema bancario nacional. Si paga en bolívares por punto
//   de venta o pago móvil, no hay IGTF.
//
// Por eso el orden importa y no se puede invertir:
//
//   1. Suma de líneas               -> subtotal
//   2. Menos descuento              -> base imponible
//   3. Más IVA (por tasa)           -> TOTAL DE LA FACTURA
//   4. Sobre la parte pagada en divisa, 3%  -> IGTF
//   5. Total factura + IGTF         -> lo que el cliente entrega
//
// El IGTF va sobre el importe pagado en divisa CON su IVA incluido, y nunca
// entra en la base del IVA: son impuestos separados y el IVA no grava al IGTF.

export type IvaCategory = "general" | "reducido" | "exento"

export interface TaxSettings {
  ivaEnabled: boolean
  /** Tasa general, en porcentaje. En Venezuela, 16. */
  ivaRate: number
  /** Tasa reducida para los rubros que la tienen. En Venezuela, 8. */
  ivaReducedRate: number
  /**
   * Si los precios que escribes ya llevan el IVA dentro.
   *
   * En una bodega el precio del anaquel es el que paga el cliente, IVA
   * incluido: aquí va `true` y el sistema desglosa el impuesto hacia atrás.
   * En una distribuidora que factura a otros comercios los precios van sin
   * IVA y se suma al final: ahí va `false`.
   */
  pricesIncludeIva: boolean
  igtfEnabled: boolean
  /** Tasa del IGTF, en porcentaje. Hoy en Venezuela, 3. */
  igtfRate: number
  /** Métodos de pago que causan IGTF (los que entran en divisa). */
  igtfMethods: string[]
}

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  // Arranca apagado a propósito: un comercio que no factura con IVA no debe
  // encontrarse cobrándolo por sorpresa tras una actualización.
  ivaEnabled: false,
  ivaRate: 16,
  ivaReducedRate: 8,
  pricesIncludeIva: true,
  igtfEnabled: false,
  igtfRate: 3,
  igtfMethods: ["cash", "zelle", "binance"],
}

export const IVA_CATEGORY_LABELS: Record<IvaCategory, string> = {
  general: "Gravado (tasa general)",
  reducido: "Tasa reducida",
  exento: "Exento / no gravado",
}

export function normalizeTaxSettings(raw: unknown): TaxSettings {
  const input = (raw ?? {}) as Partial<TaxSettings>

  const rate = (value: unknown, fallback: number) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : fallback
  }

  return {
    ivaEnabled: input.ivaEnabled === true,
    ivaRate: rate(input.ivaRate, DEFAULT_TAX_SETTINGS.ivaRate),
    ivaReducedRate: rate(input.ivaReducedRate, DEFAULT_TAX_SETTINGS.ivaReducedRate),
    pricesIncludeIva: input.pricesIncludeIva !== false,
    igtfEnabled: input.igtfEnabled === true,
    igtfRate: rate(input.igtfRate, DEFAULT_TAX_SETTINGS.igtfRate),
    igtfMethods: Array.isArray(input.igtfMethods) ? input.igtfMethods : DEFAULT_TAX_SETTINGS.igtfMethods,
  }
}

/** Tasa que le toca a un producto según su categoría. */
export function rateForCategory(category: IvaCategory | undefined | null, settings: TaxSettings): number {
  if (!settings.ivaEnabled) return 0
  if (category === "exento") return 0
  if (category === "reducido") return settings.ivaReducedRate
  return settings.ivaRate
}

const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100

/**
 * Separa un importe en base imponible e IVA.
 *
 * Si el precio ya lleva el IVA dentro hay que sacarlo hacia atrás dividiendo,
 * no restando un porcentaje: sobre 116 con IVA del 16%, la base son 100 y el
 * impuesto 16. Restar el 16% de 116 daría 97,44, que está mal.
 */
export function splitIva(amount: number, ratePercent: number, included: boolean): { base: number; iva: number } {
  const total = Number.isFinite(amount) ? amount : 0
  const rate = Number.isFinite(ratePercent) ? ratePercent / 100 : 0

  if (rate <= 0) return { base: round2(total), iva: 0 }

  if (included) {
    const base = total / (1 + rate)
    return { base: round2(base), iva: round2(total - base) }
  }

  return { base: round2(total), iva: round2(total * rate) }
}

export interface TaxableLine {
  /** Importe de la línea (precio unitario × cantidad), tal como se muestra. */
  amount: number
  ivaCategory?: IvaCategory | null
}

export interface TaxBreakdown {
  /** Suma de las líneas tal como se muestran. */
  subtotal: number
  descuento: number
  /** Base imponible después del descuento y sin IVA. */
  baseImponible: number
  /** Importe de las líneas exentas, que se declara aparte. */
  baseExenta: number
  ivaTotal: number
  /** IVA desglosado por tasa, que es como lo pide una factura. */
  ivaPorTasa: Array<{ rate: number; base: number; iva: number }>
  /** Base + IVA. Lo que dice la factura antes del IGTF. */
  totalFactura: number
  /** Parte del total que se paga en divisas. */
  montoEnDivisa: number
  igtf: number
  /** Total factura + IGTF: lo que el cliente entrega. */
  totalAPagar: number
}

/**
 * Calcula impuestos de una venta.
 *
 * `montoEnDivisa` se pasa desde fuera porque solo el punto de venta sabe cómo
 * se está pagando: en un pago mixto hay que sumar únicamente las líneas de
 * pago en divisa, no adivinarlo desde el método principal.
 */
export function computeTaxes(params: {
  lines: TaxableLine[]
  descuentoPorcentaje?: number
  settings: TaxSettings
  montoEnDivisa?: number
}): TaxBreakdown {
  const { lines, settings } = params
  const descuentoPct = Math.max(0, Math.min(100, Number(params.descuentoPorcentaje) || 0))
  const factorDescuento = 1 - descuentoPct / 100

  const subtotal = round2(lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0))
  const descuento = round2(subtotal * (descuentoPct / 100))

  // El IVA se agrupa por tasa: una factura tiene que declarar cuánta base va al
  // 16%, cuánta al 8% y cuánta va exenta.
  const porTasa = new Map<number, { base: number; iva: number }>()
  let baseExenta = 0

  for (const line of lines) {
    // El descuento se reparte proporcionalmente entre las líneas, para que no
    // desplace impuesto de una tasa a otra.
    const amount = (Number(line.amount) || 0) * factorDescuento
    const rate = rateForCategory(line.ivaCategory, settings)

    if (rate <= 0) {
      baseExenta += amount
      continue
    }

    const { base, iva } = splitIva(amount, rate, settings.pricesIncludeIva)
    const acumulado = porTasa.get(rate) ?? { base: 0, iva: 0 }
    porTasa.set(rate, { base: acumulado.base + base, iva: acumulado.iva + iva })
  }

  const ivaPorTasa = [...porTasa.entries()]
    .map(([rate, valores]) => ({ rate, base: round2(valores.base), iva: round2(valores.iva) }))
    .sort((a, b) => b.rate - a.rate)

  const baseImponible = round2(ivaPorTasa.reduce((sum, entry) => sum + entry.base, 0))
  const ivaTotal = round2(ivaPorTasa.reduce((sum, entry) => sum + entry.iva, 0))
  baseExenta = round2(baseExenta)

  // Si los precios ya llevaban el IVA, el total no cambia: solo se desglosó.
  // Si no lo llevaban, el IVA se suma encima.
  const totalFactura = settings.pricesIncludeIva
    ? round2(subtotal - descuento)
    : round2(baseImponible + baseExenta + ivaTotal)

  // El IGTF no puede gravar más de lo que se está cobrando.
  const montoEnDivisa = Math.max(0, Math.min(totalFactura, Number(params.montoEnDivisa) || 0))
  const igtf =
    settings.igtfEnabled && montoEnDivisa > 0
      ? round2(montoEnDivisa * ((Number(settings.igtfRate) || 0) / 100))
      : 0

  return {
    subtotal,
    descuento,
    baseImponible,
    baseExenta,
    ivaTotal,
    ivaPorTasa,
    totalFactura,
    montoEnDivisa,
    igtf,
    totalAPagar: round2(totalFactura + igtf),
  }
}

/** ¿Este método de pago causa IGTF? */
export function causesIgtf(method: string, settings: TaxSettings): boolean {
  return settings.igtfEnabled && settings.igtfMethods.includes(method)
}
