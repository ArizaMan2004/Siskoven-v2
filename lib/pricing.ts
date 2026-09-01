// /lib/pricing.ts
//
// Fuente única del cálculo de precios. Antes esta lógica estaba copiada en
// products-view, sales-view y el generador de PDF, con pequeñas diferencias
// entre copias: el precio en divisa llevaba un descuento del 30% y un redondeo
// al entero, pero el precio en bolívares se calculaba SIN ese descuento. Un
// mismo producto se mostraba a $7 y a Bs 7.949 (que son $10) en la misma fila.
//
// Ahora el ajuste en divisa es opcional y configurable, y los bolívares SIEMPRE
// salen del mismo precio final que ves en divisa.

export interface PriceableProduct {
  /**
   * Precio ya calculado y guardado en el documento del producto.
   *
   * Manda sobre todo lo demás. Existe porque el costo vive en otra colección
   * que el cajero no puede leer: si el precio se dedujera del costo, el cajero
   * no podría saber a cuánto vender. Ver lib/products-service.ts.
   */
  precioUsd?: number | null
  /** Costo. Solo lo tiene quien puede leer productos_costos. */
  costUsd?: number
  /** Margen sobre la venta. Se acepta 20 o 0.2 indistintamente. */
  profit?: number
  /** Precio de venta fijado a mano. Si está, manda sobre el margen. */
  salePriceUsdManual?: number | null
}

export type RoundingMode = "nearest" | "up" | "down"

export interface PricingSettings {
  /**
   * Descuento (%) que se aplica al precio de lista cuando el cliente paga en
   * divisa. 0 = sin descuento. Por defecto está en 0: nada automático.
   */
  divisaDiscountPercent: number
  /**
   * Múltiplo al que se redondea el precio en divisa: 0 = sin redondear,
   * 0.5 = a medio dólar, 1 = al dólar entero. Existe porque en Venezuela no
   * circulan monedas de céntimos y hay que poder cobrar cifras redondas.
   */
  divisaRounding: number
  divisaRoundingMode: RoundingMode
  /** Métodos de pago que cuentan como "en divisa" para aplicar el ajuste. */
  divisaPaymentMethods: string[]
  /** Múltiplo al que se redondea el precio en bolívares. 0 = sin redondear. */
  bsRounding: number
  bsRoundingMode: RoundingMode
  /** Ancho del papel de la impresora térmica, en milímetros. */
  paperWidth: 58 | 80
  /** Imprimir el recibo automáticamente al confirmar una venta. */
  autoPrint: boolean
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  divisaDiscountPercent: 0,
  divisaRounding: 0,
  divisaRoundingMode: "nearest",
  divisaPaymentMethods: ["cash", "zelle", "binance"],
  bsRounding: 0,
  bsRoundingMode: "nearest",
  paperWidth: 58,
  autoPrint: false,
}

export const ROUNDING_OPTIONS = [
  { value: 0, label: "Sin redondear (con céntimos)" },
  { value: 0.25, label: "Al cuarto ($0,25)" },
  { value: 0.5, label: "Al medio ($0,50)" },
  { value: 1, label: "Al entero ($1)" },
  { value: 5, label: "A múltiplos de 5" },
]

export const BS_ROUNDING_OPTIONS = [
  { value: 0, label: "Sin redondear (con céntimos)" },
  { value: 1, label: "Al bolívar entero" },
  { value: 5, label: "A múltiplos de 5 Bs" },
  { value: 10, label: "A múltiplos de 10 Bs" },
  { value: 100, label: "A múltiplos de 100 Bs" },
]

export function normalizePricingSettings(raw: unknown): PricingSettings {
  const input = (raw ?? {}) as Partial<PricingSettings>
  const percent = Number(input.divisaDiscountPercent)
  const divisaRounding = Number(input.divisaRounding)
  const bsRounding = Number(input.bsRounding)

  return {
    divisaDiscountPercent:
      Number.isFinite(percent) && percent >= 0 && percent < 100
        ? percent
        : DEFAULT_PRICING_SETTINGS.divisaDiscountPercent,
    divisaRounding:
      Number.isFinite(divisaRounding) && divisaRounding >= 0
        ? divisaRounding
        : DEFAULT_PRICING_SETTINGS.divisaRounding,
    divisaRoundingMode: isRoundingMode(input.divisaRoundingMode)
      ? input.divisaRoundingMode
      : DEFAULT_PRICING_SETTINGS.divisaRoundingMode,
    divisaPaymentMethods: Array.isArray(input.divisaPaymentMethods)
      ? input.divisaPaymentMethods
      : DEFAULT_PRICING_SETTINGS.divisaPaymentMethods,
    bsRounding:
      Number.isFinite(bsRounding) && bsRounding >= 0 ? bsRounding : DEFAULT_PRICING_SETTINGS.bsRounding,
    bsRoundingMode: isRoundingMode(input.bsRoundingMode)
      ? input.bsRoundingMode
      : DEFAULT_PRICING_SETTINGS.bsRoundingMode,
    paperWidth: input.paperWidth === 80 ? 80 : DEFAULT_PRICING_SETTINGS.paperWidth,
    autoPrint: input.autoPrint === true,
  }
}

function isRoundingMode(value: unknown): value is RoundingMode {
  return value === "nearest" || value === "up" || value === "down"
}

/** Redondea `value` al múltiplo `step`. Con step 0 devuelve el valor intacto. */
export function roundTo(value: number, step: number, mode: RoundingMode = "nearest"): number {
  if (!Number.isFinite(value)) return 0
  if (!Number.isFinite(step) || step <= 0) return value

  const quotient = value / step
  const rounded = mode === "up" ? Math.ceil(quotient) : mode === "down" ? Math.floor(quotient) : Math.round(quotient)

  // El *1e6 evita que 0.1+0.2 nos deje un 3.0000000000000004 en la factura.
  return Math.round(rounded * step * 1e6) / 1e6
}

/**
 * Precio de lista en divisa: el precio manual si lo hay, y si no el costo con
 * el margen aplicado. Sin descuentos ni redondeos.
 */
export function listPrice(product: PriceableProduct): number {
  // 1º el precio guardado: es lo único que tiene el cajero.
  const guardado = Number(product?.precioUsd)
  if (Number.isFinite(guardado) && guardado > 0) return guardado

  const manual = Number(product?.salePriceUsdManual)
  if (Number.isFinite(manual) && manual > 0) return manual

  const cost = Number(product?.costUsd)
  if (!Number.isFinite(cost) || cost <= 0) return 0

  // El margen es sobre la venta, no sobre el costo: precio = costo / (1 - margen).
  const rawProfit = Number(product?.profit)
  let profitDecimal = Number.isFinite(rawProfit) ? (rawProfit > 1 ? rawProfit / 100 : rawProfit) : 0
  if (!Number.isFinite(profitDecimal) || profitDecimal < 0 || profitDecimal >= 1) profitDecimal = 0

  const price = cost / (1 - profitDecimal)
  return Number.isFinite(price) ? price : 0
}

/**
 * Precio al pagar en divisa: precio de lista con el descuento y el redondeo
 * que el comercio haya configurado. Con los ajustes por defecto (0% y sin
 * redondeo) devuelve exactamente el precio de lista.
 */
export function divisaPrice(
  product: PriceableProduct & { precioDivisaUsd?: number | null },
  settings: PricingSettings,
): number {
  // Si el producto trae su precio en divisa ya resuelto, se respeta: se
  // calculó al guardarlo, con estos mismos ajustes, y quien lo lee puede no
  // tener el costo para recalcularlo.
  const guardado = Number(product?.precioDivisaUsd)
  if (Number.isFinite(guardado) && guardado > 0) return guardado

  const base = listPrice(product)
  if (base <= 0) return 0

  const discount = Math.max(0, Math.min(99.99, Number(settings.divisaDiscountPercent) || 0))
  const discounted = base * (1 - discount / 100)

  return roundTo(discounted, settings.divisaRounding, settings.divisaRoundingMode)
}

/** Convierte a bolívares aplicando el redondeo en Bs configurado. */
export function toBs(amount: number, rate: number, settings: PricingSettings): number {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) return 0
  return roundTo(amount * rate, settings.bsRounding, settings.bsRoundingMode)
}

export function isDivisaPayment(method: string, settings: PricingSettings): boolean {
  return settings.divisaPaymentMethods.includes(method)
}

export interface ResolvedPrice {
  /** Precio de lista, sin ajustes. */
  list: number
  /** Precio que se cobra (con ajuste de divisa si aplica). */
  final: number
  /** El mismo precio final, en bolívares. */
  finalBs: number
  /** Si se aplicó el ajuste de divisa. */
  adjusted: boolean
}

/**
 * Resuelve el precio de un producto para un método de pago y una tasa dados.
 * Es la función que deberían usar todas las vistas: garantiza que el precio en
 * divisa y el precio en bolívares vienen del mismo número.
 */
export function resolvePrice(
  product: PriceableProduct,
  options: { settings: PricingSettings; rate: number | null; payingInDivisa: boolean },
): ResolvedPrice {
  const { settings, rate, payingInDivisa } = options
  const list = listPrice(product)
  const final = payingInDivisa ? divisaPrice(product, settings) : list
  const safeRate = Number.isFinite(rate as number) && (rate as number) > 0 ? (rate as number) : 0

  return {
    list,
    final,
    finalBs: safeRate > 0 ? toBs(final, safeRate, settings) : 0,
    adjusted: payingInDivisa && Math.abs(final - list) > 1e-9,
  }
}

/** Ganancia real de una línea de venta, para las estadísticas. */
export function lineProfit(costUsd: number, unitPrice: number, quantity: number): number {
  const cost = Number(costUsd)
  const price = Number(unitPrice)
  const qty = Number(quantity)
  if (![cost, price, qty].every(Number.isFinite)) return 0
  return (price - cost) * qty
}

export function formatMoney(amount: number, symbol = "$"): string {
  const safe = Number.isFinite(amount) ? amount : 0
  return `${symbol}${safe.toFixed(2)}`
}

export function formatBs(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0
  return `Bs ${safe.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
