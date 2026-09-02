"use client"

import type { ReactNode } from "react"
import { m } from "framer-motion"
import { X } from "lucide-react"
import { popIn } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface ModalShellProps {
  children: ReactNode
  onClose: () => void
  /** Título accesible. Sin él, un lector de pantalla anuncia un diálogo sin nombre. */
  title?: string
  /** Ancho máximo en escritorio. Por defecto, el de un formulario corto. */
  size?: "sm" | "md" | "lg"
  className?: string
}

const ANCHOS = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
} as const

/**
 * Envoltorio de los diálogos del panel.
 *
 * En móvil se pega al borde inferior (`items-end`) y en escritorio se centra:
 * un cuadro centrado en un teléfono queda justo donde no llega el pulgar, y en
 * un portátil uno pegado abajo se ve fuera de sitio.
 *
 * El clic en el fondo cierra; el clic dentro no se propaga. Sin ese `stop`, cada
 * pulsación sobre un campo del formulario cerraría el diálogo.
 */
export function ModalShell({ children, onClose, title, size = "md", className }: ModalShellProps) {
  return (
    <m.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <m.div
        variants={popIn}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "bg-card max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border p-5 shadow-lg sm:max-h-[85vh] sm:rounded-xl",
          ANCHOS[size],
          className,
        )}
      >
        {children}
      </m.div>
    </m.div>
  )
}

/** Cabecera con título y aspa. Se repite en todos los diálogos. */
export function ModalHeader({
  title,
  description,
  onClose,
}: {
  title: string
  description?: string
  onClose: () => void
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold">{title}</h3>
        {description ? (
          <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="text-muted-foreground hover:text-foreground -m-2 shrink-0 p-2"
      >
        <X className="size-5" aria-hidden />
      </button>
    </div>
  )
}
