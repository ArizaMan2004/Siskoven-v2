"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { popIn } from "@/lib/motion"

/**
 * Registra el service worker y avisa cuando hay una versión nueva.
 *
 * El aviso importa: sin él, quien tenga la aplicación instalada seguiría
 * usando la versión guardada en caché indefinidamente. Con una caja
 * registrando dinero, quedarse en una versión vieja con un bug ya corregido no
 * es aceptable.
 */
export default function ServiceWorkerRegistrar() {
  const [hayActualizacion, setHayActualizacion] = useState(false)
  const [registro, setRegistro] = useState<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    // En desarrollo estorba: cachearía código que cambia a cada guardado.
    if (process.env.NODE_ENV !== "production") return

    let cancelado = false

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (cancelado) return
        setRegistro(reg)

        // Ya había una versión esperando de una visita anterior.
        if (reg.waiting) setHayActualizacion(true)

        reg.addEventListener("updatefound", () => {
          const nuevo = reg.installing
          if (!nuevo) return

          nuevo.addEventListener("statechange", () => {
            // "installed" con un controlador ya activo significa que esta es
            // una actualización, no la primera instalación.
            if (nuevo.state === "installed" && navigator.serviceWorker.controller) {
              setHayActualizacion(true)
            }
          })
        })
      })
      .catch((error) => {
        // Que falle el registro no debe impedir usar la aplicación: solo se
        // pierde la capacidad de abrir sin conexión.
        console.warn("No se pudo registrar el service worker:", error)
      })

    return () => {
      cancelado = true
    }
  }, [])

  const actualizar = () => {
    registro?.waiting?.postMessage("skip-waiting")
    // Se recarga cuando el service worker nuevo toma el control, no antes: si
    // se recargara ya, volvería a servir la versión vieja.
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
      once: true,
    })
  }

  return (
    <AnimatePresence>
      {hayActualizacion && (
        <m.div
          variants={popIn}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="bg-card fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border p-3 shadow-lg lg:bottom-6"
        >
          <RefreshCw className="text-primary size-5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">
            Hay una versión nueva de Siskoven.
          </p>
          <Button size="sm" onClick={actualizar} className="shrink-0">
            Actualizar
          </Button>
        </m.div>
      )}
    </AnimatePresence>
  )
}
