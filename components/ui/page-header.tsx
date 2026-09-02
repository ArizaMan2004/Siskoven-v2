import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  /** Botones de acción. En móvil bajan a su propia fila y ocupan el ancho. */
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <h2 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        {description ? <p className="text-muted-foreground mt-0.5 text-sm">{description}</p> : null}
      </div>

      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/**
 * Estado vacío. Un "no hay nada" siempre dice por qué y qué hacer a
 * continuación, en vez de dejar un hueco en blanco.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {Icon ? (
        <div className="bg-muted mb-3 flex size-12 items-center justify-center rounded-full">
          <Icon className="text-muted-foreground size-6" aria-hidden />
        </div>
      ) : null}
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
