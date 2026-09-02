// /lib/accounts.ts
//
// Cuentas y tesorería: dónde está el dinero del negocio.
//
// QUÉ RESUELVE Y POR QUÉ NO LO TENÍAMOS
//
// Hasta ahora el sistema sabía CUÁNTO entró (las ventas) y podía cuadrar un
// turno (el arqueo del momento). Lo que no sabía es DÓNDE está el dinero
// ahora: cuánto hay en la gaveta, cuánto en el Banco de Venezuela, cuánto en
// Zelle. El cuadre del turno es una foto; esto es la película.
//
// LA IDEA CENTRAL: EL MÉTODO DE PAGO APUNTA A UNA CUENTA
//
// "Pago móvil" no es un sitio donde vive el dinero: es la forma en que llega
// al Banco de Venezuela. Cuando cada método de pago apunta a una cuenta real,
// cobrar por pago móvil sube el saldo de ese banco, y el dueño puede mirar sus
// saldos sin sumar tickets a mano.
//
// EL SALDO SE GUARDA, NO SE RECALCULA
//
// Sumar todos los movimientos cada vez que se abre la pantalla es correcto
// pero se vuelve caro: con dos años de operación son decenas de miles de
// lecturas cada vez. El saldo vive en el documento de la cuenta y se mueve con
// increment() dentro del MISMO lote que escribe el movimiento. O se guardan
// los dos o no se guarda ninguno, así que el saldo nunca miente.

import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore"
import { db } from "./firebase"

export type TipoCuenta = "efectivo" | "banco" | "digital"
export type Moneda = "USD" | "BS"

export interface TipoCuentaDef {
  id: TipoCuenta
  label: string
  ayuda: string
}

export const TIPOS_CUENTA: TipoCuentaDef[] = [
  { id: "efectivo", label: "Efectivo", ayuda: "La gaveta, la caja fuerte, el bolsillo." },
  { id: "banco", label: "Cuenta bancaria", ayuda: "Banesco, BNC, Banco de Venezuela…" },
  { id: "digital", label: "Billetera digital", ayuda: "Zelle, Binance, Zinli, PayPal." },
]

export interface Cuenta {
  id: string
  negocioId: string
  nombre: string
  tipo: TipoCuenta
  moneda: Moneda
  /** Nombre del banco o del servicio, para distinguir dos cuentas parecidas. */
  entidad?: string | null
  /** Últimos dígitos, nunca el número completo. */
  referencia?: string | null
  /** Saldo actual. Se mantiene con increment(), no se recalcula al leer. */
  saldo: number
  activa: boolean
  orden: number
  createdAt?: Timestamp
}

export type TipoMovimiento = "ingreso" | "egreso"

export type OrigenMovimiento =
  | "venta"
  | "gasto"
  | "transferencia"
  | "apertura"
  | "ajuste"
  | "abono"

export interface Movimiento {
  id: string
  negocioId: string
  cuentaId: string
  tipo: TipoMovimiento
  monto: number
  moneda: Moneda
  concepto: string
  origen: OrigenMovimiento
  /** Documento que lo causó: la venta, el gasto, la transferencia. */
  origenId?: string | null
  fecha: Timestamp
  creadoPor: string
}

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------

export async function listarCuentas(negocioId: string): Promise<Cuenta[]> {
  const snapshot = await getDocs(
    query(collection(db, "cuentas"), where("negocioId", "==", negocioId)),
  )

  return snapshot.docs
    .map((documento) => ({ id: documento.id, ...documento.data() }) as Cuenta)
    .filter((cuenta) => cuenta.activa !== false)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre))
}

export async function crearCuenta(params: {
  negocioId: string
  nombre: string
  tipo: TipoCuenta
  moneda: Moneda
  entidad?: string
  referencia?: string
  saldoInicial: number
  creadoPor: string
}): Promise<string> {
  const referenciaCuenta = doc(collection(db, "cuentas"))
  const lote = writeBatch(db)

  lote.set(referenciaCuenta, {
    negocioId: params.negocioId,
    nombre: params.nombre.trim(),
    tipo: params.tipo,
    moneda: params.moneda,
    entidad: params.entidad?.trim() || null,
    referencia: params.referencia?.trim() || null,
    saldo: params.saldoInicial,
    activa: true,
    orden: Date.now(),
    createdAt: Timestamp.now(),
  })

  // El saldo inicial entra como movimiento para que el libro mayor cuadre con
  // el saldo desde el primer día. Sin esto, el primer estado de cuenta empieza
  // con una cifra que no viene de ninguna parte.
  if (params.saldoInicial !== 0) {
    lote.set(doc(collection(db, "movimientos")), {
      negocioId: params.negocioId,
      cuentaId: referenciaCuenta.id,
      tipo: params.saldoInicial > 0 ? "ingreso" : "egreso",
      monto: Math.abs(params.saldoInicial),
      moneda: params.moneda,
      concepto: "Saldo inicial",
      origen: "apertura",
      origenId: null,
      fecha: Timestamp.now(),
      creadoPor: params.creadoPor,
    })
  }

  await lote.commit()
  return referenciaCuenta.id
}

/** Las cuentas no se borran: se desactivan, para no dejar movimientos huérfanos. */
export async function desactivarCuenta(cuentaId: string): Promise<void> {
  await updateDoc(doc(db, "cuentas", cuentaId), { activa: false })
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

export interface NuevoMovimiento {
  negocioId: string
  cuentaId: string
  tipo: TipoMovimiento
  monto: number
  moneda: Moneda
  concepto: string
  origen: OrigenMovimiento
  origenId?: string | null
  fecha?: Date
  creadoPor: string
}

/**
 * Registra un movimiento y mueve el saldo, en un solo lote.
 *
 * Los dos van juntos a propósito. Si se escribieran por separado y fallara el
 * segundo, quedaría un saldo que no corresponde a sus movimientos, y ese error
 * no se detecta hasta que alguien cuadra a mano y no le da.
 */
export async function registrarMovimiento(datos: NuevoMovimiento): Promise<string> {
  if (!Number.isFinite(datos.monto) || datos.monto <= 0) {
    throw new Error("El monto debe ser mayor que cero.")
  }

  const referencia = doc(collection(db, "movimientos"))
  const lote = writeBatch(db)

  lote.set(referencia, {
    negocioId: datos.negocioId,
    cuentaId: datos.cuentaId,
    tipo: datos.tipo,
    monto: datos.monto,
    moneda: datos.moneda,
    concepto: datos.concepto.trim(),
    origen: datos.origen,
    origenId: datos.origenId ?? null,
    fecha: Timestamp.fromDate(datos.fecha ?? new Date()),
    creadoPor: datos.creadoPor,
  })

  lote.update(doc(db, "cuentas", datos.cuentaId), {
    saldo: increment(datos.tipo === "ingreso" ? datos.monto : -datos.monto),
  })

  await lote.commit()
  return referencia.id
}

/**
 * Mueve dinero de una cuenta a otra.
 *
 * Son dos movimientos y dos saldos en un solo lote: sacar el efectivo de la
 * gaveta y depositarlo en el banco NO es un gasto ni un ingreso, es el mismo
 * dinero cambiando de sitio. Tratarlo como gasto en una cuenta e ingreso en
 * otra ensuciaría la utilidad del mes en ambos lados.
 */
export async function transferir(params: {
  negocioId: string
  desdeCuentaId: string
  hastaCuentaId: string
  /** Monto que sale de la cuenta de origen. */
  monto: number
  monedaOrigen: Moneda
  /**
   * Monto que entra en la de destino. Puede diferir si se cambia de moneda:
   * salen $50 de la gaveta y entran Bs 39.750 al banco.
   */
  montoDestino: number
  monedaDestino: Moneda
  concepto: string
  creadoPor: string
}): Promise<void> {
  if (params.desdeCuentaId === params.hastaCuentaId) {
    throw new Error("El origen y el destino no pueden ser la misma cuenta.")
  }
  if (params.monto <= 0 || params.montoDestino <= 0) {
    throw new Error("Los montos deben ser mayores que cero.")
  }

  const lote = writeBatch(db)
  const ahora = Timestamp.now()
  const concepto = params.concepto.trim() || "Transferencia entre cuentas"
  const idTransferencia = doc(collection(db, "movimientos")).id

  lote.set(doc(collection(db, "movimientos")), {
    negocioId: params.negocioId,
    cuentaId: params.desdeCuentaId,
    tipo: "egreso",
    monto: params.monto,
    moneda: params.monedaOrigen,
    concepto,
    origen: "transferencia",
    origenId: idTransferencia,
    fecha: ahora,
    creadoPor: params.creadoPor,
  })

  lote.set(doc(collection(db, "movimientos")), {
    negocioId: params.negocioId,
    cuentaId: params.hastaCuentaId,
    tipo: "ingreso",
    monto: params.montoDestino,
    moneda: params.monedaDestino,
    concepto,
    origen: "transferencia",
    origenId: idTransferencia,
    fecha: ahora,
    creadoPor: params.creadoPor,
  })

  lote.update(doc(db, "cuentas", params.desdeCuentaId), { saldo: increment(-params.monto) })
  lote.update(doc(db, "cuentas", params.hastaCuentaId), { saldo: increment(params.montoDestino) })

  await lote.commit()
}

export async function listarMovimientos(params: {
  negocioId: string
  cuentaId?: string
  maximo?: number
}): Promise<Movimiento[]> {
  const restricciones = [
    where("negocioId", "==", params.negocioId),
    ...(params.cuentaId ? [where("cuentaId", "==", params.cuentaId)] : []),
    orderBy("fecha", "desc"),
    limit(params.maximo ?? 100),
  ]

  const snapshot = await getDocs(query(collection(db, "movimientos"), ...restricciones))
  return snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }) as Movimiento)
}

// ---------------------------------------------------------------------------
// Métodos de pago atados a cuentas
// ---------------------------------------------------------------------------

/**
 * A qué cuenta va a parar cada método de pago.
 *
 * Se guarda en los ajustes del negocio: `usuarios/{uid}.metodosPago`.
 * Un método sin cuenta asignada sigue funcionando para cobrar; simplemente su
 * dinero no entra en ninguna cuenta y el sistema lo avisa, en vez de inventarse
 * un destino.
 */
export type MapaMetodos = Record<string, string | null>

export const METODOS_DISPONIBLES = [
  { id: "cash", label: "Efectivo $", moneda: "USD" as Moneda },
  { id: "zelle", label: "Zelle", moneda: "USD" as Moneda },
  { id: "binance", label: "Binance", moneda: "USD" as Moneda },
  { id: "efectivoBs", label: "Efectivo Bs", moneda: "BS" as Moneda },
  { id: "debit", label: "Débito", moneda: "BS" as Moneda },
  { id: "transfer", label: "Transferencia", moneda: "BS" as Moneda },
  { id: "pagoMovil", label: "Pago móvil", moneda: "BS" as Moneda },
  { id: "biopago", label: "Biopago", moneda: "BS" as Moneda },
]

export function cuentaDeMetodo(metodo: string, mapa: MapaMetodos): string | null {
  return mapa?.[metodo] ?? null
}

/** Métodos que se están usando para cobrar pero no tienen cuenta asignada. */
export function metodosSinCuenta(mapa: MapaMetodos): string[] {
  return METODOS_DISPONIBLES.filter((metodo) => !mapa?.[metodo.id]).map((metodo) => metodo.id)
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

export interface TotalesTesoreria {
  /** Suma de las cuentas en divisa. */
  totalUsd: number
  /** Suma de las cuentas en bolívares. */
  totalBs: number
  /** Todo junto en divisa, convirtiendo los bolívares a la tasa dada. */
  totalEquivalenteUsd: number | null
  porTipo: Record<TipoCuenta, { usd: number; bs: number }>
}

export function totalizar(cuentas: Cuenta[], tasa: number | null): TotalesTesoreria {
  const porTipo: Record<TipoCuenta, { usd: number; bs: number }> = {
    efectivo: { usd: 0, bs: 0 },
    banco: { usd: 0, bs: 0 },
    digital: { usd: 0, bs: 0 },
  }

  let totalUsd = 0
  let totalBs = 0

  for (const cuenta of cuentas) {
    const saldo = Number(cuenta.saldo) || 0
    if (cuenta.moneda === "USD") {
      totalUsd += saldo
      porTipo[cuenta.tipo].usd += saldo
    } else {
      totalBs += saldo
      porTipo[cuenta.tipo].bs += saldo
    }
  }

  const redondear = (valor: number) => Math.round(valor * 100) / 100

  return {
    totalUsd: redondear(totalUsd),
    totalBs: redondear(totalBs),
    // Sin tasa no se inventa una conversión: se devuelve null y la pantalla
    // enseña los dos totales por separado.
    totalEquivalenteUsd: tasa && tasa > 0 ? redondear(totalUsd + totalBs / tasa) : null,
    porTipo,
  }
}
