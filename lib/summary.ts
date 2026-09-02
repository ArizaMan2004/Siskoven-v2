// /lib/summary.ts
//
// El estado de resultados: si el negocio gana o pierde, y por qué.
//
// LA CUENTA, EN ORDEN
//
//   Ventas
//   − Costo de lo vendido        (lo que te costó la mercancía que salió)
//   = Utilidad bruta             (lo que deja el margen)
//   − Gastos de operar           (fijos + variables + discrecionales)
//   = UTILIDAD                   (lo que de verdad ganó el negocio)
//
// Y aparte, sin entrar en esa cuenta:
//
//   Inversión                    (una nevera no es un gasto del mes, es un bien)
//   Retiros del dueño            (repartir la ganancia no es un costo de operar)
//
// Sacar esas dos de la cuenta es lo que separa este número de lo que la mayoría
// de la gente calcula a ojo. Meter la nevera como gasto del mes hace que un mes
// bueno parezca malo; meter el sueldo del dueño como gasto hace que el negocio
// parezca no ganar nunca, porque cada bolívar que sobra se retira y vuelve a
// restar. Ver lib/expenses.ts, donde se decidió el reparto por tipos.
//
// EL AGUJERO QUE HAY QUE CONFESAR
//
// El costo de lo vendido sale de `ventas_costos`, que el cajero escribe con
// `costUsdUnit: 0` porque no puede leer los costos (ver lib/products-service.ts).
// Una venta así no aporta costo, y la utilidad sale inflada.
//
// La respuesta no es adivinar el costo por detrás: sería inventarse el número
// más importante de la pantalla. Se cuentan esas ventas y se dicen. Un número
// con una advertencia sirve; un número inventado, no.

import { Timestamp, collection, getDocs, query, where } from "firebase/firestore"
import { db } from "./firebase"
import { listarGastos, resumirGastos, type ResumenGastos } from "./expenses"

export interface Periodo {
  desde: Date
  hasta: Date
  label: string
}

/** Los rangos que la gente pide de verdad, ya calculados. */
export function periodosHabituales(): Periodo[] {
  const ahora = new Date()

  const inicioDelDia = (fecha: Date) => {
    const copia = new Date(fecha)
    copia.setHours(0, 0, 0, 0)
    return copia
  }

  const hoy = inicioDelDia(ahora)

  const hace7 = new Date(hoy)
  hace7.setDate(hace7.getDate() - 6)

  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)

  const inicioMesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
  const finMesPasado = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59, 999)

  const inicioAño = new Date(ahora.getFullYear(), 0, 1)

  return [
    { desde: hoy, hasta: ahora, label: "Hoy" },
    { desde: hace7, hasta: ahora, label: "7 días" },
    { desde: inicioMes, hasta: ahora, label: "Este mes" },
    { desde: inicioMesPasado, hasta: finMesPasado, label: "Mes pasado" },
    { desde: inicioAño, hasta: ahora, label: "Este año" },
  ]
}

export interface ResumenFinanciero {
  ventasUsd: number
  numeroVentas: number
  /** Coste de la mercancía vendida. */
  costoVendidoUsd: number
  utilidadBrutaUsd: number
  /** Margen bruto sobre las ventas, en porcentaje. */
  margenBrutoPct: number
  gastos: ResumenGastos
  /** Ventas − costo de lo vendido − gastos de operar. */
  utilidadUsd: number
  /** Utilidad sobre las ventas, en porcentaje. */
  margenNetoPct: number
  /** Fuera de la cuenta de resultados, pero sale dinero igual. */
  inversionUsd: number
  retirosUsd: number
  /**
   * Ventas cuyo costo llegó en cero porque las hizo alguien que no ve costos.
   * Mientras esto sea mayor que cero, la utilidad de arriba está inflada.
   */
  ventasSinCosto: number
  /** Cuánto se vendió en esas ventas, para dimensionar el hueco. */
  ventasSinCostoUsd: number
}

interface VentaCruda {
  totalUsd?: unknown
  createdAt?: { toDate?: () => Date } | string | null
  anulada?: boolean
}

function fechaDe(crudo: unknown): Date | null {
  if (!crudo) return null
  const posible = crudo as { toDate?: () => Date }
  const fecha = typeof posible?.toDate === "function" ? posible.toDate() : new Date(crudo as string)
  return Number.isNaN(fecha?.getTime?.()) ? null : fecha
}

const redondear = (valor: number) => Math.round(valor * 100) / 100

/**
 * Arma el estado de resultados de un período.
 *
 * Lee las tres colecciones en paralelo. `ventas_costos` puede fallar por
 * permisos —solo la ven encargados y dueños—, y en ese caso se devuelve el
 * resumen sin costo de lo vendido en vez de romper la pantalla: quien no ve
 * costos tampoco debería ver utilidad, pero sí puede ver cuánto se vendió.
 */
export async function calcularResumen(params: {
  negocioId: string
  periodo: Periodo
}): Promise<ResumenFinanciero> {
  const { negocioId, periodo } = params

  const [ventasSnap, costosSnap, gastos] = await Promise.all([
    getDocs(query(collection(db, "ventas"), where("negocioId", "==", negocioId))),
    getDocs(query(collection(db, "ventas_costos"), where("negocioId", "==", negocioId))).catch(
      () => null,
    ),
    listarGastos({ negocioId, desde: periodo.desde, hasta: periodo.hasta, maximo: 1000 }),
  ])

  // El costo se indexa por id de venta: el documento de costo tiene el MISMO id
  // que su venta, que es lo que permite cruzarlos sin una consulta por venta.
  const costoPorVenta = new Map<string, number>()
  if (costosSnap) {
    for (const documento of costosSnap.docs) {
      const items = (documento.data().items ?? []) as Array<{
        quantity?: number
        costUsdUnit?: number
      }>

      let total = 0
      for (const item of items) {
        total += (Number(item.quantity) || 0) * (Number(item.costUsdUnit) || 0)
      }
      costoPorVenta.set(documento.id, total)
    }
  }

  let ventasUsd = 0
  let numeroVentas = 0
  let costoVendidoUsd = 0
  let ventasSinCosto = 0
  let ventasSinCostoUsd = 0

  for (const documento of ventasSnap.docs) {
    const datos = documento.data() as VentaCruda

    // Una venta anulada no vendió nada: dejarla dentro contaría dos veces el
    // mismo error, una en la venta y otra en su contraria.
    if (datos.anulada === true) continue

    const fecha = fechaDe(datos.createdAt)
    if (!fecha || fecha < periodo.desde || fecha > periodo.hasta) continue

    const total = Number(datos.totalUsd) || 0
    ventasUsd += total
    numeroVentas += 1

    const costo = costoPorVenta.get(documento.id)
    if (costo === undefined || costo <= 0) {
      // Sin costo registrado. Se cuenta el hueco en vez de taparlo con un cero
      // silencioso, que se leería como "margen del 100%".
      if (costosSnap) {
        ventasSinCosto += 1
        ventasSinCostoUsd += total
      }
    } else {
      costoVendidoUsd += costo
    }
  }

  const resumenGastos = resumirGastos(gastos)

  ventasUsd = redondear(ventasUsd)
  costoVendidoUsd = redondear(costoVendidoUsd)

  const utilidadBrutaUsd = redondear(ventasUsd - costoVendidoUsd)
  const utilidadUsd = redondear(utilidadBrutaUsd - resumenGastos.costoOperativoUsd)

  return {
    ventasUsd,
    numeroVentas,
    costoVendidoUsd,
    utilidadBrutaUsd,
    margenBrutoPct: ventasUsd > 0 ? redondear((utilidadBrutaUsd / ventasUsd) * 100) : 0,
    gastos: resumenGastos,
    utilidadUsd,
    margenNetoPct: ventasUsd > 0 ? redondear((utilidadUsd / ventasUsd) * 100) : 0,
    inversionUsd: resumenGastos.porTipo.inversion,
    retirosUsd: resumenGastos.porTipo.retiro,
    ventasSinCosto,
    ventasSinCostoUsd: redondear(ventasSinCostoUsd),
  }
}

/**
 * Traduce el resultado a una frase.
 *
 * Un número solo no dice si está bien. "Ganaste 340 $" no responde a la
 * pregunta que trae el dueño, que es si eso es mucho o poco para lo que vendió.
 */
export function veredicto(resumen: ResumenFinanciero): {
  tono: "bien" | "justo" | "mal" | "vacio"
  titular: string
  explicacion: string
} {
  if (resumen.numeroVentas === 0) {
    return {
      tono: "vacio",
      titular: "No hubo ventas en este período",
      explicacion: "Prueba con un rango más amplio, o empieza a facturar desde el punto de venta.",
    }
  }

  if (resumen.utilidadUsd < 0) {
    return {
      tono: "mal",
      titular: `Perdiste ${Math.abs(resumen.utilidadUsd).toFixed(2)} $`,
      explicacion:
        resumen.gastos.costoOperativoUsd > resumen.utilidadBrutaUsd
          ? "Lo que deja el margen no alcanza para pagar los gastos. O el margen es muy bajo, o los gastos son muy altos para lo que se vende."
          : "El costo de la mercancía se comió las ventas. Revisa los precios de venta contra lo que te está costando comprar.",
    }
  }

  if (resumen.margenNetoPct < 5) {
    return {
      tono: "justo",
      titular: `Ganaste ${resumen.utilidadUsd.toFixed(2)} $, pero por poco`,
      explicacion: `De cada 100 $ vendidos te quedaron ${resumen.margenNetoPct.toFixed(1)} $. Un mes flojo o un gasto imprevisto te pone en rojo.`,
    }
  }

  return {
    tono: "bien",
    titular: `Ganaste ${resumen.utilidadUsd.toFixed(2)} $`,
    explicacion: `De cada 100 $ vendidos te quedaron ${resumen.margenNetoPct.toFixed(1)} $, ya descontando la mercancía y los gastos.`,
  }
}

/** Fecha legible de un período, para la cabecera. */
export function etiquetaPeriodo(periodo: Periodo): string {
  const formato = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short" })
  const mismoDia = periodo.desde.toDateString() === periodo.hasta.toDateString()

  return mismoDia
    ? formato.format(periodo.desde)
    : `${formato.format(periodo.desde)} — ${formato.format(periodo.hasta)}`
}

export { Timestamp }
