"use client"

import { m } from "framer-motion"
import type { NavItem } from "./navigation"
import { springSoft, tapScale } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface BottomNavProps {
  /** Módulos ya filtrados por rol. */
  items: NavItem[]
  activeView: string
  setActiveView: (view: string) => void
}

/**
 * Navegación inferior para teléfono y tablet.
 *
 * Sustituye al menú lateral desplegable con hamburguesa: en un teléfono, la
 * caja necesita saltar entre vender y consultar un producto con el pulgar, sin
 * abrir un cajón cada vez. Los destinos quedan siempre a la vista y al alcance.
 */
export default function BottomNav({ items, activeView, setActiveView }: BottomNavProps) {
  return (
    <nav
      aria-label="Navegación principal"
      className="bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-sm lg:hidden pb-safe"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = activeView === item.id

          return (
            <li key={item.id} className="flex-1">
              <m.button
                type="button"
                whileTap={tapScale}
                onClick={() => setActiveView(item.id)}
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
      </ul>
    </nav>
  )
}
