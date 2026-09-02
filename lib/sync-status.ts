// /lib/sync-status.ts
//
// Estado de sincronización con Firestore, para poder avisar en pantalla y
// tranquilizar a quien está en la caja.
//
// Qué puede salir mal, y qué pasa de verdad en cada caso:
//
// · SIN CONEXIÓN (se fue el internet o la luz del módem)
//   Firestore sirve las lecturas desde la caché local y encola las escrituras.
//   Se sigue vendiendo. Cuando vuelve la conexión, sube todo solo.
//
// · CUOTA AGOTADA (código `resource-exhausted`)
//   Pasa en el plan gratuito de Firebase al superar las 50.000 lecturas o
//   20.000 escrituras del día. Las peticiones se rechazan hasta que la cuota se
//   reinicia, a medianoche hora del Pacífico. Las escrituras siguen en la cola
//   local y suben en la siguiente jornada.
//
// · PERMISO DENEGADO (código `permission-denied`)
//   Este NO se arregla solo: las reglas de seguridad rechazaron la operación.
//   Firestore descarta la escritura. Hay que decirlo tal cual, sin prometer que
//   se recuperará, porque no se va a recuperar.
//
// La distinción importa: prometer "no se perderá nada" cuando el problema es de
// permisos sería mentirle a quien está cobrando.

import { disableNetwork, enableNetwork, waitForPendingWrites } from "firebase/firestore"
import { db } from "./firebase"

export type SyncState =
  | "ok"
  | "offline"
  | "quota"
  | "denied"
  | "error"

export interface SyncStatus {
  state: SyncState
  /** Hay escrituras esperando a subir. */
  pending: boolean
  /** Cuándo se detectó el problema. */
  since: Date | null
  /** Último mensaje técnico, para la consola y el soporte. */
  detail: string | null
}

let status: SyncStatus = { state: "ok", pending: false, since: null, detail: null }
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function setStatus(patch: Partial<SyncStatus>) {
  const next = { ...status, ...patch }
  // Se evita re-renderizar media aplicación si nada cambió de verdad.
  if (
    next.state === status.state &&
    next.pending === status.pending &&
    next.detail === status.detail
  ) {
    return
  }

  status = {
    ...next,
    since: next.state === "ok" ? null : (status.since ?? new Date()),
  }
  emit()
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSyncStatus(): SyncStatus {
  return status
}

/**
 * Clasifica un error de Firestore.
 *
 * Se llama desde los `catch` de las vistas. No hace falta envolver cada
 * operación: basta con que las escrituras importantes (venta, producto, caja)
 * reporten aquí lo que falló.
 */
export function reportFirestoreError(error: unknown): SyncState {
  const code = (error as { code?: string })?.code ?? ""
  const message = error instanceof Error ? error.message : String(error)

  if (code === "resource-exhausted") {
    setStatus({ state: "quota", pending: true, detail: message })
    return "quota"
  }

  if (code === "unavailable" || code === "deadline-exceeded" || !navigator.onLine) {
    setStatus({ state: "offline", pending: true, detail: message })
    return "offline"
  }

  if (code === "permission-denied") {
    setStatus({ state: "denied", detail: message })
    return "denied"
  }

  setStatus({ state: "error", detail: message })
  return "error"
}

/** Todo salió bien: se limpia cualquier aviso anterior. */
export function reportFirestoreSuccess(): void {
  if (status.state !== "ok" || status.pending) {
    setStatus({ state: "ok", pending: false, detail: null })
  }
}

let watching = false

/**
 * Arranca la vigilancia. Se llama una sola vez, desde el proveedor.
 *
 * Combina tres señales:
 *  · Los eventos online/offline del navegador, que son inmediatos.
 *  · `waitForPendingWrites()`, que resuelve cuando el servidor confirmó todo lo
 *    que había en la cola: es la señal fiable de "ya subió".
 *  · Lo que reporten las vistas cuando una operación falla.
 */
export function startSyncWatcher(): () => void {
  if (typeof window === "undefined" || watching) return () => {}
  watching = true

  const handleOffline = () => {
    setStatus({ state: "offline", pending: true, detail: "El navegador quedó sin conexión." })
  }

  const handleOnline = async () => {
    // Al volver la conexión se fuerza la reconexión: si Firestore se había
    // rendido tras muchos reintentos, esto lo despierta en el acto en vez de
    // esperar al siguiente reintento con espera exponencial.
    try {
      await enableNetwork(db)
      await waitForPendingWrites(db)
      reportFirestoreSuccess()
    } catch (error) {
      reportFirestoreError(error)
    }
  }

  window.addEventListener("offline", handleOffline)
  window.addEventListener("online", handleOnline)

  if (!navigator.onLine) handleOffline()

  // Comprobación periódica: si había cola pendiente y ya subió, se quita el
  // aviso sin que el usuario tenga que hacer nada.
  const interval = window.setInterval(() => {
    if (status.state === "ok" || status.state === "denied") return

    waitForPendingWrites(db)
      .then(() => reportFirestoreSuccess())
      .catch(() => {
        /* sigue pendiente: el aviso se queda como está */
      })
  }, 20000)

  return () => {
    window.removeEventListener("offline", handleOffline)
    window.removeEventListener("online", handleOnline)
    window.clearInterval(interval)
    watching = false
  }
}

/** Solo para probar el aviso sin desenchufar el router. */
export async function simulateOffline(offline: boolean): Promise<void> {
  if (offline) {
    await disableNetwork(db)
    setStatus({ state: "offline", pending: true, detail: "Modo sin conexión simulado." })
  } else {
    await enableNetwork(db)
    reportFirestoreSuccess()
  }
}
