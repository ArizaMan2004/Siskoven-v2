"use client"

import { useEffect, useSyncExternalStore } from "react"
import { AnimatePresence, m } from "framer-motion"
import { AlertTriangle, CloudOff, ShieldAlert, WifiOff } from "lucide-react"
import {
  type SyncStatus,
  getSyncStatus,
  startSyncWatcher,
  subscribeSync,
} from "@/lib/sync-status"

const SERVER_SNAPSHOT: SyncStatus = { state: "ok", pending: false, since: null, detail: null }

/**
 * Textos del aviso.
 *
 * Tienen que tranquilizar SIN mentir. Cuando el problema se arregla solo
 * (sin conexión, cuota agotada) se dice claramente que no se pierde nada,
 * porque es cierto: la cola de escrituras vive en el disco del navegador.
 * Cuando NO se arregla solo (permiso denegado) se dice tal cual, porque
 * prometer una recuperación que no va a ocurrir es peor que el propio fallo.
 */
const MESSAGES = {
  offline: {
    icon: WifiOff,
    title: "Sin conexión — puedes seguir vendiendo",
    body: "Tus ventas se están guardando en este dispositivo y subirán solas en cuanto vuelva el internet. No cierres sesión ni borres los datos del navegador.",
    tone: "warning" as const,
  },
  quota: {
    icon: CloudOff,
    title: "El servidor alcanzó su límite del día",
    body: "No se pierde nada: lo que registres queda guardado aquí y se sube en la siguiente jornada, cuando el límite se reinicia. Sigue trabajando con normalidad.",
    tone: "warning" as const,
  },
  denied: {
    icon: ShieldAlert,
    title: "Tu cuenta no tiene permiso para esta operación",
    body: "Esto no se resuelve solo. Puede ser que tu período de prueba haya terminado o que tu rol no permita esta acción. Contacta al administrador.",
    tone: "destructive" as const,
  },
  error: {
    icon: AlertTriangle,
    title: "Hubo un problema al guardar",
    body: "Vuelve a intentarlo. Si sigue pasando, avisa al administrador antes de seguir cobrando.",
    tone: "destructive" as const,
  },
}

/**
 * Franja de estado de sincronización.
 *
 * Se coloca bajo la cabecera y solo aparece cuando algo va mal: una barra
 * permanente de "todo bien" es ruido que la gente deja de mirar, y entonces
 * tampoco ve la de verdad.
 */
export default function SyncBanner() {
  const status = useSyncExternalStore(subscribeSync, getSyncStatus, () => SERVER_SNAPSHOT)

  useEffect(() => startSyncWatcher(), [])

  const config = status.state === "ok" ? null : MESSAGES[status.state]

  return (
    <AnimatePresence initial={false}>
      {config ? (
        <m.div
          // Solo se anima la opacidad y el desplazamiento: animar la altura
          // obligaría a recalcular el diseño de toda la página en cada
          // fotograma, justo cuando el dispositivo ya va con dificultades.
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          role="status"
          aria-live="polite"
          className={
            config.tone === "destructive"
              ? "bg-destructive/10 text-destructive px-4 py-2.5 sm:px-6"
              : "bg-warning/15 text-warning-foreground dark:text-warning px-4 py-2.5 sm:px-6"
          }
        >
          <div className="mx-auto flex max-w-4xl items-start gap-2.5">
            <config.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 text-xs sm:text-sm">
              <p className="font-semibold">{config.title}</p>
              <p className="mt-0.5 opacity-90">{config.body}</p>
            </div>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  )
}
