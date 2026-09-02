// /lib/cash-service.ts
//
// Turnos de caja: abrir, mover dinero y cerrar cuadrando.
//
// Por qué existe este módulo: sin turnos, tener cajeros no sirve de nada. Si
// todas las ventas caen en un montón común no puedes saber quién cobró qué, ni
// cuánto debería haber en la gaveta al final del día, ni de quién es el
// faltante. Un turno ata cada venta a una persona y a una franja horaria, y al
// cerrar compara lo que el sistema esperaba con lo que la persona contó.

import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore"
import { db } from "./firebase"

/** Métodos de pago que entran en divisa; el resto entra en bolívares. */
export const USD_METHODS = ["cash", "zelle", "binance"] as const
export const BS_METHODS = ["debit", "transfer", "pagoMovil", "biopago"] as const

export type PaymentMethodId = (typeof USD_METHODS)[number] | (typeof BS_METHODS)[number]

export const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo $",
  zelle: "Zelle",
  binance: "Binance",
  debit: "Débito",
  transfer: "Transferencia",
  pagoMovil: "Pago móvil",
  biopago: "Biopago",
}

export function isUsdMethod(method: string): boolean {
  return (USD_METHODS as readonly string[]).includes(method)
}

/** Dinero contado o esperado, separado por moneda. Nunca se mezclan. */
export interface MoneyPair {
  usd: number
  bs: number
}

export const ZERO: MoneyPair = { usd: 0, bs: 0 }

export interface Turno {
  id: string
  negocioId: string
  cajeroUid: string
  cajeroNombre: string
  cajeroEmail: string
  estado: "abierto" | "cerrado"
  abiertoEn: Timestamp
  cerradoEn?: Timestamp | null
  /** Fondo con el que arranca la gaveta. */
  fondoInicial: MoneyPair
  /** Lo que el cajero contó al cerrar, por método de pago. */
  conteoFinal?: Record<string, number> | null
  /** Lo que el sistema calculó que debía haber. */
  esperadoFinal?: Record<string, number> | null
  /** contado − esperado, por método. Negativo = falta dinero. */
  diferencias?: Record<string, number> | null
  notasCierre?: string | null
  /** Tasa vigente al cerrar, para poder releer el turno años después. */
  tasaCierre?: number | null
}

export interface MovimientoCaja {
  id: string
  negocioId: string
  turnoId: string
  tipo: "entrada" | "salida"
  metodo: string
  monto: number
  moneda: "USD" | "BS"
  motivo: string
  creadoPor: string
  createdAt: Timestamp
}

export const MOTIVOS_SALIDA = [
  "Pago a proveedor",
  "Retiro del dueño",
  "Compra de insumos",
  "Vuelto / cambio",
  "Otro",
]

export const MOTIVOS_ENTRADA = ["Aporte de fondo", "Devolución de vuelto", "Otro"]

// ---------------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------------

/**
 * Turno abierto de un cajero, si lo hay.
 * Solo puede haber uno a la vez por persona: abrir un segundo turno sin cerrar
 * el primero repartiría las ventas del mismo rato entre dos cuadres.
 */
export async function getTurnoAbierto(negocioId: string, cajeroUid: string): Promise<Turno | null> {
  const snapshot = await getDocs(
    query(
      collection(db, "turnos"),
      where("negocioId", "==", negocioId),
      where("cajeroUid", "==", cajeroUid),
      where("estado", "==", "abierto"),
      limit(1),
    ),
  )

  if (snapshot.empty) return null
  const document = snapshot.docs[0]
  return { id: document.id, ...document.data() } as Turno
}

export async function abrirTurno(params: {
  negocioId: string
  cajeroUid: string
  cajeroNombre: string
  cajeroEmail: string
  fondoInicial: MoneyPair
}): Promise<string> {
  const abierto = await getTurnoAbierto(params.negocioId, params.cajeroUid)
  if (abierto) {
    throw new Error("Ya tienes un turno abierto. Ciérralo antes de abrir otro.")
  }

  const reference = await addDoc(collection(db, "turnos"), {
    negocioId: params.negocioId,
    cajeroUid: params.cajeroUid,
    cajeroNombre: params.cajeroNombre,
    cajeroEmail: params.cajeroEmail,
    estado: "abierto",
    abiertoEn: Timestamp.now(),
    cerradoEn: null,
    fondoInicial: params.fondoInicial,
  })

  return reference.id
}

export async function cerrarTurno(params: {
  turnoId: string
  conteoFinal: Record<string, number>
  esperadoFinal: Record<string, number>
  notas?: string
  tasa?: number | null
}): Promise<Record<string, number>> {
  // La diferencia se calcula aquí y se guarda: si se recalculara al abrir el
  // reporte, un cambio futuro en la fórmula reescribiría cuadres ya firmados.
  const diferencias: Record<string, number> = {}
  const metodos = new Set([...Object.keys(params.conteoFinal), ...Object.keys(params.esperadoFinal)])

  for (const metodo of metodos) {
    const contado = Number(params.conteoFinal[metodo] ?? 0)
    const esperado = Number(params.esperadoFinal[metodo] ?? 0)
    diferencias[metodo] = Math.round((contado - esperado) * 100) / 100
  }

  await updateDoc(doc(db, "turnos", params.turnoId), {
    estado: "cerrado",
    cerradoEn: Timestamp.now(),
    conteoFinal: params.conteoFinal,
    esperadoFinal: params.esperadoFinal,
    diferencias,
    notasCierre: params.notas?.trim() || null,
    tasaCierre: params.tasa ?? null,
  })

  return diferencias
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

export async function registrarMovimiento(params: {
  negocioId: string
  turnoId: string
  tipo: "entrada" | "salida"
  metodo: string
  monto: number
  moneda: "USD" | "BS"
  motivo: string
  creadoPor: string
}): Promise<void> {
  if (!Number.isFinite(params.monto) || params.monto <= 0) {
    throw new Error("El monto debe ser mayor que cero.")
  }
  if (!params.motivo.trim()) {
    throw new Error("Escribe el motivo del movimiento.")
  }

  await addDoc(collection(db, "movimientos_caja"), {
    negocioId: params.negocioId,
    turnoId: params.turnoId,
    tipo: params.tipo,
    metodo: params.metodo,
    monto: params.monto,
    moneda: params.moneda,
    motivo: params.motivo.trim(),
    creadoPor: params.creadoPor,
    createdAt: Timestamp.now(),
  })
}

export async function getMovimientos(turnoId: string): Promise<MovimientoCaja[]> {
  const snapshot = await getDocs(
    query(collection(db, "movimientos_caja"), where("turnoId", "==", turnoId)),
  )

  return snapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }) as MovimientoCaja)
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
}

// ---------------------------------------------------------------------------
// Cuadre
// ---------------------------------------------------------------------------

/** Venta, en lo poco que le importa a la caja. */
interface VentaParaCaja {
  totalUsd?: number
  totalBs?: number
  paymentMethod?: string
  anulada?: boolean
  paymentBreakdown?: {
    detallePagos?: Array<{ method: string; currency: "USD" | "BS"; amount: number }>
  } | null
}

/**
 * Reparte una venta entre los métodos con que se cobró.
 *
 * Una venta de un solo método aporta su total entero a ese método, en la moneda
 * del método. Una venta mixta se reparte según el desglose que se guardó.
 * Las ventas anuladas no aportan nada: por eso anular tiene que crear un
 * registro y no borrar la venta.
 */
export function repartirVenta(venta: VentaParaCaja): Record<string, number> {
  const resultado: Record<string, number> = {}
  if (venta.anulada) return resultado

  const detalle = venta.paymentBreakdown?.detallePagos
  if (venta.paymentMethod === "mixed" && Array.isArray(detalle) && detalle.length > 0) {
    for (const pago of detalle) {
      const monto = Number(pago.amount) || 0
      resultado[pago.method] = (resultado[pago.method] ?? 0) + monto
    }
    return resultado
  }

  const metodo = venta.paymentMethod
  if (!metodo || metodo === "mixed") return resultado

  // El importe se toma en la moneda del método: cobrar en efectivo $ suma
  // dólares a la gaveta, no bolívares.
  const monto = isUsdMethod(metodo) ? Number(venta.totalUsd) || 0 : Number(venta.totalBs) || 0
  resultado[metodo] = monto
  return resultado
}

export interface ResumenTurno {
  /** Lo que debería haber por método: fondo + ventas + entradas − salidas. */
  esperado: Record<string, number>
  /** Solo lo vendido, sin fondo ni movimientos. */
  ventas: Record<string, number>
  movimientos: Record<string, number>
  totalVentasUsd: number
  totalVentasBs: number
  cantidadVentas: number
}

/**
 * Cuánto debería haber en caja ahora mismo.
 *
 * El fondo inicial se suma solo al efectivo: nadie arranca el turno con un
 * saldo de Zelle en la gaveta.
 */
export function resumirTurno(
  turno: Pick<Turno, "fondoInicial">,
  ventas: VentaParaCaja[],
  movimientos: Pick<MovimientoCaja, "tipo" | "metodo" | "monto">[],
): ResumenTurno {
  const ventasPorMetodo: Record<string, number> = {}
  let totalVentasUsd = 0
  let totalVentasBs = 0
  let cantidadVentas = 0

  for (const venta of ventas) {
    if (venta.anulada) continue
    cantidadVentas += 1
    totalVentasUsd += Number(venta.totalUsd) || 0
    totalVentasBs += Number(venta.totalBs) || 0

    for (const [metodo, monto] of Object.entries(repartirVenta(venta))) {
      ventasPorMetodo[metodo] = (ventasPorMetodo[metodo] ?? 0) + monto
    }
  }

  const movimientosPorMetodo: Record<string, number> = {}
  for (const movimiento of movimientos) {
    const signo = movimiento.tipo === "salida" ? -1 : 1
    const monto = signo * (Number(movimiento.monto) || 0)
    movimientosPorMetodo[movimiento.metodo] = (movimientosPorMetodo[movimiento.metodo] ?? 0) + monto
  }

  const esperado: Record<string, number> = {}
  const metodos = new Set([...Object.keys(ventasPorMetodo), ...Object.keys(movimientosPorMetodo), "cash"])

  for (const metodo of metodos) {
    const base = metodo === "cash" ? (Number(turno.fondoInicial?.usd) || 0) : 0
    esperado[metodo] =
      Math.round((base + (ventasPorMetodo[metodo] ?? 0) + (movimientosPorMetodo[metodo] ?? 0)) * 100) / 100
  }

  // El fondo en bolívares vive en el método de efectivo en Bs si existe; si el
  // comercio no maneja efectivo en Bs, queda a cero y no estorba.
  const fondoBs = Number(turno.fondoInicial?.bs) || 0
  if (fondoBs > 0) {
    esperado.efectivoBs = Math.round((fondoBs + (esperado.efectivoBs ?? 0)) * 100) / 100
  }

  return {
    esperado,
    ventas: ventasPorMetodo,
    movimientos: movimientosPorMetodo,
    totalVentasUsd,
    totalVentasBs,
    cantidadVentas,
  }
}
