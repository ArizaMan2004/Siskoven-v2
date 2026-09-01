// /lib/capitalization.ts
//
// ¿Puedo reponer lo que vendí?
//
// Es la pregunta que mata negocios en Venezuela sin que el dueño se entere. El
// mecanismo es este: vendes con ganancia, cierras el mes contento, y cuando vas
// al proveedor descubres que la misma mercancía subió más que tu margen. Repites
// eso doce veces y tienes menos inventario que al empezar, habiendo "ganado"
// dinero todos los meses.
//
// La contabilidad normal no lo enseña porque compara el ingreso contra el costo
// HISTÓRICO —lo que pagaste entonces— y da ganancia. Lo que importa de verdad es
// el costo de REPOSICIÓN: lo que cuesta hoy volver a tener lo que vendiste.
//
//   Ganancia contable = ingreso − lo que me costó entonces
//   Ganancia real     = ingreso − lo que cuesta reponerlo hoy
//
// La diferencia entre las dos es ganancia ilusoria: dinero que parecía tuyo pero
// que en realidad ya estaba comprometido con el próximo pedido.

export interface SoldItem {
  productId: string
  name: string
  quantity: number
  /** Costo unitario en divisa en el momento de la venta. */
  costUsdUnit: number
  /** Precio unitario cobrado, en divisa. */
  priceUsdUnit: number
}

export interface SaleForAnalysis {
  items: SoldItem[]
  totalBs?: number
  totalUsd?: number
  /** Tasa a la que se hizo la venta. */
  bcvRate?: number
  anulada?: boolean
  paymentMethod?: string
}

/** Costo actual de cada producto, en divisa. */
export type CurrentCosts = Map<string, number>

export interface ProductGap {
  productId: string
  name: string
  quantity: number
  costoAntes: number
  costoHoy: number
  /** Cuánto más caro está reponerlo, en total para las unidades vendidas. */
  brecha: number
  /** Variación porcentual del costo unitario. */
  variacion: number
}

export interface CapitalizationReport {
  unidadesVendidas: number
  /** Lo que entró, en divisa. */
  ingresoUsd: number
  /** Lo que costó esa mercancía cuando la compraste. */
  costoHistoricoUsd: number
  /** Lo que cuesta hoy volver a comprar exactamente lo mismo. */
  costoReposicionUsd: number
  /** Ingreso − costo histórico. La que sale en los reportes normales. */
  utilidadContableUsd: number
  /** Ingreso − costo de reposición. La que de verdad te queda. */
  utilidadRealUsd: number
  /** La parte de la "ganancia" que se come la subida de costos. */
  utilidadIlusoriaUsd: number
  /** ¿Alcanza para reponer todo lo vendido? */
  puedeReponer: boolean
  /** Productos cuyo costo más subió, de mayor a menor. */
  productosCriticos: ProductGap[]
  /**
   * Pérdida de poder de compra de los bolívares cobrados, SI todavía los
   * tienes. Se declara aparte porque depende de algo que el sistema no sabe:
   * si ya los cambiaste, esta pérdida no ocurrió.
   */
  erosionBsUsd: number
  /** Cuántos productos vendidos no tienen costo actual para comparar. */
  productosSinDato: number
}

const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100

/**
 * Analiza un período.
 *
 * `currentCosts` es el costo de hoy de cada producto. Si un producto vendido ya
 * no existe en el inventario, no se puede comparar: se cuenta aparte en vez de
 * suponer que su costo no cambió, que falsearía el resultado hacia el optimismo.
 */
export function analyzeCapitalization(params: {
  sales: SaleForAnalysis[]
  currentCosts: CurrentCosts
  /** Tasa de hoy, para medir la erosión de los bolívares en caja. */
  rateNow?: number | null
}): CapitalizationReport {
  const { sales, currentCosts, rateNow } = params

  let unidadesVendidas = 0
  let ingresoUsd = 0
  let costoHistoricoUsd = 0
  let costoReposicionUsd = 0
  let erosionBsUsd = 0

  const sinDato = new Set<string>()
  const porProducto = new Map<string, ProductGap>()

  for (const sale of sales) {
    if (sale.anulada) continue

    for (const item of sale.items ?? []) {
      const cantidad = Number(item.quantity) || 0
      if (cantidad <= 0) continue

      const costoAntes = Number(item.costUsdUnit) || 0
      const precio = Number(item.priceUsdUnit) || 0

      unidadesVendidas += cantidad
      ingresoUsd += precio * cantidad
      costoHistoricoUsd += costoAntes * cantidad

      const costoHoy = currentCosts.get(item.productId)

      if (costoHoy === undefined) {
        // Sin costo actual no hay comparación posible. Se usa el histórico para
        // no inflar la reposición, pero se avisa de que ese dato falta.
        sinDato.add(item.productId)
        costoReposicionUsd += costoAntes * cantidad
        continue
      }

      costoReposicionUsd += costoHoy * cantidad

      const acumulado = porProducto.get(item.productId) ?? {
        productId: item.productId,
        name: item.name,
        quantity: 0,
        costoAntes,
        costoHoy,
        brecha: 0,
        variacion: costoAntes > 0 ? ((costoHoy - costoAntes) / costoAntes) * 100 : 0,
      }

      acumulado.quantity += cantidad
      acumulado.brecha += (costoHoy - costoAntes) * cantidad
      porProducto.set(item.productId, acumulado)
    }

    // Erosión de los bolívares: lo cobrado en Bs valía `totalBs / tasaVenta`
    // cuando se cobró, y hoy vale `totalBs / tasaHoy`. Si la tasa subió, ese
    // dinero compra menos que el día que entró.
    const totalBs = Number(sale.totalBs) || 0
    const tasaVenta = Number(sale.bcvRate) || 0
    if (totalBs > 0 && tasaVenta > 0 && rateNow && rateNow > tasaVenta) {
      erosionBsUsd += totalBs / tasaVenta - totalBs / rateNow
    }
  }

  const utilidadContableUsd = ingresoUsd - costoHistoricoUsd
  const utilidadRealUsd = ingresoUsd - costoReposicionUsd

  const productosCriticos = [...porProducto.values()]
    .filter((gap) => gap.brecha > 0.009)
    .sort((a, b) => b.brecha - a.brecha)
    .slice(0, 5)
    .map((gap) => ({
      ...gap,
      brecha: round2(gap.brecha),
      variacion: round2(gap.variacion),
    }))

  return {
    unidadesVendidas: round2(unidadesVendidas),
    ingresoUsd: round2(ingresoUsd),
    costoHistoricoUsd: round2(costoHistoricoUsd),
    costoReposicionUsd: round2(costoReposicionUsd),
    utilidadContableUsd: round2(utilidadContableUsd),
    utilidadRealUsd: round2(utilidadRealUsd),
    utilidadIlusoriaUsd: round2(utilidadContableUsd - utilidadRealUsd),
    puedeReponer: utilidadRealUsd >= 0,
    productosCriticos,
    erosionBsUsd: round2(erosionBsUsd),
    productosSinDato: sinDato.size,
  }
}

/**
 * Veredicto en una frase, que es lo único que un dueño ocupado va a leer.
 */
export function verdict(report: CapitalizationReport): {
  tone: "good" | "warning" | "bad"
  headline: string
  detail: string
} {
  if (report.unidadesVendidas === 0) {
    return {
      tone: "good",
      headline: "Todavía no hay ventas en este período",
      detail: "Cuando registres ventas, aquí verás si lo que ganas alcanza para reponer la mercancía.",
    }
  }

  if (!report.puedeReponer) {
    return {
      tone: "bad",
      headline: "No alcanza para reponer lo que vendiste",
      detail:
        "Reponer la mercancía que saliste cuesta hoy más de lo que cobraste por ella. Cada mes así, tu inventario se achica aunque los reportes muestren ganancia.",
    }
  }

  // Si más de la mitad de la ganancia contable es ilusoria, el negocio está
  // creciendo mucho menos de lo que parece.
  if (report.utilidadContableUsd > 0 && report.utilidadIlusoriaUsd > report.utilidadContableUsd * 0.5) {
    return {
      tone: "warning",
      headline: "Ganas menos de lo que parece",
      detail:
        "Más de la mitad de tu ganancia se va en pagar el aumento de los costos. Te queda margen, pero mucho menos del que muestran los reportes.",
    }
  }

  return {
    tone: "good",
    headline: "Puedes reponer y te queda ganancia",
    detail: "Lo que cobraste cubre la reposición de la mercancía y sobra.",
  }
}
