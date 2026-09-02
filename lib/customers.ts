// /lib/customers.ts
//
// Clientes y lo que te deben.
//
// EL FIADO NO ES UN DETALLE, ES MEDIO NEGOCIO
//
// En Venezuela una parte grande de las ventas de barrio sale fiada. El sistema
// que no lo registra obliga al dueño a llevar un cuaderno aparte, y entonces el
// cuaderno es el sistema de verdad y esto pasa a ser un adorno.
//
// Por eso una venta fiada es una venta completa: descuenta inventario, cuenta
// para el reporte del día y numera su documento igual que las demás. Lo único
// distinto es que el dinero no entró: en vez de un movimiento de caja crea una
// cuenta por cobrar.
//
// Esa distinción es la que evita el error más caro de todos, que es creer que
// vendiste mil dólares y tener cuatrocientos en la gaveta.
//
// DÓNDE VIVE EL SALDO
//
// La deuda de cada cliente se guarda sumada en su documento (`saldoDeudaUsd`) y
// detallada en `cuentas_cobrar`. El resumen se actualiza con `increment()` en
// el MISMO lote que el detalle, que es lo que impide que se separen: o entran
// las dos escrituras o no entra ninguna.
//
// Se guarda sumado en vez de recalcularlo cada vez porque la lista de clientes
// enseña el saldo de todos: recalcular pediría leer todas las deudas de todos
// los clientes para pintar una pantalla que se abre cien veces al día.

import {
  Timestamp,
  collection,
  doc,
  getDocs,
  increment,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore"
import { db } from "./firebase"

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export interface Cliente {
  id: string
  negocioId: string
  nombre: string
  /** Cédula o RIF. Hace falta para facturar, y es lo que la gente busca. */
  documento?: string
  telefono?: string
  email?: string
  direccion?: string
  notas?: string
  /**
   * Cuánto debe ahora mismo, en divisa. Es un resumen de `cuentas_cobrar`,
   * mantenido con increment() en el mismo lote que el detalle.
   */
  saldoDeudaUsd: number
  /**
   * Tope de fiado. Cero significa sin tope; no significa "no se le fía", que se
   * expresa desactivándolo. La diferencia importa: un tope de cero que
   * bloqueara la venta dejaría fuera a todos los clientes viejos, que se
   * crearon antes de que existiera este campo.
   */
  limiteCreditoUsd: number
  activo: boolean
  creadoEn?: Timestamp
}

export async function listarClientes(negocioId: string): Promise<Cliente[]> {
  const snapshot = await getDocs(
    query(collection(db, "clientes"), where("negocioId", "==", negocioId)),
  )

  return snapshot.docs
    .map((documento) => {
      const datos = documento.data()
      return {
        id: documento.id,
        negocioId: datos.negocioId,
        nombre: datos.nombre ?? datos.name ?? "Sin nombre",
        documento: datos.documento ?? datos.cedula ?? "",
        telefono: datos.telefono ?? datos.phone ?? "",
        email: datos.email ?? "",
        direccion: datos.direccion ?? "",
        notas: datos.notas ?? "",
        saldoDeudaUsd: Number(datos.saldoDeudaUsd) || 0,
        limiteCreditoUsd: Number(datos.limiteCreditoUsd) || 0,
        activo: datos.activo !== false,
        creadoEn: datos.creadoEn,
      } satisfies Cliente
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

export interface DatosCliente {
  nombre: string
  documento?: string
  telefono?: string
  email?: string
  direccion?: string
  notas?: string
  limiteCreditoUsd?: number
}

export async function guardarCliente(params: {
  negocioId: string
  clienteId?: string | null
  datos: DatosCliente
  creadoPor: string
}): Promise<string> {
  const referencia = params.clienteId
    ? doc(db, "clientes", params.clienteId)
    : doc(collection(db, "clientes"))

  const cuerpo: Record<string, unknown> = {
    negocioId: params.negocioId,
    nombre: params.datos.nombre.trim(),
    documento: params.datos.documento?.trim() ?? "",
    telefono: params.datos.telefono?.trim() ?? "",
    email: params.datos.email?.trim().toLowerCase() ?? "",
    direccion: params.datos.direccion?.trim() ?? "",
    notas: params.datos.notas?.trim() ?? "",
    limiteCreditoUsd: Number(params.datos.limiteCreditoUsd) || 0,
    activo: true,
  }

  // El saldo NO se toca al editar: lo mueven los abonos y las ventas fiadas.
  // Escribirlo aquí borraría deudas de verdad al corregir un teléfono.
  if (!params.clienteId) {
    cuerpo.saldoDeudaUsd = 0
    cuerpo.creadoPor = params.creadoPor
    cuerpo.creadoEn = Timestamp.now()
  }

  const lote = writeBatch(db)
  lote.set(referencia, cuerpo, { merge: Boolean(params.clienteId) })
  await lote.commit()

  return referencia.id
}

/**
 * Desactiva a un cliente. No se borra: sus ventas y sus deudas apuntan a él, y
 * un historial que dice "cliente eliminado" no sirve para cobrar nada.
 */
export async function desactivarCliente(clienteId: string): Promise<void> {
  await updateDoc(doc(db, "clientes", clienteId), { activo: false })
}

export async function reactivarCliente(clienteId: string): Promise<void> {
  await updateDoc(doc(db, "clientes", clienteId), { activo: true })
}

// ---------------------------------------------------------------------------
// Cuentas por cobrar
// ---------------------------------------------------------------------------

export type EstadoDeuda = "pendiente" | "parcial" | "pagada"

export interface CuentaPorCobrar {
  id: string
  negocioId: string
  clienteId: string
  clienteNombre: string
  /** La venta que la originó, para poder llegar al detalle de lo que se llevó. */
  ventaId?: string
  numeroDocumento?: string
  montoUsd: number
  abonadoUsd: number
  saldoUsd: number
  estado: EstadoDeuda
  fecha: Timestamp
  /** Cuándo debería estar pagada. Sin fecha, no vence: no todo el fiado tiene plazo. */
  venceEn?: Timestamp | null
  creadoPor: string
}

/**
 * Anota una venta fiada.
 *
 * Va en lote con el saldo del cliente por lo mismo de siempre: media escritura
 * dejaría una deuda que no suma en ningún resumen, o un resumen que acusa a
 * alguien de deber algo que no se puede encontrar.
 */
export async function registrarDeuda(params: {
  negocioId: string
  clienteId: string
  clienteNombre: string
  ventaId?: string
  numeroDocumento?: string
  montoUsd: number
  venceEn?: Date | null
  creadoPor: string
}): Promise<string> {
  if (params.montoUsd <= 0) throw new Error("El monto de la deuda tiene que ser mayor que cero.")

  const referencia = doc(collection(db, "cuentas_cobrar"))
  const lote = writeBatch(db)

  lote.set(referencia, {
    negocioId: params.negocioId,
    clienteId: params.clienteId,
    clienteNombre: params.clienteNombre,
    ventaId: params.ventaId ?? null,
    numeroDocumento: params.numeroDocumento ?? "",
    montoUsd: params.montoUsd,
    abonadoUsd: 0,
    saldoUsd: params.montoUsd,
    estado: "pendiente" satisfies EstadoDeuda,
    fecha: Timestamp.now(),
    venceEn: params.venceEn ? Timestamp.fromDate(params.venceEn) : null,
    creadoPor: params.creadoPor,
  })

  lote.update(doc(db, "clientes", params.clienteId), {
    saldoDeudaUsd: increment(params.montoUsd),
  })

  await lote.commit()
  return referencia.id
}

export async function listarDeudas(params: {
  negocioId: string
  clienteId?: string
  soloPendientes?: boolean
}): Promise<CuentaPorCobrar[]> {
  const condiciones = [where("negocioId", "==", params.negocioId)]
  if (params.clienteId) condiciones.push(where("clienteId", "==", params.clienteId))

  const snapshot = await getDocs(
    query(collection(db, "cuentas_cobrar"), ...condiciones, orderBy("fecha", "desc")),
  )

  const deudas = snapshot.docs.map(
    (documento) => ({ id: documento.id, ...documento.data() }) as CuentaPorCobrar,
  )

  return params.soloPendientes ? deudas.filter((deuda) => deuda.estado !== "pagada") : deudas
}

// ---------------------------------------------------------------------------
// Abonos
// ---------------------------------------------------------------------------

export interface Abono {
  id: string
  negocioId: string
  clienteId: string
  cuentaCobrarId: string
  montoUsd: number
  metodo: string
  /** A qué cuenta del negocio entró el dinero, si se indicó. */
  cuentaId?: string | null
  nota?: string
  fecha: Timestamp
  registradoPor: string
}

/**
 * Registra un pago parcial o total de una deuda.
 *
 * Tres escrituras en un solo lote: el abono, la deuda (saldo y estado) y el
 * saldo del cliente. Si el abono entrara sin bajar la deuda, el cliente pagaría
 * dos veces lo mismo la próxima vez que alguien mire la pantalla.
 *
 * No se acepta abonar de más. Podría parecer amable redondear hacia arriba,
 * pero un saldo negativo se lee como "el negocio le debe al cliente", que es
 * una conversación muy distinta y casi nunca la que se quiso tener.
 */
export async function registrarAbono(params: {
  negocioId: string
  deuda: CuentaPorCobrar
  montoUsd: number
  metodo: string
  cuentaId?: string | null
  nota?: string
  registradoPor: string
}): Promise<{ abonoId: string; saldoRestante: number; quedaSaldada: boolean }> {
  const monto = Math.round(params.montoUsd * 100) / 100

  if (monto <= 0) throw new Error("El abono tiene que ser mayor que cero.")
  if (monto > params.deuda.saldoUsd + 0.001) {
    throw new Error(
      `El abono no puede pasar de lo que se debe. Quedan ${params.deuda.saldoUsd.toFixed(2)} $.`,
    )
  }

  const abonadoUsd = Math.round((params.deuda.abonadoUsd + monto) * 100) / 100
  const saldoUsd = Math.round((params.deuda.montoUsd - abonadoUsd) * 100) / 100

  // Menos de un centavo es cero: lo contrario deja deudas de 0,004 $ que
  // aparecen en la lista de morosos para siempre.
  const quedaSaldada = saldoUsd < 0.01
  const estado: EstadoDeuda = quedaSaldada ? "pagada" : "parcial"

  const referencia = doc(collection(db, "abonos"))
  const lote = writeBatch(db)

  lote.set(referencia, {
    negocioId: params.negocioId,
    clienteId: params.deuda.clienteId,
    cuentaCobrarId: params.deuda.id,
    montoUsd: monto,
    metodo: params.metodo,
    cuentaId: params.cuentaId ?? null,
    nota: params.nota?.trim() ?? "",
    fecha: Timestamp.now(),
    registradoPor: params.registradoPor,
  })

  lote.update(doc(db, "cuentas_cobrar", params.deuda.id), {
    abonadoUsd,
    saldoUsd: quedaSaldada ? 0 : saldoUsd,
    estado,
  })

  lote.update(doc(db, "clientes", params.deuda.clienteId), {
    saldoDeudaUsd: increment(-monto),
  })

  await lote.commit()

  return { abonoId: referencia.id, saldoRestante: quedaSaldada ? 0 : saldoUsd, quedaSaldada }
}

export async function listarAbonos(params: {
  negocioId: string
  clienteId?: string
}): Promise<Abono[]> {
  const condiciones = [where("negocioId", "==", params.negocioId)]
  if (params.clienteId) condiciones.push(where("clienteId", "==", params.clienteId))

  const snapshot = await getDocs(
    query(collection(db, "abonos"), ...condiciones, orderBy("fecha", "desc")),
  )

  return snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }) as Abono)
}

// ---------------------------------------------------------------------------
// Resumen de la cartera
// ---------------------------------------------------------------------------

export interface ResumenCartera {
  /** Todo lo que te deben. */
  totalUsd: number
  /** De eso, lo que ya pasó de su fecha. */
  vencidoUsd: number
  /** Lo que vence en los próximos días. */
  porVencerUsd: number
  /** Lo que no tiene fecha de pago. */
  sinFechaUsd: number
  clientesConDeuda: number
  deudaMasVieja: CuentaPorCobrar | null
}

/**
 * Reparte la cartera por antigüedad.
 *
 * Separar lo vencido de lo que todavía tiene plazo es la diferencia entre "me
 * deben 800" y "me deben 800, y 600 ya se pasaron de fecha". Lo primero es un
 * dato; lo segundo es una tarde de llamadas.
 */
export function resumirCartera(deudas: CuentaPorCobrar[], diasAviso = 7): ResumenCartera {
  const ahora = Date.now()
  const limiteAviso = ahora + diasAviso * 24 * 60 * 60 * 1000

  let totalUsd = 0
  let vencidoUsd = 0
  let porVencerUsd = 0
  let sinFechaUsd = 0

  const clientes = new Set<string>()
  let deudaMasVieja: CuentaPorCobrar | null = null

  for (const deuda of deudas) {
    if (deuda.estado === "pagada" || deuda.saldoUsd <= 0) continue

    totalUsd += deuda.saldoUsd
    clientes.add(deuda.clienteId)

    const fecha = deuda.fecha?.toMillis?.() ?? 0
    if (!deudaMasVieja || fecha < (deudaMasVieja.fecha?.toMillis?.() ?? 0)) deudaMasVieja = deuda

    const vence = deuda.venceEn?.toMillis?.()
    if (!vence) sinFechaUsd += deuda.saldoUsd
    else if (vence < ahora) vencidoUsd += deuda.saldoUsd
    else if (vence <= limiteAviso) porVencerUsd += deuda.saldoUsd
  }

  const redondear = (valor: number) => Math.round(valor * 100) / 100

  return {
    totalUsd: redondear(totalUsd),
    vencidoUsd: redondear(vencidoUsd),
    porVencerUsd: redondear(porVencerUsd),
    sinFechaUsd: redondear(sinFechaUsd),
    clientesConDeuda: clientes.size,
    deudaMasVieja,
  }
}

/** Cuántos días lleva vencida una deuda. Negativo si aún no vence. */
export function diasDeAtraso(deuda: CuentaPorCobrar): number | null {
  const vence = deuda.venceEn?.toMillis?.()
  if (!vence) return null
  return Math.floor((Date.now() - vence) / (24 * 60 * 60 * 1000))
}

/**
 * ¿Se le puede fiar más a este cliente?
 *
 * Devuelve el motivo en texto, no un booleano, porque el cajero necesita saber
 * POR QUÉ no puede: "está desactivado" y "se pasa del tope por 40 $" se
 * arreglan de formas muy distintas.
 */
export function puedeFiar(
  cliente: Cliente,
  montoUsd: number,
): { permitido: boolean; motivo?: string } {
  if (!cliente.activo) {
    return { permitido: false, motivo: "Este cliente está desactivado." }
  }

  // Tope cero es "sin tope", no "no se le fía". Los clientes creados antes de
  // que existiera este campo tienen cero, y no se les puede bloquear por eso.
  if (cliente.limiteCreditoUsd <= 0) return { permitido: true }

  const nuevoSaldo = cliente.saldoDeudaUsd + montoUsd
  if (nuevoSaldo > cliente.limiteCreditoUsd) {
    const exceso = Math.round((nuevoSaldo - cliente.limiteCreditoUsd) * 100) / 100
    return {
      permitido: false,
      motivo: `Se pasa del tope de ${cliente.limiteCreditoUsd.toFixed(2)} $ por ${exceso.toFixed(2)} $. Ya debe ${cliente.saldoDeudaUsd.toFixed(2)} $.`,
    }
  }

  return { permitido: true }
}
