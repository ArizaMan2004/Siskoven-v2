// /lib/subscriptions.ts
//
// Planes, vencimientos y pagos.
//
// El cobro es MANUAL a propósito: Stripe y las pasarelas grandes no operan en
// Venezuela, así que el dinero entra por Zelle, Binance, pago móvil o efectivo,
// y alguien lo confirma a mano en el panel. Todo el modelo está pensado para
// eso: registrar un pago recibido y extender la fecha de vencimiento.
//
// Consecuencia de diseño: el vencimiento es una FECHA, no un estado. Nada de
// "activo/inactivo" que haya que recordar apagar; la cuenta caduca sola el día
// que le toca, y registrar un pago simplemente empuja esa fecha hacia adelante.

import { Timestamp } from "firebase/firestore"

export type PlanId = "trial" | "mensual" | "trimestral" | "anual"

export interface Plan {
  id: PlanId
  label: string
  /** Precio en dólares. */
  price: number
  /** Duración en días que añade al vencimiento. */
  days: number
  /** Precio efectivo por mes, para poder comparar. */
  perMonth: number
  description: string
}

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    label: "Prueba",
    price: 0,
    days: 7,
    perMonth: 0,
    description: "7 días para probar el sistema completo.",
  },
  mensual: {
    id: "mensual",
    label: "Mensual",
    price: 30,
    days: 30,
    perMonth: 30,
    description: "Pago mes a mes.",
  },
  trimestral: {
    id: "trimestral",
    label: "Trimestral",
    price: 81,
    days: 90,
    perMonth: 27,
    description: "10% de descuento. El escalón para quien no puede pagar el año completo.",
  },
  anual: {
    id: "anual",
    label: "Anual",
    price: 300,
    days: 365,
    perMonth: 25,
    description: "Dos meses gratis: 17% de descuento.",
  },
}

export const PAID_PLANS: PlanId[] = ["mensual", "trimestral", "anual"]

export type PaymentMethod = "zelle" | "binance" | "pagoMovil" | "efectivo" | "transferencia" | "otro"

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  zelle: "Zelle",
  binance: "Binance",
  pagoMovil: "Pago móvil",
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  otro: "Otro",
}

export interface Payment {
  id: string
  /** Cuenta que pagó. */
  uid: string
  negocioId: string
  businessName: string
  email: string
  plan: PlanId
  /** Monto cobrado, en dólares. Puede diferir del precio de lista. */
  montoUsd: number
  metodo: PaymentMethod
  /** Referencia bancaria o de la transacción, para poder rastrearla. */
  referencia: string
  notas?: string | null
  /** Hasta cuándo quedó activa la cuenta con este pago. */
  vigenteHasta: Timestamp
  /** Quién lo registró. */
  registradoPor: string
  createdAt: Timestamp
}

/** Cuenta tal como la ve el panel de administración. */
export interface AccountSummary {
  uid: string
  email: string
  businessName: string
  plan: PlanId
  /** Fecha de vencimiento efectiva, venga de la prueba o de una suscripción. */
  vence: Date | null
  isActive: boolean
  createdAt: Date | null
  /** Días que faltan. Negativo si ya venció. */
  diasRestantes: number | null
  estado: AccountState
}

export type AccountState = "prueba" | "activa" | "por_vencer" | "vencida" | "desactivada"

export const STATE_LABELS: Record<AccountState, string> = {
  prueba: "En prueba",
  activa: "Al día",
  por_vencer: "Por vencer",
  vencida: "Vencida",
  desactivada: "Desactivada",
}

/** Se avisa con esta antelación para poder cobrar antes de que caduque. */
export const DIAS_AVISO_VENCIMIENTO = 5

function toDate(value: unknown): Date | null {
  if (!value) return null
  const raw = value as { toDate?: () => Date }
  const date = typeof raw.toDate === "function" ? raw.toDate() : new Date(value as string)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Fecha real de vencimiento de una cuenta.
 *
 * `subscriptionEndsAt` manda sobre `trialEndsAt`: cuando alguien paga, su
 * suscripción sustituye a la prueba aunque el campo viejo siga ahí.
 */
export function accountExpiry(data: Record<string, unknown>): Date | null {
  return toDate(data.subscriptionEndsAt) ?? toDate(data.trialEndsAt)
}

export function daysUntil(date: Date | null): number | null {
  if (!date) return null
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export function accountState(params: {
  plan: PlanId
  vence: Date | null
  isActive: boolean
}): AccountState {
  if (!params.isActive) return "desactivada"

  const dias = daysUntil(params.vence)
  if (dias === null) return params.plan === "trial" ? "prueba" : "activa"
  if (dias < 0) return "vencida"
  if (dias <= DIAS_AVISO_VENCIMIENTO) return "por_vencer"

  return params.plan === "trial" ? "prueba" : "activa"
}

export function toAccountSummary(uid: string, data: Record<string, unknown>): AccountSummary {
  const plan = (data.plan as PlanId) ?? "trial"
  const vence = accountExpiry(data)
  const isActive = data.isActive !== false

  return {
    uid,
    email: (data.email as string) ?? "",
    businessName: (data.businessName as string) ?? "Sin nombre",
    plan: PLANS[plan] ? plan : "trial",
    vence,
    isActive,
    createdAt: toDate(data.createdAt),
    diasRestantes: daysUntil(vence),
    estado: accountState({ plan, vence, isActive }),
  }
}

/**
 * Nueva fecha de vencimiento al registrar un pago.
 *
 * Si la cuenta sigue vigente, el tiempo se SUMA a lo que le queda; no se pierde
 * lo ya pagado por renovar antes de tiempo. Si ya venció, se cuenta desde hoy:
 * cobrarle a alguien los días en que no pudo usar el sistema sería robarle.
 */
export function nextExpiry(vencimientoActual: Date | null, plan: PlanId): Date {
  const dias = PLANS[plan]?.days ?? 30
  const ahora = new Date()
  const base = vencimientoActual && vencimientoActual > ahora ? vencimientoActual : ahora

  const siguiente = new Date(base)
  siguiente.setDate(siguiente.getDate() + dias)
  return siguiente
}

/** ¿Esta cuenta puede seguir usando el sistema? */
export function hasAccess(data: Record<string, unknown>): boolean {
  if (data.isActive === false) return false
  const vence = accountExpiry(data)
  if (!vence) return true
  return vence.getTime() > Date.now()
}
