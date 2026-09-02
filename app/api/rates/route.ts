// /app/api/rates/route.ts
//
// Fuente única de tasas: DolarAPI Venezuela (https://ve.dolarapi.com).
// Devuelve las cuatro cotizaciones que usa el sistema:
//   USD oficial (BCV) · USD paralelo · EUR oficial (BCV) · EUR paralelo
//
// Reemplaza a la antigua /api/bcv (api.dolarvzla.com), que solo traía el dólar.

import { NextResponse } from "next/server"

// Se revalida en el servidor cada 10 min: evita martillar la API externa
// cuando hay varias cajas abiertas, y sigue siendo fresco para un comercio.
export const revalidate = 600

const DOLAR_API = "https://ve.dolarapi.com/v1/dolares"
const EURO_API = "https://ve.dolarapi.com/v1/euros"
const TIMEOUT_MS = 8000

interface DolarApiQuote {
  moneda: string
  fuente: string
  nombre: string
  compra: number | null
  venta: number | null
  promedio: number | null
  fechaActualizacion: string
}

export interface RateValue {
  /** Bolívares por 1 unidad de la divisa. */
  rate: number
  /** ISO de la última actualización según la fuente. */
  updatedAt: string | null
}

export interface RatesPayload {
  usd: { oficial: RateValue | null; paralelo: RateValue | null }
  eur: { oficial: RateValue | null; paralelo: RateValue | null }
  /** Momento en que este servidor consultó la API. */
  fetchedAt: string
  source: "dolarapi.com"
}

async function fetchQuotes(url: string): Promise<DolarApiQuote[]> {
  const res = await fetch(url, {
    // El caché lo maneja `revalidate`; aquí solo pedimos JSON.
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate },
  })

  if (!res.ok) {
    throw new Error(`DolarAPI respondió ${res.status} en ${url}`)
  }

  const data = await res.json()
  return Array.isArray(data) ? (data as DolarApiQuote[]) : []
}

/**
 * DolarAPI deja `compra`/`venta` en null para Venezuela y publica el valor en
 * `promedio`. Aun así aceptamos los tres, por si la fuente cambia de forma.
 */
function pick(quotes: DolarApiQuote[], fuente: string): RateValue | null {
  const quote = quotes.find((q) => q.fuente === fuente)
  if (!quote) return null

  const raw = quote.promedio ?? quote.venta ?? quote.compra
  const rate = Number(raw)
  if (!Number.isFinite(rate) || rate <= 0) return null

  return { rate, updatedAt: quote.fechaActualizacion ?? null }
}

export async function GET() {
  // Si el euro falla no tumbamos el dólar (y viceversa): cada moneda va aparte.
  const [dolares, euros] = await Promise.allSettled([fetchQuotes(DOLAR_API), fetchQuotes(EURO_API)])

  const usdQuotes = dolares.status === "fulfilled" ? dolares.value : []
  const eurQuotes = euros.status === "fulfilled" ? euros.value : []

  if (dolares.status === "rejected") {
    console.error("Error consultando el dólar en DolarAPI:", dolares.reason)
  }
  if (euros.status === "rejected") {
    console.error("Error consultando el euro en DolarAPI:", euros.reason)
  }

  const payload: RatesPayload = {
    usd: {
      oficial: pick(usdQuotes, "oficial"),
      paralelo: pick(usdQuotes, "paralelo"),
    },
    eur: {
      oficial: pick(eurQuotes, "oficial"),
      paralelo: pick(eurQuotes, "paralelo"),
    },
    fetchedAt: new Date().toISOString(),
    source: "dolarapi.com",
  }

  // Sin una sola tasa utilizable no hay nada que devolver: es un fallo real.
  const hasAnyRate = Boolean(
    payload.usd.oficial || payload.usd.paralelo || payload.eur.oficial || payload.eur.paralelo,
  )

  if (!hasAnyRate) {
    return NextResponse.json(
      { error: "No se pudo obtener ninguna tasa desde DolarAPI Venezuela." },
      { status: 502 },
    )
  }

  return NextResponse.json(payload)
}
