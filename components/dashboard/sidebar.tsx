"use client"

import Image from "next/image"
import { m } from "framer-motion"
import { LogOut, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import type { GrupoId, NavItem } from "./navigation"
import { springSoft } from "@/lib/motion"
import { useSuperAdmin } from "@/hooks/use-super-admin"
import { cn } from "@/lib/utils"

interface SidebarProps {
  /** Módulos ya filtrados y agrupados por sección. */
  grupos: Array<{ id: GrupoId; label: string; items: NavItem[] }>
  activeView: string
  setActiveView: (view: string) => void
  businessName: string
  userEmail?: string | null
  /** Cómo se llama su rol. Quien usa la caja debe saber con qué permisos entró. */
  roleLabel?: string | null
  onLogout: () => void
}

/**
 * Barra lateral de escritorio (a partir de 1024px). En pantallas menores no se
 * renderiza: ahí manda la barra inferior, que se maneja con el pulgar.
 *
 * Va en secciones porque doce entradas seguidas se leen como una lista de la
 * compra. Agrupadas ("día a día", "tu negocio", "cómo va") se recuerda dónde
 * está cada cosa sin tener que leerlas todas cada vez.
 */
export default function Sidebar({
  grupos,
  activeView,
  setActiveView,
  businessName,
  userEmail,
  roleLabel,
  onLogout,
}: SidebarProps) {
  const { isSuperAdmin } = useSuperAdmin()

  return (
    <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Image
          src="/logo.png"
          alt=""
          width={36}
          height={36}
          className="size-9 object-contain"
          aria-hidden
        />
        <span className="text-primary text-lg font-bold tracking-tight">Siskoven</span>
      </div>

      {/* La lista puede pasar del alto de la pantalla en un portátil pequeño con
          todos los módulos visibles, así que se desplaza sola. */}
      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 pb-2">
        {grupos.map((grupo) => (
          <div key={grupo.id} className="mb-4 last:mb-0">
            <p className="text-muted-foreground/70 px-3 pb-1.5 text-[11px] font-semibold tracking-wider uppercase">
              {grupo.label}
            </p>

            <ul className="space-y-0.5">
              {grupo.items.map((item) => {
                const Icon = item.icon
                const isActive = activeView === item.id

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveView(item.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                      )}
                    >
                      {isActive ? (
                        <m.span
                          layoutId="sidebar-active"
                          transition={springSoft}
                          className="bg-sidebar-accent absolute inset-0 rounded-lg"
                        />
                      ) : null}
                      <Icon className="relative size-4 shrink-0" aria-hidden />
                      <span className="relative truncate">{item.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Panel del SaaS. Solo aparece para quien administra Siskoven; no es un
          rol del negocio sino una lista aparte en Firestore. */}
      {isSuperAdmin && (
        <div className="px-3 pb-2">
          <a
            href="/admin"
            className="text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
          >
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            Administración
          </a>
        </div>
      )}

      <div className="border-sidebar-border space-y-3 border-t p-3">
        <div className="flex items-center justify-between gap-2 px-2">
          <span className="text-muted-foreground text-sm">Tema</span>
          <ThemeToggle />
        </div>

        <div className="min-w-0 px-2">
          <p className="truncate text-sm font-medium">{businessName}</p>
          {userEmail ? <p className="text-muted-foreground truncate text-xs">{userEmail}</p> : null}
          {roleLabel ? (
            <span className="bg-secondary text-secondary-foreground mt-1.5 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium">
              {roleLabel}
            </span>
          ) : null}
        </div>

        <Button
          variant="ghost"
          onClick={onLogout}
          className="text-muted-foreground w-full justify-start gap-2"
        >
          <LogOut className="size-4" aria-hidden />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  )
}
