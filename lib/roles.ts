// /lib/roles.ts
//
// Permisos del sistema, y los roles que los agrupan.
//
// LA REGLA DE ORO: este archivo decide qué se MUESTRA, no qué se PERMITE.
// Cualquiera puede abrir la consola del navegador y saltarse todo lo de aquí.
// La autorización de verdad vive en firestore.rules, que corre en el servidor.
// Las dos capas tienen que decir lo mismo: esta para que la interfaz sea
// honesta, aquella para que sea segura.
//
// POR QUÉ LOS ROLES LOS CREA EL DUEÑO
//
// Tres roles fijos no le sirven a nadie mucho tiempo. Una bodega quiere un
// cajero que además reciba mercancía; un taller quiere que el técnico vea
// costos pero no toque la caja; una tienda con dos socios quiere que el segundo
// lo vea todo menos el plan. Cada negocio inventa su propio reparto, y ninguna
// lista cerrada lo acierta.
//
// Así que los roles son documentos: el dueño crea "Cajero de tarde" o
// "Encargado de depósito" y marca las casillas que quiera. Las plantillas de
// abajo son el punto de partida, para no obligar a nadie a empezar desde una
// hoja en blanco.
//
// CÓMO LLEGA ESO A LAS REGLAS DE SEGURIDAD
//
// Las reglas no pueden ir a buscar el documento del rol sin pagar una lectura
// extra en CADA operación. Por eso la lista de permisos se copia al documento
// del usuario (usuarios/{uid}.permisos), que las reglas ya leen de todas
// formas. Cuando el dueño edita un rol se reescriben de una vez los usuarios
// que lo tienen: un lote de escrituras poco frecuentes a cambio de no pagar una
// lectura por cada venta.
//
// Consecuencia: usuarios/{uid}.permisos es la fuente de verdad para PERMITIR, y
// roles/{id}.permisos la fuente de verdad para EDITAR. Si se desincronizan
// manda el usuario, y sincronizarRol() los vuelve a igualar.

export type Permission =
  // Ventas
  | "sales.create"
  | "sales.void" // anular una venta (deja rastro, no la borra)
  | "sales.viewAll" // ver las ventas de todos, no solo las propias
  | "sales.discount" // aplicar descuentos a mano
  | "sales.credit" // vender fiado
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
  | "accounts.view" // saldos de las cuentas y libro de movimientos
  | "accounts.manage" // crear cuentas, transferir entre ellas
  | "expenses.view"
  | "expenses.create"
  // Clientes
  | "customers.view"
  | "customers.manage"
  | "receivables.collect" // registrar abonos de lo fiado
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

export interface PermissionDef {
  id: Permission
  label: string
  /** Qué implica de verdad, en una línea. Se enseña bajo la casilla. */
  ayuda: string
  /**
   * Marcar este permiso obliga a marcar también estos otros.
   * No es cortesía: sin ellos el permiso no hace nada, y el dueño se queda
   * pensando que lo dio cuando no dio nada.
   */
  requiere?: Permission[]
  /** Da acceso a información que el dueño quizá no quiera repartir. */
  sensible?: boolean
}

export interface PermissionGroup {
  id: string
  label: string
  descripcion: string
  permisos: PermissionDef[]
}

/**
 * Los permisos agrupados por módulo, tal como se pintan en la pantalla de
 * roles. El texto de ayuda importa tanto como la casilla: quien reparte
 * permisos casi nunca es programador, y "products.adjustStock" no le dice nada.
 */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "ventas",
    label: "Ventas",
    descripcion: "El día a día del mostrador.",
    permisos: [
      { id: "sales.create", label: "Facturar", ayuda: "Cobrar y emitir la venta." },
      {
        id: "sales.void",
        label: "Anular ventas",
        ayuda: "Corregir un error. No borra: deja las dos entradas en el historial.",
        requiere: ["sales.create"],
      },
      {
        id: "sales.discount",
        label: "Aplicar descuentos",
        ayuda: "Rebajar el precio a mano al cobrar.",
        requiere: ["sales.create"],
        sensible: true,
      },
      {
        id: "sales.credit",
        label: "Vender fiado",
        ayuda: "Entregar mercancía sin cobrar y dejarla como deuda del cliente.",
        requiere: ["sales.create", "customers.view"],
        sensible: true,
      },
      {
        id: "sales.viewAll",
        label: "Ver las ventas de todos",
        ayuda: "Sin esto, cada quien ve solo las suyas.",
      },
    ],
  },
  {
    id: "inventario",
    label: "Inventario",
    descripcion: "Qué hay, cuánto queda y a cuánto se vende.",
    permisos: [
      { id: "products.view", label: "Ver productos", ayuda: "Hace falta para poder vender." },
      {
        id: "products.create",
        label: "Crear productos",
        ayuda: "Dar de alta artículos nuevos.",
        requiere: ["products.view"],
      },
      {
        id: "products.edit",
        label: "Editar productos",
        ayuda: "Cambiar nombre, categoría o datos.",
        requiere: ["products.view"],
      },
      {
        id: "products.delete",
        label: "Eliminar productos",
        ayuda: "Borrar del catálogo.",
        requiere: ["products.view"],
      },
      {
        id: "products.adjustStock",
        label: "Ajustar existencias",
        ayuda: "Corregir cantidades a mano. Quien puede cuadrar el stock puede tapar un faltante.",
        requiere: ["products.view"],
        sensible: true,
      },
      {
        id: "prices.edit",
        label: "Cambiar precios",
        ayuda: "Fijar a cuánto se vende cada cosa.",
        requiere: ["products.view"],
        sensible: true,
      },
    ],
  },
  {
    id: "dinero",
    label: "Dinero del negocio",
    descripcion: "Lo que casi nunca se reparte fuera de la familia.",
    permisos: [
      {
        id: "costs.view",
        label: "Ver costos y utilidad",
        ayuda:
          "A cuánto compras y cuánto ganas. Es lo primero que se lleva quien se va a la competencia.",
        sensible: true,
      },
      {
        id: "accounts.view",
        label: "Ver las cuentas",
        ayuda: "Saldos y libro de movimientos.",
        sensible: true,
      },
      {
        id: "accounts.manage",
        label: "Mover entre cuentas",
        ayuda: "Crear cuentas y transferir dinero.",
        requiere: ["accounts.view"],
        sensible: true,
      },
      { id: "expenses.view", label: "Ver gastos", ayuda: "En qué se va la plata.", sensible: true },
      {
        id: "expenses.create",
        label: "Registrar gastos",
        ayuda: "Anotar una compra o un pago.",
        requiere: ["expenses.view"],
      },
      {
        id: "pricing.settings",
        label: "Ajustes de cobro",
        ayuda: "Redondeo, descuento en divisa, impuestos.",
        sensible: true,
      },
    ],
  },
  {
    id: "clientes",
    label: "Clientes",
    descripcion: "Quién compra y quién debe.",
    permisos: [
      { id: "customers.view", label: "Ver clientes", ayuda: "Consultar la lista y sus datos." },
      {
        id: "customers.manage",
        label: "Crear y editar clientes",
        ayuda: "Dar de alta y corregir datos.",
        requiere: ["customers.view"],
      },
      {
        id: "receivables.collect",
        label: "Cobrar lo fiado",
        ayuda: "Registrar abonos a las deudas.",
        requiere: ["customers.view"],
        sensible: true,
      },
    ],
  },
  {
    id: "caja",
    label: "Caja",
    descripcion: "Apertura, cierre y movimientos del turno.",
    permisos: [
      {
        id: "cash.openShift",
        label: "Abrir turno",
        ayuda: "Empezar la jornada declarando el fondo.",
      },
      {
        id: "cash.closeOwnShift",
        label: "Cerrar su turno",
        ayuda: "Contar y cerrar lo suyo.",
        requiere: ["cash.openShift"],
      },
      {
        id: "cash.closeAnyShift",
        label: "Cerrar el turno de otro",
        ayuda: "Para cuando alguien se fue sin cerrar. Sin esto, nadie cierra la caja ajena.",
        requiere: ["cash.openShift"],
        sensible: true,
      },
      {
        id: "cash.movements",
        label: "Entradas y salidas",
        ayuda: "Sacar o meter dinero que no es una venta.",
        requiere: ["cash.openShift"],
      },
    ],
  },
  {
    id: "administracion",
    label: "Administración",
    descripcion: "Lo que configura el negocio entero.",
    permisos: [
      {
        id: "reports.view",
        label: "Ver reportes y estadísticas",
        ayuda: "Cómo va el negocio.",
        sensible: true,
      },
      {
        id: "reports.export",
        label: "Exportar",
        ayuda: "Descargar en Excel o PDF.",
        requiere: ["reports.view"],
        sensible: true,
      },
      {
        id: "business.settings",
        label: "Datos del negocio",
        ayuda: "Nombre, RIF, dirección, impresión.",
      },
      {
        id: "users.manage",
        label: "Gestionar el equipo",
        ayuda:
          "Crear roles y repartir permisos. Quien tiene esto puede darse cualquier otro permiso.",
        sensible: true,
      },
      {
        id: "plan.manage",
        label: "Plan y pagos",
        ayuda: "La suscripción de Siskoven.",
        sensible: true,
      },
    ],
  },
]

/** Todos los permisos, en orden de pantalla. */
export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((grupo) =>
  grupo.permisos.map((permiso) => permiso.id),
)

const PERMISSION_INDEX = new Map<Permission, PermissionDef>(
  PERMISSION_GROUPS.flatMap((grupo) => grupo.permisos.map((p) => [p.id, p] as const)),
)

export function permissionDef(id: Permission): PermissionDef | undefined {
  return PERMISSION_INDEX.get(id)
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * Los roles heredados, que ahora hacen de plantillas.
 *
 * `owner` es distinto de los otros dos: no es una plantilla editable sino una
 * condición del sistema. El dueño lo puede todo por definición y no se le pueden
 * recortar permisos, porque el único que podría recortárselos es él mismo, y se
 * quedaría fuera de su propio negocio sin forma de volver a entrar.
 */
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

/** El dueño no tiene lista: tiene todo. */
const OWNER_PERMISSIONS: Permission[] = [...ALL_PERMISSIONS]

const ADMIN_PERMISSIONS: Permission[] = [
  "sales.create",
  "sales.void",
  "sales.viewAll",
  "sales.discount",
  "sales.credit",
  "products.view",
  "products.create",
  "products.edit",
  "products.delete",
  "products.adjustStock",
  "costs.view",
  "prices.edit",
  "pricing.settings",
  "customers.view",
  "customers.manage",
  "receivables.collect",
  "cash.openShift",
  "cash.closeOwnShift",
  "cash.closeAnyShift",
  "cash.movements",
  "reports.view",
  "reports.export",
  "business.settings",
]

/**
 * El cajero, a propósito sin costos ni ajuste de stock.
 *
 * Sí lleva `sales.void`: anular es el "corregir errores eventuales" del turno, y
 * no borra nada — crea un movimiento contrario, devuelve el stock y deja las dos
 * entradas en el historial con el motivo y quién lo hizo.
 *
 * Cierra su turno pero no el de otro, para que nadie cuadre la caja ajena.
 */
const CASHIER_PERMISSIONS: Permission[] = [
  "sales.create",
  "sales.void",
  "products.view",
  "customers.view",
  "cash.openShift",
  "cash.closeOwnShift",
  "cash.movements",
]

export const PERMISOS_POR_ROL: Record<Role, Permission[]> = {
  owner: OWNER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  cashier: CASHIER_PERMISSIONS,
}

export interface Plantilla {
  id: Role
  nombre: string
  descripcion: string
  permisos: Permission[]
}

/** Puntos de partida para crear un rol. Nadie empieza en una hoja en blanco. */
export const PLANTILLAS: Plantilla[] = [
  {
    id: "admin",
    nombre: "Encargado",
    descripcion: ROLE_DESCRIPTIONS.admin,
    permisos: ADMIN_PERMISSIONS,
  },
  {
    id: "cashier",
    nombre: "Cajero",
    descripcion: ROLE_DESCRIPTIONS.cashier,
    permisos: CASHIER_PERMISSIONS,
  },
]

/** Un rol creado por el dueño. */
export interface RolPersonalizado {
  id: string
  negocioId: string
  nombre: string
  descripcion?: string
  permisos: Permission[]
  /** Cuántas personas lo tienen. Se calcula al listar; no se guarda. */
  miembros?: number
}

// ---------------------------------------------------------------------------
// Comprobación
// ---------------------------------------------------------------------------

/**
 * De dónde salen los permisos de alguien.
 *
 * Acepta las dos formas a propósito: la lista explícita (lo normal desde que los
 * roles son documentos) y el rol heredado, para las cuentas creadas antes de
 * este cambio y para las maquetas, que no tienen usuario detrás.
 */
export type PermissionSource = Role | Permission[] | null | undefined

export function isValidRole(value: unknown): value is Role {
  return value === "owner" || value === "admin" || value === "cashier"
}

/** Resuelve cualquiera de las dos formas a una lista de permisos. */
export function permisosDe(source: PermissionSource): Permission[] {
  if (!source) return []
  if (Array.isArray(source)) return source
  return PERMISOS_POR_ROL[source] ?? []
}

export function can(source: PermissionSource, permission: Permission): boolean {
  if (Array.isArray(source)) return source.includes(permission)
  if (!source) return false
  // El dueño no se consulta en ninguna lista: lo puede todo, siempre.
  if (source === "owner") return true
  return PERMISOS_POR_ROL[source]?.includes(permission) ?? false
}

/** Comprueba varios permisos a la vez. Útil para ocultar secciones enteras. */
export function canAny(source: PermissionSource, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(source, permission))
}

/**
 * Rol por defecto cuando el documento del usuario no lo trae.
 * Se elige el más restrictivo a propósito: si algo falla al leer el rol, la
 * persona ve de menos, nunca de más.
 */
export const FALLBACK_ROLE: Role = "cashier"

/**
 * Completa las dependencias de una selección de permisos.
 *
 * Marcar "vender fiado" sin "ver clientes" produce un rol que no le puede fiar a
 * nadie: la pantalla que hace falta está oculta. En vez de dejar que el dueño lo
 * descubra el día que su empleado no pueda trabajar, se añaden solas.
 */
export function completarDependencias(permisos: Permission[]): Permission[] {
  const resultado = new Set(permisos)
  let cambio = true

  // En bucle, porque una dependencia puede arrastrar otra.
  while (cambio) {
    cambio = false
    for (const permiso of Array.from(resultado)) {
      for (const requerido of permissionDef(permiso)?.requiere ?? []) {
        if (!resultado.has(requerido)) {
          resultado.add(requerido)
          cambio = true
        }
      }
    }
  }

  return ALL_PERMISSIONS.filter((permiso) => resultado.has(permiso))
}

/**
 * Al quitar un permiso hay que quitar lo que dependía de él.
 *
 * Si no, queda "vender fiado" activo sin "ver clientes", y el rol miente sobre
 * lo que de verdad puede hacer.
 */
export function quitarConDependientes(permisos: Permission[], quitar: Permission): Permission[] {
  const fuera = new Set<Permission>([quitar])
  let cambio = true

  while (cambio) {
    cambio = false
    for (const permiso of ALL_PERMISSIONS) {
      if (fuera.has(permiso)) continue
      const requiere = permissionDef(permiso)?.requiere ?? []
      if (requiere.some((requerido) => fuera.has(requerido))) {
        fuera.add(permiso)
        cambio = true
      }
    }
  }

  return permisos.filter((permiso) => !fuera.has(permiso))
}

/** Módulos que puede ver alguien, en el orden en que aparecen en el menú. */
export function visibleModules(source: PermissionSource): string[] {
  const modules = ["home", "sales", "cash"]

  if (can(source, "products.view")) modules.push("products")
  if (can(source, "customers.view")) modules.push("clientes")
  if (can(source, "accounts.view")) modules.push("cuentas")
  if (can(source, "expenses.view")) modules.push("gastos")
  if (can(source, "reports.view")) modules.push("resumen", "statistics", "reports")

  modules.push("calculator")

  if (can(source, "users.manage")) modules.push("equipo")

  return modules
}
