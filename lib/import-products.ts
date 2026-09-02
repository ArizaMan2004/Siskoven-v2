// /lib/import-products.ts
//
// Carga masiva del inventario desde una hoja de cálculo.
//
// POR QUÉ ESTO ES LO MÁS IMPORTANTE QUE LE FALTABA AL SISTEMA
//
// Una bodega tiene trescientos productos. Si para probar el sistema hay que
// teclearlos uno a uno, nadie llega al tercer día de la prueba gratis: se
// pierde el cliente antes de que haya visto funcionar nada. La competencia lo
// tiene y lo anuncia en su portada ("inventario cargado en minutos, no en
// días") porque saben que ahí se gana o se pierde la venta.
//
// TRES DECISIONES QUE HACEN QUE ESTO FUNCIONE DE VERDAD
//
// 1. NO se exige una plantilla. La hoja de cálculo de la gente nunca coincide
//    con la plantilla de nadie: tiene las columnas en otro orden, con otros
//    nombres y con tres columnas de más. Se detectan las columnas por su
//    encabezado y se deja corregir la correspondencia a mano.
//
// 2. Se valida TODO antes de escribir NADA. Una importación a medias, con
//    ciento veinte productos dentro y el resto fuera, es peor que un fallo
//    limpio: no hay forma de saber por dónde se quedó.
//
// 3. Los decimales se leen a la venezolana. "1.234,56" son mil doscientos
//    treinta y cuatro con cincuenta y seis, no uno coma dos tres cuatro.
//    Confundirlos multiplica un precio por mil.

import { Timestamp, doc, writeBatch } from "firebase/firestore"
import { db } from "./firebase"
import { type PricingSettings, divisaPrice, listPrice } from "./pricing"

/** Campos que el sistema sabe rellenar desde una hoja. */
export type CampoImportable =
  | "name"
  | "category"
  | "quantity"
  | "costUsd"
  | "profit"
  | "precioUsd"
  | "barcode"
  | "stockMinimo"
  | "saleType"

export interface CampoDefinicion {
  id: CampoImportable
  label: string
  requerido: boolean
  ayuda: string
  /** Encabezados que se reconocen solos, en minúsculas y sin acentos. */
  alias: string[]
}

export const CAMPOS: CampoDefinicion[] = [
  {
    id: "name",
    label: "Nombre del producto",
    requerido: true,
    ayuda: "Lo único imprescindible.",
    alias: ["nombre", "producto", "descripcion", "articulo", "item", "detalle", "name"],
  },
  {
    id: "category",
    label: "Categoría",
    requerido: false,
    ayuda: "Si no viene, se deja en blanco.",
    alias: ["categoria", "rubro", "familia", "grupo", "tipo", "category"],
  },
  {
    id: "quantity",
    label: "Cantidad",
    requerido: false,
    ayuda: "Existencias actuales. Sin valor, queda en 0.",
    alias: ["cantidad", "existencia", "existencias", "stock", "inventario", "disponible", "qty"],
  },
  {
    id: "costUsd",
    label: "Costo",
    requerido: false,
    ayuda: "Lo que te cuesta, en divisa.",
    alias: ["costo", "coste", "compra", "precio de compra", "costo unitario", "cost"],
  },
  {
    id: "profit",
    label: "Margen (%)",
    requerido: false,
    ayuda: "Sobre la venta. Se usa si no traes precio.",
    alias: ["margen", "ganancia", "utilidad", "porcentaje", "profit", "markup"],
  },
  {
    id: "precioUsd",
    label: "Precio de venta",
    requerido: false,
    ayuda: "Si viene, manda sobre el margen.",
    alias: ["precio", "venta", "pvp", "precio venta", "precio de venta", "price"],
  },
  {
    id: "barcode",
    label: "Código de barras",
    requerido: false,
    ayuda: "También sirve como SKU.",
    alias: ["codigo", "codigo de barras", "barra", "sku", "ean", "upc", "barcode", "referencia"],
  },
  {
    id: "stockMinimo",
    label: "Stock mínimo",
    requerido: false,
    ayuda: "Por debajo de esto, salta la alerta.",
    alias: ["minimo", "stock minimo", "punto de pedido", "reorden", "min"],
  },
  {
    id: "saleType",
    label: "Se vende por",
    requerido: false,
    ayuda: "Unidad o peso. Por defecto, unidad.",
    alias: ["tipo de venta", "unidad", "medida", "se vende por", "presentacion"],
  },
]

/** Quita acentos y espacios para poder comparar encabezados. */
function normalizar(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * Convierte texto a número entendiendo los dos formatos.
 *
 * "1.234,56" (venezolano) y "1,234.56" (inglés) significan lo mismo. La regla:
 * el ÚLTIMO separador que aparece es el decimal. Equivocarse aquí multiplica
 * o divide un precio por mil, que en una lista de trescientos productos no lo
 * detecta nadie hasta que ya vendió.
 */
export function parseNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null

  let texto = String(valor ?? "").trim()
  if (!texto) return null

  // Fuera símbolos de moneda y espacios.
  texto = texto.replace(/[^\d.,-]/g, "")
  if (!texto || texto === "-") return null

  const ultimaComa = texto.lastIndexOf(",")
  const ultimoPunto = texto.lastIndexOf(".")

  if (ultimaComa === -1 && ultimoPunto === -1) {
    const n = Number(texto)
    return Number.isFinite(n) ? n : null
  }

  const posDecimal = Math.max(ultimaComa, ultimoPunto)
  const entero = texto.slice(0, posDecimal).replace(/[.,]/g, "")
  const decimales = texto.slice(posDecimal + 1).replace(/[.,]/g, "")

  // Tres dígitos después del separador y ninguno antes: era separador de
  // miles, no decimal. "1.234" son mil doscientos treinta y cuatro.
  if (decimales.length === 3 && !texto.slice(0, posDecimal).match(/[.,]/)) {
    const n = Number(entero + decimales)
    return Number.isFinite(n) ? n : null
  }

  const n = Number(`${entero}.${decimales}`)
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// Lectura del archivo
// ---------------------------------------------------------------------------

export interface HojaLeida {
  encabezados: string[]
  filas: string[][]
}

/**
 * Divide una línea de CSV respetando las comillas.
 *
 * Un nombre como «Aceite "La Favorita", 1L» lleva una coma DENTRO del campo.
 * Partir por comas a secas rompe esa fila y corre todas las columnas.
 */
function partirLineaCsv(linea: string, separador: string): string[] {
  const campos: string[] = []
  let actual = ""
  let entreComillas = false

  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i]

    if (caracter === '"') {
      // Dos comillas seguidas dentro de un campo son una comilla literal.
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"'
        i += 1
      } else {
        entreComillas = !entreComillas
      }

      continue
    }

    if (caracter === separador && !entreComillas) {
      campos.push(actual)
      actual = ""
      continue
    }

    actual += caracter
  }

  campos.push(actual)
  return campos.map((campo) => campo.trim())
}

/** Detecta si la hoja usa coma o punto y coma. */
function detectarSeparador(primeraLinea: string): string {
  const comas = (primeraLinea.match(/,/g) ?? []).length
  const puntoYComa = (primeraLinea.match(/;/g) ?? []).length
  const tabuladores = (primeraLinea.match(/\t/g) ?? []).length

  if (tabuladores > comas && tabuladores > puntoYComa) return "\t"
  // Excel en español exporta con punto y coma, no con coma.
  return puntoYComa > comas ? ";" : ","
}

export function leerCsv(contenido: string): HojaLeida {
  const lineas = contenido
    .replace(/^﻿/, "") // marca de orden de bytes que pone Excel
    .split(/\r?\n/)
    .filter((linea) => linea.trim().length > 0)

  if (lineas.length === 0) return { encabezados: [], filas: [] }

  const separador = detectarSeparador(lineas[0])
  const [cabecera, ...resto] = lineas

  return {
    encabezados: partirLineaCsv(cabecera, separador),
    filas: resto.map((linea) => partirLineaCsv(linea, separador)),
  }
}

/**
 * Lee un archivo de hoja de cálculo.
 *
 * Los .xlsx se leen con SheetJS, que se carga SOLO al elegir ese tipo de
 * archivo: son cientos de kilobytes que no tienen por qué descargarse en cada
 * visita a la aplicación, y menos en un teléfono con datos móviles.
 */
export async function leerArchivo(archivo: File): Promise<HojaLeida> {
  const nombre = archivo.name.toLowerCase()

  if (nombre.endsWith(".csv") || nombre.endsWith(".txt") || nombre.endsWith(".tsv")) {
    return leerCsv(await archivo.text())
  }

  if (nombre.endsWith(".xlsx") || nombre.endsWith(".xls")) {
    const XLSX = await import("xlsx")
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" })
    const hoja = libro.Sheets[libro.SheetNames[0]]

    const matriz = XLSX.utils.sheet_to_json<string[]>(hoja, {
      header: 1,
      blankrows: false,
      // raw:false devuelve el texto tal como se ve en Excel, con su formato.
      // Es lo que queremos: el número lo interpretamos nosotros, que sabemos
      // distinguir el formato venezolano del inglés.
      raw: false,
      defval: "",
    })

    if (matriz.length === 0) return { encabezados: [], filas: [] }

    const [cabecera, ...resto] = matriz
    return {
      encabezados: cabecera.map((celda) => String(celda ?? "").trim()),
      filas: resto.map((fila) => fila.map((celda) => String(celda ?? "").trim())),
    }
  }

  throw new Error("Formato no reconocido. Sube un archivo .xlsx, .xls o .csv.")
}

// ---------------------------------------------------------------------------
// Correspondencia de columnas
// ---------------------------------------------------------------------------

export type Mapeo = Partial<Record<CampoImportable, number>>

/**
 * Adivina qué columna es cada campo mirando los encabezados.
 *
 * Se acierta la mayoría de las veces, y lo que no, se corrige a mano en la
 * pantalla siguiente. Adivinar mal no rompe nada; obligar a una plantilla
 * exacta sí espanta.
 */
export function adivinarMapeo(encabezados: string[]): Mapeo {
  const mapeo: Mapeo = {}
  const usados = new Set<number>()

  for (const campo of CAMPOS) {
    const indice = encabezados.findIndex((encabezado, i) => {
      if (usados.has(i)) return false
      const limpio = normalizar(encabezado)
      if (!limpio) return false
      return campo.alias.some((alias) => limpio === alias || limpio.includes(alias))
    })

    if (indice !== -1) {
      mapeo[campo.id] = indice
      usados.add(indice)
    }
  }

  return mapeo
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

export interface FilaPreparada {
  /** Número de fila en el archivo, contando el encabezado. Para poder decírselo al usuario. */
  linea: number
  name: string
  category: string
  quantity: number
  costUsd: number
  profit: number
  precioUsd: number | null
  barcode: string
  stockMinimo: number
  saleType: "unit" | "weight"
  /** Motivos por los que esta fila no se puede importar. */
  errores: string[]
  /** Cosas raras que no impiden importar pero conviene mirar. */
  avisos: string[]
}

export interface ResultadoValidacion {
  filas: FilaPreparada[]
  validas: FilaPreparada[]
  conErrores: FilaPreparada[]
}

const PALABRAS_PESO = ["peso", "kg", "kilo", "kilos", "gramo", "gramos", "granel"]

export function validar(hoja: HojaLeida, mapeo: Mapeo): ResultadoValidacion {
  const filas: FilaPreparada[] = []
  const nombresVistos = new Map<string, number>()
  const codigosVistos = new Map<string, number>()

  hoja.filas.forEach((fila, indice) => {
    const valor = (campo: CampoImportable): string => {
      const columna = mapeo[campo]
      return columna === undefined ? "" : String(fila[columna] ?? "").trim()
    }

    const errores: string[] = []
    const avisos: string[] = []
    const linea = indice + 2 // +1 por el encabezado, +1 porque las hojas empiezan en 1

    const name = valor("name")
    if (!name) errores.push("Falta el nombre")

    const cantidad = parseNumero(valor("quantity")) ?? 0
    if (cantidad < 0) errores.push("La cantidad es negativa")

    const costo = parseNumero(valor("costUsd")) ?? 0
    if (costo < 0) errores.push("El costo es negativo")

    const precio = parseNumero(valor("precioUsd"))
    if (precio !== null && precio < 0) errores.push("El precio es negativo")

    let margen = parseNumero(valor("profit")) ?? 0
    if (margen >= 100) {
      // Un margen del 100% sobre la venta da una división por cero.
      errores.push("El margen no puede llegar al 100%")
    } else if (margen < 0) {
      errores.push("El margen es negativo")
    }

    // Sin precio y sin costo no hay forma de saber a cuánto vender.
    if (precio === null && costo === 0) {
      avisos.push("Sin precio ni costo: entrará con precio 0")
    }

    if (precio !== null && costo > 0 && precio < costo) {
      avisos.push("El precio es menor que el costo: venderías con pérdida")
    }

    const codigo = valor("barcode")
    if (codigo) {
      const previa = codigosVistos.get(codigo)
      if (previa) errores.push(`Código repetido (ya está en la fila ${previa})`)
      else codigosVistos.set(codigo, linea)
    }

    if (name) {
      const clave = normalizar(name)
      const previa = nombresVistos.get(clave)
      if (previa) avisos.push(`Nombre repetido (fila ${previa})`)
      else nombresVistos.set(clave, linea)
    }

    const tipoTexto = normalizar(valor("saleType"))
    const saleType: "unit" | "weight" = PALABRAS_PESO.some((palabra) => tipoTexto.includes(palabra))
      ? "weight"
      : "unit"

    filas.push({
      linea,
      name,
      category: valor("category"),
      quantity: cantidad,
      costUsd: costo,
      profit: margen,
      precioUsd: precio,
      barcode: codigo,
      stockMinimo: parseNumero(valor("stockMinimo")) ?? 0,
      saleType,
      errores,
      avisos,
    })
  })

  return {
    filas,
    validas: filas.filter((fila) => fila.errores.length === 0),
    conErrores: filas.filter((fila) => fila.errores.length > 0),
  }
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/**
 * Cada producto son DOS documentos: el público y el del costo. Un lote de
 * Firestore admite 500 operaciones, así que caben 250 productos por lote.
 * Se deja margen por si algún día se añade un tercer documento.
 */
const PRODUCTOS_POR_LOTE = 200

export interface ProgresoImportacion {
  escritos: number
  total: number
}

/**
 * Escribe los productos validados.
 *
 * Se avisa del progreso porque importar trescientos productos son varios
 * segundos, y una pantalla congelada sin explicación hace que la gente cierre
 * el navegador a mitad.
 */
export async function importar(params: {
  negocioId: string
  filas: FilaPreparada[]
  pricing: PricingSettings
  onProgreso?: (progreso: ProgresoImportacion) => void
}): Promise<number> {
  const { negocioId, filas, pricing } = params
  let escritos = 0

  for (let inicio = 0; inicio < filas.length; inicio += PRODUCTOS_POR_LOTE) {
    const tanda = filas.slice(inicio, inicio + PRODUCTOS_POR_LOTE)
    const lote = writeBatch(db)

    for (const fila of tanda) {
      const referencia = doc(db, "productos", crypto.randomUUID().replace(/-/g, "").slice(0, 20))

      // El precio se resuelve aquí y se guarda: quien lo lea puede no tener
      // acceso al costo para deducirlo. Ver lib/products-service.ts.
      const paraCalcular = {
        costUsd: fila.costUsd,
        profit: fila.profit,
        salePriceUsdManual: fila.precioUsd,
      }

      lote.set(referencia, {
        negocioId,
        name: fila.name,
        category: fila.category,
        quantity: fila.quantity,
        saleType: fila.saleType,
        barcode: fila.barcode,
        stockMinimo: fila.stockMinimo,
        precioUsd: listPrice(paraCalcular),
        precioDivisaUsd: divisaPrice(paraCalcular, pricing),
        ivaCategory: "general",
        createdAt: Timestamp.now(),
      })

      lote.set(doc(db, "productos_costos", referencia.id), {
        productoId: referencia.id,
        negocioId,
        costUsd: fila.costUsd,
        profit: fila.profit,
        salePriceUsdManual: fila.precioUsd,
        updatedAt: Timestamp.now(),
      })
    }

    await lote.commit()
    escritos += tanda.length
    params.onProgreso?.({ escritos, total: filas.length })
  }

  return escritos
}

/** Plantilla de ejemplo, para quien no tenga nada montado todavía. */
export function plantillaCsv(): string {
  return [
    "Nombre;Categoria;Cantidad;Costo;Margen;Precio;Codigo de barras;Stock minimo;Se vende por",
    "Harina de maiz 1kg;Alimentos;50;1,20;25;;7591234567890;10;unidad",
    "Aceite girasol 1L;Alimentos;30;2,35;20;;7599876543210;5;unidad",
    "Queso blanco;Charcuteria;8;4,50;;6,00;;2;peso",
  ].join("\n")
}
