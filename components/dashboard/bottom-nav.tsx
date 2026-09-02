"use client"

import { useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import { MoreHorizontal, X } from "lucide-react"
import type { NavItem } from "./navigation"
import { fade, popIn, springSoft, tapScale } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface BottomNavProps {
  /** Los cuatro que van siempre a la vista. */
  fijos: NavItem[]
  /** El resto, que vive detrás de "Más". */
  extra: NavItem[]
  activeView: string
  setActiveView: (view: string) => void
}

/**
 * Navegación inferior para teléfono y tablet.
 *
 * Sustituye al menú lateral desplegable con hamburguesa: en un teléfono, la caja
 * necesita saltar entre vender y consultar un producto con el pulgar, sin abrir
 * un cajón cada vez.
 *
 * Cuatro destinos fijos y un "Más" para el resto. La alternativa —meter los doce
 * módulos en la barra— daba iconos de 30 píxeles pegados unos a otros: no es una
 * barra de navegación, es una lotería. Los cuatro fijos son los del turno
 * (vender, inicio, caja, productos); lo de oficina se consulta de vez en cuando
 * y aguanta un toque extra.
 */
export default function BottomNav({ fijos, extra, activeView, setActiveView }: BottomNavProps) {
  const [abierto, setAbierto] = useState(false)

  // Si el módulo abierto vive dentro de "Más", el botón se marca como activo:
  // si no, la barra entera parecería no tener nada seleccionado.
  const activoEnExtra = extra.some((item) => item.id === activeView)

  const ir = (id: string) => {
    setActiveView(id)
    setAbierto(false)
  }

  return (
    <>
      <AnimatePresence>
        {abierto && (
          <>
            <m.div
              variants={fade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              onClick={() => setAbierto(false)}
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              aria-hidden
            />

            <m.div
              variants={popIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              role="dialog"
              aria-label="Más módulos"
              className="bg-card pb-safe fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t p-4 shadow-2xl lg:hidden"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold">Más</p>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                  className="text-muted-foreground hover:text-foreground -m-2 p-2"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>

              <ul className="grid grid-cols-3 gap-2">
                {extra.map((item) => {
                  const Icon = item.icon
                  const isActive = activeView === item.id

                  return (
                    <li key={item.id}>
                      <m.button
                        type="button"
                        whileTap={tapScale}
                        onClick={() => ir(item.id)}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-colors",
                          isActive
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "hover:bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="size-5" aria-hidden />
                        <span className="text-center text-xs leading-tight font-medium">
                          {item.label}
                        </span>
                      </m.button>
                    </li>
                  )
                })}
              </ul>
            </m.div>
          </>
        )}
      </AnimatePresence>

      <nav
        aria-label="Navegación principal"
        className="bg-card/95 pb-safe fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-sm lg:hidden"
      >
        <ul className="mx-auto flex max-w-2xl items-stretch">
          {fijos.map((item) => {
            const Icon = item.icon
            const isActive = activeView === item.id

            return (
              <li key={item.id} className="flex-1">
                <m.button
                  type="button"
                  whileTap={tapScale}
                  onClick={() => ir(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  // Alto mínimo de 56px: es el tamaño de objetivo táctil que se
                  // acierta con el pulgar sin mirar.
                  className={cn(
                    "flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {/* La pastilla marca el activo además del color, para que no
                      dependa solo del tono. Con layoutId, framer-motion la
                      desliza de una pestaña a otra en vez de hacerla parpadear:
                      es una sola transformación, no una animación por pestaña. */}
                  <span className="relative flex items-center justify-center px-3 py-1">
                    {isActive ? (
                      <m.span
                        layoutId="bottom-nav-pill"
                        transition={springSoft}
                        className="bg-primary/10 absolute inset-0 rounded-full"
                      />
                    ) : null}
                    <Icon className="relative size-5" aria-hidden />
                  </span>
                  <span className={cn("text-[11px] leading-none", isActive && "font-semibold")}>
                    {item.shortLabel}
                  </span>
                </m.button>
              </li>
            )
          })}

          {extra.length > 0 && (
            <li className="flex-1">
              <m.button
                type="button"
                whileTap={tapScale}
                onClick={() => setAbierto(true)}
                aria-expanded={abierto}
                className={cn(
                  "flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 transition-colors",
                  activoEnExtra ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative flex items-center justify-center px-3 py-1">
                  {activoEnExtra ? (
                    <m.span
                      layoutId="bottom-nav-pill"
                      transition={springSoft}
                      className="bg-primary/10 absolute inset-0 rounded-full"
                    />
                  ) : null}
                  <MoreHorizontal className="relative size-5" aria-hidden />
                </span>
                <span className={cn("text-[11px] leading-none", activoEnExtra && "font-semibold")}>
                  Más
                </span>
              </m.button>
            </li>
          )}
        </ul>
      </nav>
    </>
  )
}
