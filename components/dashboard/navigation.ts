import {
  BarChart3,
  Calculator,
  FileText,
  Home,
  Landmark,
  Package,
  PieChart,
  Receipt,
  ShoppingCart,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { type Permission, type PermissionSource, can } from "@/lib/roles"

export interface NavItem {
  id: string
  /** Etiqueta completa, para la barra lateral. */
  label: string
  /** Etiqueta corta para la barra inferior del móvil, donde no caben dos palabras. */
  shortLabel: string
  icon: LucideIcon
  /** Permiso necesario para ver el módulo. Sin él, cualquiera lo ve. */
  requires?: Permission
  /** Sección de la barra lateral. */
  grupo: GrupoId
  /**
   * Prioridad en la barra inferior del móvil, donde solo caben cuatro.
   * Menor es antes. Sin número, el módulo solo aparece en "Más".
   */
  movil?: number
}

export type GrupoId = "operacion" | "negocio" | "analisis" | "ajustes"

export const GRUPOS: Array<{ id: GrupoId; label: string }> = [
  { id: "operacion", label: "Día a día" },
  { id: "negocio", label: "Tu negocio" },
  { id: "analisis", label: "Cómo va" },
  { id: "ajustes", label: "Configuración" },
]

/**
 * Los módulos del sistema, en un solo sitio: la barra lateral del escritorio y
 * la barra inferior del móvil leen de aquí, así que no pueden desincronizarse.
 *
 * El orden dentro de cada grupo es el de uso, no el alfabético: lo que se abre
 * cien veces al día va arriba.
 */
const ALL_NAV_ITEMS: NavItem[] = [
  {
    id: "home",
    label: "Inicio",
    shortLabel: "Inicio",
    icon: Home,
    grupo: "operacion",
    movil: 1,
  },
  {
    id: "sales",
    label: "Punto de venta",
    shortLabel: "Vender",
    icon: ShoppingCart,
    requires: "sales.create",
    grupo: "operacion",
    movil: 0,
  },
  {
    id: "cash",
    label: "Caja",
    shortLabel: "Caja",
    icon: Wallet,
    requires: "cash.openShift",
    grupo: "operacion",
    movil: 2,
  },
  {
    id: "products",
    label: "Productos",
    shortLabel: "Productos",
    icon: Package,
    requires: "products.view",
    grupo: "negocio",
    movil: 3,
  },
  {
    id: "clientes",
    label: "Clientes",
    shortLabel: "Clientes",
    icon: Users,
    requires: "customers.view",
    grupo: "negocio",
    movil: 4,
  },
  {
    id: "cuentas",
    label: "Cuentas",
    shortLabel: "Cuentas",
    icon: Landmark,
    requires: "accounts.view",
    grupo: "negocio",
  },
  {
    id: "gastos",
    label: "Gastos",
    shortLabel: "Gastos",
    icon: Receipt,
    requires: "expenses.view",
    grupo: "negocio",
  },
  {
    id: "resumen",
    label: "Resumen",
    shortLabel: "Resumen",
    icon: PieChart,
    requires: "reports.view",
    grupo: "analisis",
  },
  {
    id: "statistics",
    label: "Estadísticas",
    shortLabel: "Números",
    icon: BarChart3,
    requires: "reports.view",
    grupo: "analisis",
  },
  {
    id: "reports",
    label: "Reportes",
    shortLabel: "Reportes",
    icon: FileText,
    requires: "reports.view",
    grupo: "analisis",
  },
  {
    id: "equipo",
    label: "Equipo",
    shortLabel: "Equipo",
    icon: UsersRound,
    requires: "users.manage",
    grupo: "ajustes",
  },
  {
    id: "calculator",
    label: "Calculadora",
    shortLabel: "Calcular",
    icon: Calculator,
    grupo: "ajustes",
  },
]

/**
 * Módulos visibles para alguien.
 *
 * Acepta la lista de permisos o el rol heredado: las dos formas resuelven igual,
 * y así la maqueta puede pedir "lo que vería un cajero" sin inventarse un
 * usuario.
 */
export function navItemsFor(source: PermissionSource): NavItem[] {
  return ALL_NAV_ITEMS.filter((item) => !item.requires || can(source, item.requires))
}

/** Los mismos módulos, repartidos en las secciones de la barra lateral. */
export function navGroupsFor(source: PermissionSource): Array<{
  id: GrupoId
  label: string
  items: NavItem[]
}> {
  const items = navItemsFor(source)

  return GRUPOS.map((grupo) => ({
    ...grupo,
    items: items.filter((item) => item.grupo === grupo.id),
  })).filter((grupo) => grupo.items.length > 0)
}

/**
 * Los cuatro módulos de la barra inferior, y el resto para el menú "Más".
 *
 * Cuatro y no cinco porque el quinto hueco lo ocupa el propio botón de "Más".
 * Meter doce iconos de 30px en el ancho de un teléfono no es una barra de
 * navegación, es una lotería.
 */
export function navSplitMovil(source: PermissionSource): { fijos: NavItem[]; extra: NavItem[] } {
  const items = navItemsFor(source)

  const candidatos = items
    .filter((item) => item.movil !== undefined)
    .sort((a, b) => (a.movil ?? 99) - (b.movil ?? 99))

  const fijos = candidatos.slice(0, 4)
  const idsFijos = new Set(fijos.map((item) => item.id))

  return { fijos, extra: items.filter((item) => !idsFijos.has(item.id)) }
}

/** Compatibilidad para pantallas que aún no filtran por permisos. */
export const NAV_ITEMS = ALL_NAV_ITEMS

export const DEFAULT_VIEW = "home"
