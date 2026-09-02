"use client"

import { useCallback, useEffect, useState } from "react"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import {
  DEFAULT_PRICING_SETTINGS,
  type PricingSettings,
  normalizePricingSettings,
} from "@/lib/pricing"
import { DEFAULT_TAX_SETTINGS, type TaxSettings, normalizeTaxSettings } from "@/lib/taxes"

const CACHE_KEY = "siskoven.pricing.v2"

interface CachedSettings {
  pricing: PricingSettings
  taxes: TaxSettings
}

const DEFAULTS: CachedSettings = { pricing: DEFAULT_PRICING_SETTINGS, taxes: DEFAULT_TAX_SETTINGS }

function readCache(): CachedSettings {
  if (typeof window === "undefined") return DEFAULTS
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw)
    return {
      pricing: normalizePricingSettings(parsed?.pricing),
      taxes: normalizeTaxSettings(parsed?.taxes),
    }
  } catch {
    return DEFAULTS
  }
}

function writeCache(settings: CachedSettings) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(settings))
  } catch {
    /* cuota llena o modo privado: la fuente de verdad sigue siendo Firestore */
  }
}

/**
 * Ajustes del comercio: cómo cobra en divisa (descuento y redondeo) y cómo
 * factura (IVA e IGTF). Los dos viajan juntos porque salen de la misma lectura
 * del documento del usuario: separarlos costaría el doble de lecturas de
 * Firestore cada vez que se abre una vista.
 */
export function usePricingSettings() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<PricingSettings>(DEFAULT_PRICING_SETTINGS)
  const [taxes, setTaxes] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // La caché solo se lee ya montados: leerla en el initializer del useState
  // provocaría un desajuste de hidratación entre servidor y navegador.
  useEffect(() => {
    const cached = readCache()
    setSettings(cached.pricing)
    setTaxes(cached.taxes)
  }, [])

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "usuarios", user.uid))
        if (cancelled) return

        if (snap.exists()) {
          const data = snap.data()
          const loadedPricing = normalizePricingSettings(data.pricing)
          const loadedTaxes = normalizeTaxSettings(data.taxes)
          setSettings(loadedPricing)
          setTaxes(loadedTaxes)
          writeCache({ pricing: loadedPricing, taxes: loadedTaxes })
        }
      } catch (error) {
        console.error("Error cargando los ajustes de precio:", error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  const persist = useCallback(
    async (nextPricing: PricingSettings, nextTaxes: TaxSettings) => {
      setSettings(nextPricing)
      setTaxes(nextTaxes)
      writeCache({ pricing: nextPricing, taxes: nextTaxes })

      if (!user) return

      setSaving(true)
      try {
        // merge: el documento del usuario tiene más campos (plan, negocio…).
        await setDoc(
          doc(db, "usuarios", user.uid),
          { pricing: nextPricing, taxes: nextTaxes },
          { merge: true },
        )
      } catch (error) {
        console.error("Error guardando los ajustes:", error)
        throw error
      } finally {
        setSaving(false)
      }
    },
    [user],
  )

  const save = useCallback(
    (next: PricingSettings) => persist(normalizePricingSettings(next), taxes),
    [persist, taxes],
  )

  const saveTaxes = useCallback(
    (next: TaxSettings) => persist(settings, normalizeTaxSettings(next)),
    [persist, settings],
  )

  return { settings, taxes, save, saveTaxes, loading, saving }
}
