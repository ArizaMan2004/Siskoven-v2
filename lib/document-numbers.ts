// /lib/document-numbers.ts
//
// Numeración correlativa de documentos.
//
// Hasta ahora el "número de factura" eran los primeros 6 caracteres del ID de
// Firestore: aleatorio, con saltos, y sin forma de demostrar que no falta
// ninguno. Un documento fiscal necesita lo contrario: una serie que empieza en
// 1 y sube de uno en uno, sin huecos y sin repetidos.
//
// EL PROBLEMA DIFÍCIL
// -------------------
// Para que dos cajas vendiendo a la vez no saquen el mismo número hace falta
// una transacción: leer el contador, sumarle uno y escribirlo, sin que nadie se
// cuele en medio. Pero las transacciones de Firestore EXIGEN ir al servidor: no
// funcionan sin conexión. Y este sistema está pensado para seguir vendiendo
// cuando se va la luz.
//
// Los dos requisitos no caben juntos, así que hay que elegir cuál se rompe.
//
// LA DECISIÓN
// -----------
// Se rompe la numeración, nunca la venta.
//
// · Con conexión: la transacción entrega el número y escribe la venta en la
//   misma operación. O salen las dos cosas o no sale ninguna, así que el
//   contador jamás se adelanta a una venta que no llegó a guardarse. Ese es el
//   mecanismo que evita los huecos.
//
// · Sin conexión: la venta se guarda igual, con `correlativo: null` y marcada
//   como pendiente de numerar. No se inventa un número provisional, porque un
//   número que después cambia es peor que no tener ninguno.
//
// · Al volver la conexión, `asignarPendientes()` los numera por orden de
//   creación. El correlativo respeta el orden real de las ventas.

import {
  type Firestore,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  where,
} from "firebase/firestore"
import { db } from "./firebase"

export type DocumentType = "nota_entrega" | "factura" | "nota_credito"

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  nota_entrega: "Nota de entrega",
  factura: "Factura",
  nota_credito: "Nota de crédito",
}

/** Prefijo por tipo, para que se distingan de un vistazo. */
export const DOCUMENT_PREFIXES: Record<DocumentType, string> = {
  nota_entrega: "NE",
  factura: "F",
  nota_credito: "NC",
}

/** Dígitos del número. 8 da margen para 99 millones de documentos. */
const PADDING = 8

export function formatDocumentNumber(tipo: DocumentType, numero: number, serie?: string | null): string {
  const cuerpo = String(Math.max(0, Math.trunc(numero))).padStart(PADDING, "0")
  const prefijo = DOCUMENT_PREFIXES[tipo] ?? "DOC"
  return serie ? `${prefijo}-${serie}-${cuerpo}` : `${prefijo}-${cuerpo}`
}

/**
 * Identificador del contador.
 *
 * Uno por negocio y por tipo: la factura y la nota de entrega llevan series
 * independientes, como debe ser.
 */
function counterId(negocioId: string, tipo: DocumentType): string {
  return `${negocioId}__${tipo}`
}

export interface NumberedWrite {
  correlativo: number
  numeroDocumento: string
  tipoDocumento: DocumentType
  pendienteDeNumerar: false
}

export interface UnnumberedWrite {
  correlativo: null
  numeroDocumento: null
  tipoDocumento: DocumentType
  pendienteDeNumerar: true
}

/**
 * Crea un documento con su número correlativo, en una sola transacción.
 *
 * `buildData` recibe el número asignado y devuelve el documento completo. Se
 * pasa como función a propósito: el número solo se conoce dentro de la
 * transacción, y si esta se reintenta (porque otra caja se adelantó) hay que
 * reconstruir el documento con el número nuevo, no con el viejo.
 *
 * Devuelve el id del documento creado.
 */
export async function createNumberedDocument(params: {
  negocioId: string
  tipo: DocumentType
  coleccion: string
  buildData: (numeracion: NumberedWrite) => Record<string, unknown>
  firestore?: Firestore
}): Promise<{ id: string; numeroDocumento: string; correlativo: number }> {
  const database = params.firestore ?? db
  const counterRef = doc(database, "contadores", counterId(params.negocioId, params.tipo))
  const documentRef = doc(collection(database, params.coleccion))

  const resultado = await runTransaction(database, async (transaction) => {
    const counterSnap = await transaction.get(counterRef)

    const actual = counterSnap.exists() ? Number(counterSnap.data().ultimo) || 0 : 0
    const siguiente = actual + 1
    const serie = counterSnap.exists() ? ((counterSnap.data().serie as string) ?? null) : null

    const numeroDocumento = formatDocumentNumber(params.tipo, siguiente, serie)

    // El contador y el documento se escriben juntos. Si algo falla, no se
    // guarda ninguno de los dos: por eso no quedan huecos en la serie.
    transaction.set(
      counterRef,
      { negocioId: params.negocioId, tipo: params.tipo, ultimo: siguiente, serie },
      { merge: true },
    )

    transaction.set(
      documentRef,
      params.buildData({
        correlativo: siguiente,
        numeroDocumento,
        tipoDocumento: params.tipo,
        pendienteDeNumerar: false,
      }),
    )

    return { correlativo: siguiente, numeroDocumento }
  })

  return { id: documentRef.id, ...resultado }
}

/** Numeración vacía, para guardar sin conexión. */
export function unnumbered(tipo: DocumentType): UnnumberedWrite {
  return {
    correlativo: null,
    numeroDocumento: null,
    tipoDocumento: tipo,
    pendienteDeNumerar: true,
  }
}

/**
 * ¿Este error significa "no hay servidor ahora mismo"?
 *
 * Solo en ese caso tiene sentido guardar sin número. Un error de permisos o de
 * datos hay que dejarlo estallar: guardar una venta que las reglas rechazan
 * sería esconder el problema.
 */
export function isOfflineError(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? ""
  return (
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    code === "resource-exhausted" ||
    (typeof navigator !== "undefined" && !navigator.onLine)
  )
}

/**
 * Numera los documentos que se guardaron sin conexión.
 *
 * Se numeran por orden de creación, para que el correlativo siga el orden real
 * en que ocurrieron las ventas, no el orden en que lograron subir.
 *
 * Se procesan de uno en uno: cada documento necesita su propia transacción
 * sobre el contador, y agruparlas no las haría más seguras, solo más difíciles
 * de reintentar si una falla a mitad.
 */
export async function asignarPendientes(params: {
  negocioId: string
  tipo: DocumentType
  coleccion: string
  maximo?: number
}): Promise<{ numerados: number; fallidos: number }> {
  const pendientes = await getDocs(
    query(
      collection(db, params.coleccion),
      where("negocioId", "==", params.negocioId),
      where("pendienteDeNumerar", "==", true),
      orderBy("createdAt", "asc"),
      limit(params.maximo ?? 50),
    ),
  )

  const counterRef = doc(db, "contadores", counterId(params.negocioId, params.tipo))
  let numerados = 0
  let fallidos = 0

  for (const pendiente of pendientes.docs) {
    try {
      await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef)
        const documentSnap = await transaction.get(pendiente.ref)

        // Otra pestaña pudo haberlo numerado mientras tanto.
        if (!documentSnap.exists() || documentSnap.data().pendienteDeNumerar !== true) return

        const actual = counterSnap.exists() ? Number(counterSnap.data().ultimo) || 0 : 0
        const siguiente = actual + 1
        const serie = counterSnap.exists() ? ((counterSnap.data().serie as string) ?? null) : null

        transaction.set(
          counterRef,
          { negocioId: params.negocioId, tipo: params.tipo, ultimo: siguiente, serie },
          { merge: true },
        )

        transaction.update(pendiente.ref, {
          correlativo: siguiente,
          numeroDocumento: formatDocumentNumber(params.tipo, siguiente, serie),
          pendienteDeNumerar: false,
        })
      })

      numerados += 1
    } catch (error) {
      console.error("No se pudo numerar el documento", pendiente.id, error)
      fallidos += 1
    }
  }

  return { numerados, fallidos }
}

/** Cuántos documentos están esperando número. */
export async function contarPendientes(negocioId: string, coleccion: string): Promise<number> {
  const pendientes = await getDocs(
    query(
      collection(db, coleccion),
      where("negocioId", "==", negocioId),
      where("pendienteDeNumerar", "==", true),
      limit(100),
    ),
  )
  return pendientes.size
}
