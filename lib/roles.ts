// /lib/roles.ts
//
// Roles y permisos del sistema.
//
// La regla de oro: este archivo decide qué se MUESTRA, no qué se PERMITE.
// Un usuario puede abrir la consola del navegador y saltarse cualquier
// comprobación de este archivo. La autorización de verdad vive en las reglas de
// seguridad de Firestore (firestore.rules), que se ejecutan en el servidor.
// Las dos capas tienen que decir lo mismo: esta para que la interfaz sea
// honesta, aquella para que sea segura.

export type Role = "owner" | "admin" | "cashier"

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Dueño",
  admin: "Encargado",
  cashier: "Cajero",
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Control total, incluidos el plan, los usuarios y los datos del negocio.",
  admin: "Toda la operación diaria: inventario, precios, reportes y cierres de caja.",
  cashier: "Vender y consultar. No ve costos ni utilidad, ni modifica el inventario.",
}

export type Permission =
  // Ventas
  | "sales.create"
  | "sales.void" // anular una venta (deja rastro, no la borra)
  | "sales.viewAll" // ver las ventas de todos, no solo las propias
  // Inventario
  | "products.view"
  | "products.create"
  | "products.edit"
  | "products.delete"
  | "products.adjustStock"
  // Dinero
  | "costs.view" // ver costo y utilidad
  | "prices.edit"
  | "pricing.settings"
  // Caja
  | "cash.openShift"
  | "cash.closeOwnShift"
  | "cash.closeAnyShift"
  | "cash.movements" // entradas y salidas que no son ventas
  // Informes y configuración
  | "reports.view"
  | "reports.export"
  | "business.settings"
  | "users.manage"
  | "plan.manage"

/**
 * Qué puede hacer cada rol.
 *
 * Decisiones que conviene entender antes de tocar esta tabla:
 *
 * · El cajero NO tiene `costs.view`. Esto importa más que el inventario: si el
 *   cajero ve a cuánto compras, se lo lleva puesto el día que se vaya a
 *   trabajar con la competencia, o se lo cuenta a un cliente.
 *
 * · El cajero NO tiene `products.edit` ni `products.adjustStock`. Si falta
 *   mercancía, lo reporta; el ajuste lo hace el encargado y queda registrado.
 *   Un cajero que puede "cuadrar" el stock puede tapar un faltante.
 *
 * · El cajero SÍ tiene `sales.void`: es el "corregir errores eventuales". Anular
 *   no borra: crea un movimiento contrario, devuelve el stock y deja las dos
 *   entradas en el historial con el motivo y quién lo hizo.
 *
 * · El cajero cierra su propio turno pero no el de otro (`cash.closeOwnShift`
 *   sin `cash.closeAnyShift`): así nadie cierra la caja ajena.
 */
const PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    "sales.create",
    "sales.void",
    "sales.viewAll",
    "products.view",
    "products.create",
    "products.edit",
    "products.delete",
    "products.adjustStock",
    "costs.view",
    "prices.edit",
    "pricing.settings",
    "cash.openShift",
    "cash.closeOwnShift",
    "cash.closeAnyShift",
    "cash.movements",
    "reports.view",
    "reports.export",
    "business.settings",
    "users.manage",
    "plan.manage",
  ],
  admin: [
    "sales.create",
    "sales.void",
    "sales.viewAll",
    "products.view",
    "products.create",
    "products.edit",
    "products.delete",
    "products.adjustStock",
    "costs.view",
    "prices.edit",
    "pricing.settings",
    "cash.openShift",
    "cash.closeOwnShift",
    "cash.closeAnyShift",
    "cash.movements",
    "reports.view",
    "reports.export",
    "business.settings",
  ],
  cashier: [
    "sales.create",
    "sales.void",
    "products.view",
    "cash.openShift",
    "cash.closeOwnShift",
    "cash.movements",
  ],
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return PERMISSIONS[role]?.includes(permission) ?? false
}

/** Comprueba varios permisos a la vez. Útil para ocultar secciones enteras. */
export function canAny(role: Role | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(role, permission))
}

export function isValidRole(value: unknown): value is Role {
  return value === "owner" || value === "admin" || value === "cashier"
}

/**
 * Rol por defecto cuando el documento del usuario no lo trae.
 * Se elige el más restrictivo a propósito: si algo falla al leer el rol, la
 * persona ve de menos, nunca de más.
 */
export const FALLBACK_ROLE: Role = "cashier"

/** Módulos que puede ver cada rol, en el orden en que aparecen en el menú. */
export function visibleModules(role: Role | null | undefined): string[] {
  const modules = ["sales", "cash"]

  if (can(role, "products.view")) modules.push("products")
  if (can(role, "reports.view")) modules.push("statistics", "reports")

  modules.push("calculator")

  if (can(role, "users.manage")) modules.push("team")

  return modules
}
