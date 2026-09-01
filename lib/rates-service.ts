// /lib/rates-service.ts
//
// Store compartido de tasas de cambio. Antes cada vista (productos, ventas,
// reportes) leía la tasa por su cuenta y arrancaba con un 216.37 quemado en el
// código, así que podías estar vendiendo con una tasa distinta a la que veías
// en el inventario. Ahora hay un solo estado y todas las vistas lo comparten.

import type { RatesPayload, RateValue } from "@/app/api/rates/route"

export type Currency = "USD" | "EUR"
export type RateOrigin = "oficial" | "paralelo" | "manual"

export interface RateSelection {
  currency: Currency
  origin: RateOrigin
}

export interface ActiveRate {
  /** Bolívares por 1 unidad de la divisa seleccionada. */
  rate: number
  currency: Currency
  origin: RateOrigin
  /** Cuándo se actualizó la tasa en la fuente (o cuándo la escribiste a mano). */
  updatedAt: Date | null
}

export interface RatesState {
  rates: RatesPayload | null
  selection: RateSelection
  /** Tasa escrita a mano. Solo se usa si `selection.origin === "manual"`. */
  manualRate: number | null
  manualUpdatedAt: string | null
  loading: boolean
  error: string | null
  /** Cuándo se guardó esta caché en el navegador. */
  cachedAt: string | null
}

const STORAGE_KEY = "siskoven.rates.v2"

export const DEFAULT_SELECTION: RateSelection = { currency: "USD", origin: "oficial" }

export const RATE_LABELS: Record<string, string> = {
  "USD-oficial": "Dólar BCV",
  "USD-paralelo": "Dólar paralelo",
  "EUR-oficial": "Euro BCV",
  "EUR-paralelo": "Euro paralelo",
  "USD-manual": "Dólar (tasa manual)",
  "EUR-manual": "Euro (tasa manual)",
}

export function rateLabel(selection: RateSelection): string {
  return RATE_LABELS[`${selection.currency}-${selection.origin}`] ?? "Tasa"
}

export const CURRENCY_SYMBOL: Record<Currency, string> = { USD: "$", EUR: "€" }

// ---------------------------------------------------------------------------
// Estado en memoria + suscripción (para useSyncExternalStore)
// ---------------------------------------------------------------------------

let state: RatesState = {
  rates: null,
  selection: DEFAULT_SELECTION,
  manualRate: null,
  manualUpdatedAt: null,
  loading: false,
  error: null,
  cachedAt: null,
}

const listeners = new Set<() => void>()
let hydrated = false
let inFlight: Promise<void> | null = null

function emit() {
  for (const listener of listeners) listener()
}

function setState(patch: Partial<RatesState>) {
  state = { ...state, ...patch }
  emit()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getState(): RatesState {
  return state
}

// ---------------------------------------------------------------------------
// Persistencia en localStorage
// ---------------------------------------------------------------------------

function isValidSelection(value: unknown): value is RateSelection {
  const sel = value as RateSelection | undefined
  return (
    !!sel &&
    (sel.currency === "USD" || sel.currency === "EUR") &&
    (sel.origin === "oficial" || sel.origin === "paralelo" || sel.origin === "manual")
  )
}

/**
 * Lee la caché del navegador. Es idempotente y solo corre en cliente: leer
 * localStorage durante el render del servidor rompía la hidratación.
 */
export function hydrateFromStorage(): void {
  if (hydrated || typeof window === "undefined") return
  hydrated = true

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return

    const parsed = JSON.parse(raw) as Partial<RatesState>
    setState({
      rates: parsed.rates ?? null,
      selection: isValidSelection(parsed.selection) ? parsed.selection : DEFAULT_SELECTION,
      manualRate:
        typeof parsed.manualRate === "number" && Number.isFinite(parsed.manualRate) && parsed.manualRate > 0
          ? parsed.manualRate
          : null,
      manualUpdatedAt: parsed.manualUpdatedAt ?? null,
      cachedAt: parsed.cachedAt ?? null,
    })
  } catch (error) {
    console.warn("No se pudo leer la caché de tasas:", error)
  }
}

function persist() {
  if (typeof window === "undefined") return
  try {
    const { rates, selection, manualRate, manualUpdatedAt, cachedAt } = state
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ rates, selection, manualRate, manualUpdatedAt, cachedAt }),
    )
  } catch (error) {
    console.warn("No se pudo guardar la caché de tasas:", error)
  }
}

// ---------------------------------------------------------------------------
// Consulta a la API
// ---------------------------------------------------------------------------

/**
 * Trae las cuatro tasas desde /api/rates. Las llamadas concurrentes comparten
 * la misma promesa, de modo que abrir tres vistas a la vez no dispara tres
 * peticiones.
 */
export function refreshRates(): Promise<void> {
  if (inFlight) return inFlight

  setState({ loading: true, error: null })

  inFlight = (async () => {
    try {
      const res = await fetch("/api/rates", { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `La API de tasas respondió ${res.status}`)
      }

      const rates = (await res.json()) as RatesPayload
      setState({ rates, cachedAt: new Date().toISOString(), loading: false, error: null })
      persist()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido al consultar las tasas"
      console.error("Error obteniendo tasas:", error)
      // Conservamos las tasas en caché: es mejor una tasa vieja y avisada que
      // ninguna, porque sin tasa la caja no puede cobrar en bolívares.
      setState({ loading: false, error: message })
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export function setSelection(selection: RateSelection): void {
  setState({ selection })
  persist()
}

export function setManualRate(rate: number, currency: Currency = state.selection.currency): void {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("La tasa manual debe ser un número mayor que cero.")
  }
  setState({
    manualRate: rate,
    manualUpdatedAt: new Date().toISOString(),
    selection: { currency, origin: "manual" },
  })
  persist()
}

// ---------------------------------------------------------------------------
// Derivados
// ---------------------------------------------------------------------------

function readRate(rates: RatesPayload | null, selection: RateSelection): RateValue | null {
  if (!rates || selection.origin === "manual") return null
  const byCurrency = selection.currency === "USD" ? rates.usd : rates.eur
  return byCurrency[selection.origin] ?? null
}

/**
 * Tasa que debe aplicarse ahora mismo, o `null` si todavía no hay ninguna.
 * Devolver null a propósito: antes se devolvía 0 y los precios en bolívares
 * salían en Bs 0,00 sin que nadie se enterara.
 */
export function getActiveRate(current: RatesState = state): ActiveRate | null {
  const { selection, manualRate, manualUpdatedAt, rates } = current

  if (selection.origin === "manual") {
    if (!manualRate || manualRate <= 0) return null
    return {
      rate: manualRate,
      currency: selection.currency,
      origin: "manual",
      updatedAt: manualUpdatedAt ? new Date(manualUpdatedAt) : null,
    }
  }

  const value = readRate(rates, selection)
  if (!value) return null

  return {
    rate: value.rate,
    currency: selection.currency,
    origin: selection.origin,
    updatedAt: value.updatedAt ? new Date(value.updatedAt) : null,
  }
}

/** Todas las tasas disponibles, para pintar el selector. */
export function listAvailableRates(current: RatesState = state): Array<{
  selection: RateSelection
  label: string
  value: RateValue | null
}> {
  const combos: RateSelection[] = [
    { currency: "USD", origin: "oficial" },
    { currency: "USD", origin: "paralelo" },
    { currency: "EUR", origin: "oficial" },
    { currency: "EUR", origin: "paralelo" },
  ]

  return combos.map((selection) => ({
    selection,
    label: rateLabel(selection),
    value: readRate(current.rates, selection),
  }))
}

export function formatRateDate(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "sin fecha"
  return date.toLocaleString("es-VE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
