// /lib/expenses.ts
//
// Gastos, proveedores y salidas de dinero.
//
// DOS TRAMPAS CONTABLES QUE ESTE ARCHIVO EVITA
//
// Casi todos los sistemas para pequeños comercios meten TODA salida de dinero
// en el mismo saco de "gastos". Eso rompe la utilidad de dos formas distintas,
// y las dos hacen que el dueño tome decisiones equivocadas:
//
// 1. LA INVERSIÓN NO ES UN GASTO DEL MES.
//    Compras una nevera de $800. Si entra como gasto de septiembre, septiembre
//    sale en pérdida y los meses siguientes salen artificialmente buenos. La
//    nevera es un activo que sirve durante años: su costo se reparte, no se
//    carga de golpe.
//
// 2. SACAR PLATA PARA TI NO ES UN GASTO.
//    En un negocio de una o dos personas, el dueño saca dinero. Eso es un
//    RETIRO: reparto de una utilidad que ya se ganó, no un costo de operar.
//    Anotarlo como gasto hace que el negocio parezca no dar nada, cuando lo
//    que pasó es que el dueño se pagó.
//
// Por eso hay cinco tipos y solo tres restan de la utilidad.

import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore"
import { db } from "./firebase"

export type TipoGasto = "fijo" | "variable" | "discrecional" | "inversion" | "retiro"

export interface TipoDefinicion {
  id: TipoGasto
  label: string
  descripcion: string
  ejemplos: string
  /** ¿Resta de la utilidad del período? */
  afectaUtilidad: boolean
  /** Color de la etiqueta, en clases de la interfaz. */
  chip: string
}

export const TIPOS_GASTO: TipoDefinicion[] = [
  {
    id: "fijo",
    label: "Fijo",
    descripcion: "Se paga igual vendas mucho o nada.",
    ejemplos: "Alquiler, sueldos, internet, vigilancia",
    afectaUtilidad: true,
    chip: "bg-secondary text-secondary-foreground",
  },
  {
    id: "variable",
    label: "Variable",
    descripcion: "Sube y baja con lo que vendes o produces.",
    ejemplos: "Materia prima, bolsas, flete, comisiones",
    afectaUtilidad: true,
    chip: "bg-primary/10 text-primary",
  },
  {
    id: "discrecional",
    label: "Discrecional",
    descripcion: "Se puede cortar mañana sin que el negocio pare.",
    ejemplos: "Pastel de cumpleaños, adornos, cena del equipo",
    afectaUtilidad: true,
    chip: "bg-warning/20 text-warning-foreground dark:text-warning",
  },
  {
    id: "inversion",
    label: "Inversión",
    descripcion: "Dura años. NO resta de la utilidad de este mes.",
    ejemplos: "Nevera, estantería, balanza, computadora",
    afectaUtilidad: false,
    chip: "bg-accent text-accent-foreground",
  },
  {
    id: "retiro",
    label: "Retiro del dueño",
    descripcion: "Te pagas a ti. NO es un costo del negocio.",
    ejemplos: "Sueldo del dueño, gastos personales, reparto",
    afectaUtilidad: false,
    chip: "bg-muted text-muted-foreground",
  },
]

export function tipoDe(id: TipoGasto): TipoDefinicion {
  return TIPOS_GASTO.find((tipo) => tipo.id === id) ?? TIPOS_GASTO[0]
}

/**
 * Categorías sugeridas por tipo.
 *
 * Son sugerencias, no una lista cerrada: el comercio puede escribir la suya.
 * Una lista cerrada obliga a meter cosas donde no van, y entonces el reporte
 * de gastos deja de servir.
 */
export const CATEGORIAS_SUGERIDAS: Record<TipoGasto, string[]> = {
  fijo: ["Alquiler", "Nómina", "Servicios (luz, agua)", "Internet y teléfono", "Vigilancia", "Contador"],
  variable: [
    "Materia prima",
    "Mercancía para reventa",
    "Empaques y bolsas",
    "Flete y transporte",
    "Comisiones",
    "Combustible",
  ],
  discrecional: ["Agasajos al personal", "Decoración", "Publicidad", "Donaciones", "Otros detalles"],
  inversion: ["Maquinaria y equipos", "Mobiliario", "Vehículos", "Remodelación", "Tecnología"],
  retiro: ["Sueldo del dueño", "Gastos personales", "Reparto de utilidades"],
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

export interface Proveedor {
  id: string
  negocioId: string
  nombre: string
  rif?: string | null
  telefono?: string | null
  /** Qué le compras. Ayuda a sugerir la categoría al registrar un gasto. */
  suministra?: string | null
  notas?: string | null
  activo: boolean
  createdAt?: Timestamp
}

export async function listarProveedores(negocioId: string): Promise<Proveedor[]> {
  const snapshot = await getDocs(
    query(collection(db, "proveedores"), where("negocioId", "==", negocioId)),
  )

  return snapshot.docs
    .map((documento) => ({ id: documento.id, ...documento.data() }) as Proveedor)
    .filter((proveedor) => proveedor.activo !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export async function crearProveedor(params: {
  negocioId: string
  nombre: string
  rif?: string
  telefono?: string
  suministra?: string
}): Promise<string> {
  const referencia = await addDoc(collection(db, "proveedores"), {
    negocioId: params.negocioId,
    nombre: params.nombre.trim(),
    rif: params.rif?.trim() || null,
    telefono: params.telefono?.trim() || null,
    suministra: params.suministra?.trim() || null,
    activo: true,
    createdAt: Timestamp.now(),
  })

  return referencia.id
}

/** Los proveedores no se borran: se desactivan, para no romper los gastos que los citan. */
export async function desactivarProveedor(proveedorId: string): Promise<void> {
  await updateDoc(doc(db, "proveedores", proveedorId), { activo: false })
}

// ---------------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------------

export interface Gasto {
  id: string
  negocioId: string
  tipo: TipoGasto
  categoria: string
  /** Qué se compró, en palabras del dueño: "Telas para la tanda de camisas". */
  concepto: string
  proveedorId?: string | null
  /** Se guarda el nombre además del id: si el proveedor se desactiva, el
   *  histórico sigue siendo legible sin una consulta extra. */
  proveedorNombre?: string | null
  montoUsd: number
  montoBs: number
  tasa: number | null
  metodoPago: string
  /** Turno de caja desde el que salió, si salió de la caja. */
  turnoId?: string | null
  /** Repetición, para los fijos. */
  recurrencia?: Recurrencia | null
  fecha: Timestamp
  creadoPor: string
  createdAt: Timestamp
}

export type PeriodoRecurrencia = "semanal" | "quincenal" | "mensual"

export interface Recurrencia {
  periodo: PeriodoRecurrencia
  /** Próxima fecha en que toca. Sirve para avisar antes de que venza. */
  proximo: Timestamp
  activa: boolean
}

export const PERIODOS: Array<{ id: PeriodoRecurrencia; label: string; dias: number }> = [
  { id: "semanal", label: "Cada semana", dias: 7 },
  { id: "quincenal", label: "Cada quincena", dias: 15 },
  { id: "mensual", label: "Cada mes", dias: 30 },
]

export interface NuevoGasto {
  negocioId: string
  tipo: TipoGasto
  categoria: string
  concepto: string
  proveedorId?: string | null
  proveedorNombre?: string | null
  montoUsd: number
  montoBs: number
  tasa: number | null
  metodoPago: string
  turnoId?: string | null
  fecha?: Date
  recurrencia?: { periodo: PeriodoRecurrencia } | null
  creadoPor: string
}

function siguienteFecha(desde: Date, periodo: PeriodoRecurrencia): Date {
  const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? 30
  const siguiente = new Date(desde)

  // Para el mensual se avanza el mes de verdad, no 30 días: si no, un gasto
  // del día 31 se va desplazando hacia atrás mes a mes.
  if (periodo === "mensual") siguiente.setMonth(siguiente.getMonth() + 1)
  else siguiente.setDate(siguiente.getDate() + dias)

  return siguiente
}

export async function registrarGasto(datos: NuevoGasto): Promise<string> {
  if (!Number.isFinite(datos.montoUsd) || datos.montoUsd <= 0) {
    throw new Error("El monto debe ser mayor que cero.")
  }
  if (!datos.concepto.trim()) {
    throw new Error("Escribe en qué se gastó. Un gasto sin concepto no sirve para nada después.")
  }

  const fecha = datos.fecha ?? new Date()

  const referencia = await addDoc(collection(db, "gastos"), {
    negocioId: datos.negocioId,
    tipo: datos.tipo,
    categoria: datos.categoria.trim(),
    concepto: datos.concepto.trim(),
    proveedorId: datos.proveedorId ?? null,
    proveedorNombre: datos.proveedorNombre ?? null,
    montoUsd: datos.montoUsd,
    montoBs: datos.montoBs,
    tasa: datos.tasa,
    metodoPago: datos.metodoPago,
    turnoId: datos.turnoId ?? null,
    recurrencia: datos.recurrencia
      ? {
          periodo: datos.recurrencia.periodo,
          proximo: Timestamp.fromDate(siguienteFecha(fecha, datos.recurrencia.periodo)),
          activa: true,
        }
      : null,
    fecha: Timestamp.fromDate(fecha),
    creadoPor: datos.creadoPor,
    createdAt: Timestamp.now(),
  })

  return referencia.id
}

export async function listarGastos(params: {
  negocioId: string
  desde?: Date
  hasta?: Date
  maximo?: number
}): Promise<Gasto[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "gastos"),
      where("negocioId", "==", params.negocioId),
      orderBy("fecha", "desc"),
      limit(params.maximo ?? 300),
    ),
  )

  return snapshot.docs
    .map((documento) => ({ id: documento.id, ...documento.data() }) as Gasto)
    .filter((gasto) => {
      const fecha = gasto.fecha?.toDate?.()
      if (!fecha) return false
      if (params.desde && fecha < params.desde) return false
      if (params.hasta && fecha > params.hasta) return false
      return true
    })
}

/** Gastos fijos cuya próxima repetición ya llegó o está por llegar. */
export async function proximosVencimientos(negocioId: string, diasAviso = 5): Promise<Gasto[]> {
  const limiteAviso = new Date()
  limiteAviso.setDate(limiteAviso.getDate() + diasAviso)

  const snapshot = await getDocs(
    query(
      collection(db, "gastos"),
      where("negocioId", "==", negocioId),
      where("recurrencia.activa", "==", true),
      limit(100),
    ),
  )

  return snapshot.docs
    .map((documento) => ({ id: documento.id, ...documento.data() }) as Gasto)
    .filter((gasto) => {
      const proximo = gasto.recurrencia?.proximo?.toDate?.()
      return proximo ? proximo <= limiteAviso : false
    })
    .sort(
      (a, b) =>
        (a.recurrencia?.proximo?.toMillis?.() ?? 0) - (b.recurrencia?.proximo?.toMillis?.() ?? 0),
    )
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

export interface ResumenGastos {
  /** Lo que de verdad resta de la utilidad: fijos + variables + discrecionales. */
  costoOperativoUsd: number
  porTipo: Record<TipoGasto, number>
  porCategoria: Array<{ categoria: string; tipo: TipoGasto; totalUsd: number }>
  porProveedor: Array<{ nombre: string; totalUsd: number; veces: number }>
  totalSalidasUsd: number
}

/**
 * Agrupa los gastos de un período.
 *
 * `costoOperativoUsd` deja fuera la inversión y los retiros a propósito: es la
 * cifra que hay que restar de las ventas para saber si el negocio gana. Meter
 * ahí la nevera o el sueldo del dueño da una respuesta falsa.
 */
export function resumirGastos(gastos: Gasto[]): ResumenGastos {
  const porTipo: Record<TipoGasto, number> = {
    fijo: 0,
    variable: 0,
    discrecional: 0,
    inversion: 0,
    retiro: 0,
  }

  const categorias = new Map<string, { categoria: string; tipo: TipoGasto; totalUsd: number }>()
  const proveedores = new Map<string, { nombre: string; totalUsd: number; veces: number }>()
  let totalSalidasUsd = 0

  for (const gasto of gastos) {
    const monto = Number(gasto.montoUsd) || 0
    totalSalidasUsd += monto
    porTipo[gasto.tipo] = (porTipo[gasto.tipo] ?? 0) + monto

    const claveCategoria = `${gasto.tipo}::${gasto.categoria}`
    const acumulado = categorias.get(claveCategoria) ?? {
      categoria: gasto.categoria || "Sin categoría",
      tipo: gasto.tipo,
      totalUsd: 0,
    }
    acumulado.totalUsd += monto
    categorias.set(claveCategoria, acumulado)

    if (gasto.proveedorNombre) {
      const proveedor = proveedores.get(gasto.proveedorNombre) ?? {
        nombre: gasto.proveedorNombre,
        totalUsd: 0,
        veces: 0,
      }
      proveedor.totalUsd += monto
      proveedor.veces += 1
      proveedores.set(gasto.proveedorNombre, proveedor)
    }
  }

  const redondear = (valor: number) => Math.round(valor * 100) / 100

  return {
    costoOperativoUsd: redondear(porTipo.fijo + porTipo.variable + porTipo.discrecional),
    porTipo: {
      fijo: redondear(porTipo.fijo),
      variable: redondear(porTipo.variable),
      discrecional: redondear(porTipo.discrecional),
      inversion: redondear(porTipo.inversion),
      retiro: redondear(porTipo.retiro),
    },
    porCategoria: [...categorias.values()]
      .map((entrada) => ({ ...entrada, totalUsd: redondear(entrada.totalUsd) }))
      .sort((a, b) => b.totalUsd - a.totalUsd),
    porProveedor: [...proveedores.values()]
      .map((entrada) => ({ ...entrada, totalUsd: redondear(entrada.totalUsd) }))
      .sort((a, b) => b.totalUsd - a.totalUsd),
    totalSalidasUsd: redondear(totalSalidasUsd),
  }
}
