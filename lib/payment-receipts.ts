// /lib/payment-receipts.ts
//
// Comprobantes de pago: la imagen, sus datos y la comprobación de que no se
// haya usado ya.
//
// PARA QUÉ SIRVE ESTO DE VERDAD
//
// No es para adornar la venta con una foto. Es para poder responder, meses
// después, a "este pago no me aparece en el banco". Con el comprobante
// guardado y su referencia hay algo que enseñar y algo que cruzar; sin ellos
// solo queda la palabra de cada uno.
//
// Y habilita lo que de verdad importa: conciliar contra el estado de cuenta.
// La referencia es la única llave única de una transacción. Sin ella solo se
// puede cruzar por monto y fecha, y eso choca todo el rato — tres clientes
// pagando 500 Bs el mismo día son indistinguibles.
//
// LA REFERENCIA REPETIDA
//
// Si una referencia ya está registrada, pasa una de dos cosas: o se cobró dos
// veces la misma venta por error, o alguien está enseñando la misma captura
// otra vez. Las dos hay que avisarlas ANTES de entregar la mercancía, que es
// cuando todavía se puede hacer algo.

import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
} from "firebase/firestore"
import { getDownloadURL, ref, uploadBytes } from "firebase/storage"
import { db, storage } from "./firebase"

export interface Comprobante {
  id: string
  negocioId: string
  /** Número de referencia de la operación. La llave para conciliar. */
  referencia: string
  /** Código de cuatro dígitos del banco emisor. */
  bancoCodigo: string | null
  bancoNombre: string | null
  telefonoEmisor: string | null
  montoBs: number
  /** Fecha que dice el comprobante, no la de registro. */
  fechaOperacion: Timestamp | null
  /** Ruta en Storage. Se guarda además de la URL, para poder borrarla. */
  imagenPath: string | null
  imagenUrl: string | null
  /** Método de cobro al que pertenece: pagoMovil, transfer, biopago… */
  metodo: string
  ventaId: string | null
  numeroDocumento: string | null
  /** Se marca al cuadrarlo contra el estado de cuenta. */
  conciliado: boolean
  conciliadoEn: Timestamp | null
  registradoPor: string
  createdAt: Timestamp
}

export interface DatosComprobante {
  referencia: string
  bancoCodigo?: string | null
  bancoNombre?: string | null
  telefonoEmisor?: string | null
  montoBs: number
  fechaOperacion?: Date | null
  metodo: string
}

/**
 * Reduce la imagen antes de subirla.
 *
 * Una captura de un teléfono moderno pesa entre 2 y 4 MB. Subir eso desde los
 * datos móviles de una bodega, en cada venta, es tiempo que el cliente pasa
 * esperando en el mostrador y megas que alguien paga.
 *
 * 1600 píxeles de ancho y calidad 0,82 dejan un comprobante perfectamente
 * legible en unos 150 kB. Se comprueba que el texto pequeño —la referencia—
 * siga leyéndose: por debajo de 1200 empieza a perderse.
 */
export async function comprimirImagen(archivo: File, anchoMaximo = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo)

  const escala = Math.min(1, anchoMaximo / bitmap.width)
  const ancho = Math.round(bitmap.width * escala)
  const alto = Math.round(bitmap.height * escala)

  const lienzo = document.createElement("canvas")
  lienzo.width = ancho
  lienzo.height = alto

  const contexto = lienzo.getContext("2d")
  if (!contexto) {
    bitmap.close()
    return archivo
  }

  contexto.drawImage(bitmap, 0, 0, ancho, alto)
  bitmap.close()

  return new Promise((resolver) => {
    lienzo.toBlob(
      // Si el navegador no puede convertir, se sube el original: pesa más,
      // pero el comprobante se guarda igual. Perderlo sería peor.
      (blob) => resolver(blob ?? archivo),
      "image/jpeg",
      0.82,
    )
  })
}

/**
 * Sube la imagen a Storage y devuelve dónde quedó.
 *
 * La ruta lleva el negocio delante porque es lo que permite escribir en las
 * reglas de Storage "cada quien ve solo lo suyo". Ver storage.rules.
 */
export async function subirImagenComprobante(params: {
  negocioId: string
  archivo: File
  referencia: string
}): Promise<{ path: string; url: string }> {
  const comprimida = await comprimirImagen(params.archivo)

  // El nombre lleva la referencia y la hora: dos comprobantes de la misma
  // referencia (un reintento) no se pisan, y el archivo se puede identificar
  // desde la consola de Firebase sin abrir la base de datos.
  const limpia = params.referencia.replace(/\W/g, "").slice(0, 20) || "sinref"
  const path = `negocios/${params.negocioId}/comprobantes/${Date.now()}-${limpia}.jpg`

  const referenciaStorage = ref(storage, path)
  await uploadBytes(referenciaStorage, comprimida, { contentType: "image/jpeg" })

  return { path, url: await getDownloadURL(referenciaStorage) }
}

export type EstadoReferencia =
  | { repetida: false }
  | { repetida: true; comprobante: Comprobante; mismoMonto: boolean }

/**
 * ¿Se registró ya esta referencia en este negocio?
 *
 * Se distingue si además coincide el monto, porque las dos situaciones se
 * explican distinto: mismo monto huele a cobro duplicado o a captura reusada;
 * monto distinto huele más a un error al teclear la referencia.
 */
export async function referenciaYaUsada(params: {
  negocioId: string
  referencia: string
  montoBs?: number
}): Promise<EstadoReferencia> {
  const snapshot = await getDocs(
    query(
      collection(db, "comprobantes"),
      where("negocioId", "==", params.negocioId),
      where("referencia", "==", params.referencia.trim()),
      limit(1),
    ),
  )

  const primero = snapshot.docs[0]
  if (!primero) return { repetida: false }

  const comprobante = { id: primero.id, ...primero.data() } as Comprobante
  const mismoMonto =
    params.montoBs !== undefined && Math.abs(comprobante.montoBs - params.montoBs) < 0.01

  return { repetida: true, comprobante, mismoMonto }
}

/** Guarda el comprobante. Devuelve su id para poder atarlo a la venta. */
export async function registrarComprobante(params: {
  negocioId: string
  datos: DatosComprobante
  imagen?: { path: string; url: string } | null
  ventaId?: string | null
  numeroDocumento?: string | null
  registradoPor: string
}): Promise<string> {
  const referencia = doc(collection(db, "comprobantes"))

  const lote = writeBatch(db)
  lote.set(referencia, {
    negocioId: params.negocioId,
    referencia: params.datos.referencia.trim(),
    bancoCodigo: params.datos.bancoCodigo ?? null,
    bancoNombre: params.datos.bancoNombre ?? null,
    telefonoEmisor: params.datos.telefonoEmisor ?? null,
    montoBs: params.datos.montoBs,
    fechaOperacion: params.datos.fechaOperacion
      ? Timestamp.fromDate(params.datos.fechaOperacion)
      : null,
    imagenPath: params.imagen?.path ?? null,
    imagenUrl: params.imagen?.url ?? null,
    metodo: params.datos.metodo,
    ventaId: params.ventaId ?? null,
    numeroDocumento: params.numeroDocumento ?? null,
    conciliado: false,
    conciliadoEn: null,
    registradoPor: params.registradoPor,
    createdAt: Timestamp.now(),
  })

  await lote.commit()
  return referencia.id
}

/** Los comprobantes de un período, para la pantalla de conciliación. */
export async function listarComprobantes(params: {
  negocioId: string
  desde?: Date
  hasta?: Date
  soloSinConciliar?: boolean
}): Promise<Comprobante[]> {
  const snapshot = await getDocs(
    query(collection(db, "comprobantes"), where("negocioId", "==", params.negocioId)),
  )

  return snapshot.docs
    .map((documento) => ({ id: documento.id, ...documento.data() }) as Comprobante)
    .filter((comprobante) => {
      if (params.soloSinConciliar && comprobante.conciliado) return false

      const fecha = comprobante.fechaOperacion?.toDate?.() ?? comprobante.createdAt?.toDate?.()
      if (!fecha) return true
      if (params.desde && fecha < params.desde) return false
      if (params.hasta && fecha > params.hasta) return false
      return true
    })
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
}

/**
 * Los métodos de cobro que piden comprobante.
 *
 * El efectivo no: el dinero está en la mano y no deja rastro que conciliar.
 * El débito tampoco, porque el punto de venta ya imprime el suyo y el banco lo
 * liquida por lotes, no operación por operación.
 */
export const METODOS_CON_COMPROBANTE = ["pagoMovil", "transfer", "zelle", "binance", "biopago"]

export function pideComprobante(metodo: string): boolean {
  return METODOS_CON_COMPROBANTE.includes(metodo)
}
