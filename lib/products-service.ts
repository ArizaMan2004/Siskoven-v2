// /lib/products-service.ts
//
// Lectura y escritura de productos, con el costo separado.
//
// POR QUÉ ESTÁ PARTIDO EN DOS COLECCIONES
//
// Las reglas de Firestore autorizan documentos enteros, no campos sueltos. El
// cajero necesita leer el producto para venderlo, así que cualquier campo que
// esté dentro del producto le llega en la respuesta del servidor, lo pinte la
// pantalla o no. Mientras el costo viviera ahí, ocultarlo era decorativo:
// bastaba abrir la pestaña de red del navegador.
//
//   productos/{id}          nombre, categoría, existencias, PRECIO de venta
//                           -> lo lee todo el mundo en el negocio
//
//   productos_costos/{id}   costo y margen
//                           -> solo encargados y dueños
//
// El margen va con el costo, no con el producto: teniendo el precio y el
// margen se despeja el costo, así que dejarlo a la vista habría sido lo mismo
// que publicar el costo.
//
// Consecuencia importante: el PRECIO se guarda, ya no se calcula al vuelo a
// partir del costo. Quien no puede ver el costo tampoco puede derivar el
// precio, así que tiene que venir escrito en el documento público.

import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore"
import { db } from "./firebase"
import { type PricingSettings, divisaPrice, listPrice } from "./pricing"
import type { IvaCategory } from "./taxes"

/**
 * Cómo se vende y se mide un producto.
 *
 * `service` no es una unidad de medida sino otra naturaleza: un servicio no
 * tiene existencias, no se descuenta al venderlo y no aparece nunca en las
 * alertas de inventario bajo. Va en este mismo campo porque es justo el que
 * decide qué hacer con la cantidad al vender.
 */
export type SaleType = "unit" | "weight" | "service"

export function esServicio(producto: { saleType?: SaleType | string }): boolean {
  return producto?.saleType === "service"
}

/** Lo que ve cualquiera en el negocio, cajero incluido. */
export interface PublicProduct {
  id: string
  negocioId: string
  name: string
  category: string
  quantity: number
  saleType: SaleType
  barcode?: string
  /**
   * Por debajo de esta cantidad, el producto sale en la alerta de inventario
   * bajo. Cero significa que no se vigila.
   */
  stockMinimo?: number
  /** Precio de lista en divisa. Ya calculado: aquí no se deduce del costo. */
  precioUsd: number
  /** Precio en divisa con el ajuste del comercio aplicado. */
  precioDivisaUsd: number
  ivaCategory?: IvaCategory | null
  createdAt?: Timestamp
}

/** Lo que solo ven encargados y dueños. */
export interface ProductCost {
  productoId: string
  negocioId: string
  costUsd: number
  /** Margen sobre la venta, en porcentaje. */
  profit: number
  /** Precio fijado a mano, si lo hay. Es dato de trabajo del encargado. */
  salePriceUsdManual?: number | null
  updatedAt?: Timestamp
}

/** Producto con su costo, para las pantallas de quien puede verlo. */
export type ProductWithCost = PublicProduct & Partial<Omit<ProductCost, "productoId" | "negocioId">>

export async function loadProducts(negocioId: string): Promise<PublicProduct[]> {
  const snapshot = await getDocs(
    query(collection(db, "productos"), where("negocioId", "==", negocioId)),
  )

  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as PublicProduct)
}

/**
 * Costos del negocio, indexados por producto.
 *
 * Si quien pregunta no tiene permiso, Firestore rechaza la consulta. Se
 * devuelve un mapa vacío en vez de propagar el error: para un cajero, "no hay
 * costos" es la respuesta correcta, no un fallo que deba romperle la pantalla.
 */
export async function loadCosts(negocioId: string): Promise<Map<string, ProductCost>> {
  try {
    const snapshot = await getDocs(
      query(collection(db, "productos_costos"), where("negocioId", "==", negocioId)),
    )

    const costs = new Map<string, ProductCost>()
    for (const document of snapshot.docs) {
      costs.set(document.id, { productoId: document.id, ...document.data() } as ProductCost)
    }
    return costs
  } catch (error) {
    console.warn("Sin acceso a los costos (esperado para un cajero):", error)
    return new Map()
  }
}

/** Productos con su costo cuando se tiene permiso, y sin él cuando no. */
export async function loadProductsWithCosts(negocioId: string): Promise<ProductWithCost[]> {
  const [products, costs] = await Promise.all([loadProducts(negocioId), loadCosts(negocioId)])

  return products.map((product) => {
    const cost = costs.get(product.id)
    return cost
      ? {
          ...product,
          costUsd: cost.costUsd,
          profit: cost.profit,
          salePriceUsdManual: cost.salePriceUsdManual ?? null,
        }
      : product
  })
}

export interface ProductInput {
  name: string
  category: string
  quantity: number
  saleType: SaleType
  barcode: string
  stockMinimo?: number
  costUsd: number
  profit: number
  salePriceUsdManual?: number | null
  ivaCategory?: IvaCategory | null
}

/**
 * Guarda un producto en sus dos documentos, con un lote.
 *
 * El lote es lo que evita que queden desparejados: si falla la escritura del
 * costo, tampoco se guarda el producto. Un producto sin su costo daría una
 * utilidad falsa en los reportes sin que nadie se enterase.
 */
export async function saveProduct(params: {
  negocioId: string
  productId?: string | null
  input: ProductInput
  pricing: PricingSettings
}): Promise<string> {
  const { negocioId, input, pricing } = params

  const productRef = params.productId
    ? doc(db, "productos", params.productId)
    : doc(collection(db, "productos"))

  // El precio se calcula AQUÍ y se guarda ya resuelto, porque quien lo lea no
  // va a tener el costo para poder deducirlo.
  const paraCalcular = {
    costUsd: input.costUsd,
    profit: input.profit,
    salePriceUsdManual: input.salePriceUsdManual ?? null,
  }

  const publicData: Record<string, unknown> = {
    negocioId,
    name: input.name,
    category: input.category,
    // Un servicio no lleva existencias: se guarda en cero para que ninguna
    // pantalla lo cuente como inventario ni lo meta en una alerta.
    quantity: input.saleType === "service" ? 0 : input.quantity,
    saleType: input.saleType,
    barcode: input.barcode,
    stockMinimo: input.saleType === "service" ? 0 : (input.stockMinimo ?? 0),
    precioUsd: listPrice(paraCalcular),
    precioDivisaUsd: divisaPrice(paraCalcular, pricing),
    ivaCategory: input.ivaCategory ?? "general",
  }

  if (!params.productId) publicData.createdAt = Timestamp.now()

  const batch = writeBatch(db)
  batch.set(productRef, publicData, { merge: Boolean(params.productId) })
  batch.set(doc(db, "productos_costos", productRef.id), {
    productoId: productRef.id,
    negocioId,
    costUsd: input.costUsd,
    profit: input.profit,
    salePriceUsdManual: input.salePriceUsdManual ?? null,
    updatedAt: Timestamp.now(),
  })

  await batch.commit()
  return productRef.id
}

export async function deleteProduct(productId: string): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, "productos", productId))
  batch.delete(doc(db, "productos_costos", productId))
  await batch.commit()
}

/**
 * Recalcula los precios guardados de todo el catálogo.
 *
 * Hace falta cuando cambian los ajustes de cobro en divisa: el precio ya no se
 * calcula al mostrarlo, así que un cambio de descuento o de redondeo tiene que
 * reescribirse en cada producto. Solo lo puede correr quien ve los costos.
 */
export async function recalcularPrecios(params: {
  negocioId: string
  pricing: PricingSettings
}): Promise<number> {
  const costs = await loadCosts(params.negocioId)
  if (costs.size === 0) return 0

  const products = await loadProducts(params.negocioId)
  const batch = writeBatch(db)
  let actualizados = 0

  for (const product of products) {
    const cost = costs.get(product.id)
    if (!cost) continue

    const paraCalcular = {
      costUsd: cost.costUsd,
      profit: cost.profit,
      salePriceUsdManual: cost.salePriceUsdManual ?? null,
    }

    const precioUsd = listPrice(paraCalcular)
    const precioDivisaUsd = divisaPrice(paraCalcular, params.pricing)

    // Solo se escribe lo que de verdad cambia: reescribir 500 productos
    // idénticos son 500 escrituras pagadas para nada.
    if (precioUsd === product.precioUsd && precioDivisaUsd === product.precioDivisaUsd) continue

    batch.update(doc(db, "productos", product.id), { precioUsd, precioDivisaUsd })
    actualizados += 1
  }

  if (actualizados > 0) await batch.commit()
  return actualizados
}

/** Costo de un solo producto, para la pantalla de edición. */
export async function getProductCost(productId: string): Promise<ProductCost | null> {
  try {
    const snapshot = await getDoc(doc(db, "productos_costos", productId))
    return snapshot.exists()
      ? ({ productoId: snapshot.id, ...snapshot.data() } as ProductCost)
      : null
  } catch {
    return null
  }
}

/** Se mantiene por compatibilidad con quien importe el borrado suelto. */
export { deleteDoc }

// ---------------------------------------------------------------------------
// Alertas de inventario
// ---------------------------------------------------------------------------

export type EstadoStock = "agotado" | "bajo" | "ok" | "sin_control"

/**
 * En qué estado está un producto respecto a su stock mínimo.
 *
 * Los servicios devuelven "sin_control": no tienen existencias que vigilar, y
 * meterlos en la lista de agotados sería ruido que hace ignorar la alerta
 * entera.
 */
export function estadoStock(producto: {
  saleType?: SaleType | string
  quantity?: number
  stockMinimo?: number
}): EstadoStock {
  if (esServicio(producto)) return "sin_control"

  const cantidad = Number(producto?.quantity) || 0
  if (cantidad <= 0) return "agotado"

  const minimo = Number(producto?.stockMinimo) || 0
  if (minimo <= 0) return "sin_control"

  return cantidad <= minimo ? "bajo" : "ok"
}

export interface ResumenStock {
  agotados: PublicProduct[]
  bajos: PublicProduct[]
  /** Cuántos productos tienen un mínimo definido. Sin ninguno, la alerta no sirve. */
  vigilados: number
  /** Valor del inventario a precio de costo, si se tienen los costos. */
  valorCostoUsd: number | null
  /** Valor del inventario a precio de venta. */
  valorVentaUsd: number
}

export function resumirStock(productos: ProductWithCost[]): ResumenStock {
  const agotados: PublicProduct[] = []
  const bajos: PublicProduct[] = []
  let vigilados = 0
  let valorCostoUsd = 0
  let valorVentaUsd = 0
  let hayCostos = false

  for (const producto of productos) {
    if (esServicio(producto)) continue

    const cantidad = Number(producto.quantity) || 0
    valorVentaUsd += cantidad * (Number(producto.precioUsd) || 0)

    if (typeof producto.costUsd === "number") {
      hayCostos = true
      valorCostoUsd += cantidad * producto.costUsd
    }

    if ((Number(producto.stockMinimo) || 0) > 0) vigilados += 1

    const estado = estadoStock(producto)
    if (estado === "agotado") agotados.push(producto)
    else if (estado === "bajo") bajos.push(producto)
  }

  const ordenar = (lista: PublicProduct[]) =>
    lista.sort((a, b) => (Number(a.quantity) || 0) - (Number(b.quantity) || 0))

  const redondear = (valor: number) => Math.round(valor * 100) / 100

  return {
    agotados: ordenar(agotados),
    bajos: ordenar(bajos),
    vigilados,
    // Sin ningún costo a mano no se devuelve cero, que se leería como "tu
    // inventario no vale nada": se devuelve null y la pantalla lo dice.
    valorCostoUsd: hayCostos ? redondear(valorCostoUsd) : null,
    valorVentaUsd: redondear(valorVentaUsd),
  }
}
