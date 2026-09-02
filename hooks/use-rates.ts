"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import {
  type ActiveRate,
  type Currency,
  type RateSelection,
  type RatesState,
  getActiveRate,
  getState,
  hydrateFromStorage,
  listAvailableRates,
  refreshRates,
  setManualRate,
  setSelection,
  subscribe,
} from "@/lib/rates-service"

/** Estado inicial estable para el render del servidor (sin localStorage). */
const serverSnapshot: RatesState = {
  rates: null,
  selection: { currency: "USD", origin: "oficial" },
  manualRate: null,
  manualUpdatedAt: null,
  loading: false,
  error: null,
  cachedAt: null,
}

export interface UseRatesResult extends RatesState {
  /** Tasa activa, o null si todavía no hay ninguna disponible. */
  active: ActiveRate | null
  /** Bolívares por unidad de divisa, o null. Nunca 0 disfrazado de tasa válida. */
  rate: number | null
  available: ReturnType<typeof listAvailableRates>
  refresh: () => Promise<void>
  select: (selection: RateSelection) => void
  setManual: (rate: number, currency?: Currency) => void
}

/**
 * Acceso a las tasas de cambio. Todas las vistas comparten el mismo estado, así
 * que la tasa que ves en Productos es exactamente la que cobra el Punto de Venta.
 */
export function useRates(): UseRatesResult {
  const state = useSyncExternalStore(subscribe, getState, () => serverSnapshot)

  useEffect(() => {
    hydrateFromStorage()
    // Al montar pedimos tasas frescas; si falla, se sigue usando la caché.
    void refreshRates()
  }, [])

  const active = getActiveRate(state)

  const refresh = useCallback(() => refreshRates(), [])
  const select = useCallback((selection: RateSelection) => setSelection(selection), [])
  const setManual = useCallback((rate: number, currency?: Currency) => setManualRate(rate, currency), [])

  return {
    ...state,
    active,
    rate: active?.rate ?? null,
    available: listAvailableRates(state),
    refresh,
    select,
    setManual,
  }
}
