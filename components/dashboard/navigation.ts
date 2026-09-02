import { BarChart3, Calculator, FileText, Landmark, Package, Receipt, ShoppingCart, Wallet } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { type Permission, type Role, can } from "@/lib/roles"

export interface NavItem {
  id: string
  /** Etiqueta completa, para la barra lateral. */
  label: string
  /** Etiqueta corta para la barra inferior del móvil, donde no caben dos palabras. */
  shortLabel: string
  icon: LucideIcon
  /** Permiso necesario para ver el módulo. Sin él, cualquiera lo ve. */
  requires?: Permission
}

/**
 * Los módulos del sistema, en un solo sitio: la barra lateral del escritorio y
 * la barra inferior del móvil leen de aquí, así que no pueden desincronizarse.
 *
 * El orden pone el punto de venta primero porque es lo que más se usa en el
 * día a día de una caja.
 */
const ALL_NAV_ITEMS: NavItem[] = [
  { id: "sales", label: "Punto de venta", shortLabel: "Vender", icon: ShoppingCart, requires: "sales.create" },
  { id: "cash", label: "Caja", shortLabel: "Caja", icon: Wallet, requires: "cash.openShift" },
  { id: "products", label: "Productos", shortLabel: "Productos", icon: Package, requires: "products.view" },
  { id: "cuentas", label: "Cuentas", shortLabel: "Cuentas", icon: Landmark, requires: "accounts.view" },
  { id: "gastos", label: "Gastos", shortLabel: "Gastos", icon: Receipt, requires: "expenses.view" },
  { id: "statistics", label: "Estadísticas", shortLabel: "Números", icon: BarChart3, requires: "reports.view" },
  { id: "reports", label: "Reportes", shortLabel: "Reportes", icon: FileText, requires: "reports.view" },
  { id: "calculator", label: "Calculadora", shortLabel: "Calcular", icon: Calculator },
]

/**
 * Módulos visibles para un rol.
 *
 * Al cajero le quedan cuatro pestañas (vender, caja, productos, calculadora),
 * que es justo lo que cabe cómodo en la barra inferior de un teléfono. No es
 * casualidad: la vista del cajero se diseñó para el turno, no para la oficina.
 */
export function navItemsFor(role: Role | null | undefined): NavItem[] {
  return ALL_NAV_ITEMS.filter((item) => !item.requires || can(role, item.requires))
}

/** Compatibilidad para pantallas que aún no filtran por rol. */
export const NAV_ITEMS = ALL_NAV_ITEMS

export const DEFAULT_VIEW = "sales"
