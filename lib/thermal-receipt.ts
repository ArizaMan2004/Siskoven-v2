// /lib/thermal-receipt.ts
//
// Recibo para impresora térmica de 58 o 80 mm.
//
// POR QUÉ HTML Y NO ESC/POS
//
// Lo "correcto" en teoría sería mandar comandos ESC/POS directamente a la
// impresora. En la práctica eso exige WebUSB o Web Bluetooth: no funciona en
// iOS, no funciona en Firefox, pide permisos por dispositivo y se rompe cada
// vez que cambian de impresora. Para una bodega es inviable.
//
// Lo que sí funciona en todas partes: la impresora térmica se instala en el
// sistema como una impresora normal, y se le manda una página con el ancho
// exacto del papel. El navegador y el controlador hacen el resto. Imprime
// igual desde un teléfono Android con la impresora compartida, desde una
// tablet o desde el PC del mostrador.
//
// Las decisiones de formato salen de cómo es el papel, no del gusto:
//
// · Tipografía monoespaciada: es la única forma de que los importes queden
//   alineados en columna cuando solo hay 32 o 48 caracteres de ancho.
// · Sin colores ni grises: la impresora térmica es de un solo color y los
//   grises salen como manchas.
// · Nada de bordes ni fondos: cada píxel negro es papel que se gasta y tinta
//   térmica que se desvanece.
// · El nombre del producto se corta y sigue en la línea siguiente, nunca se
//   trunca: el cliente tiene que poder leer qué compró.

export type PaperWidth = 58 | 80

/** Caracteres que caben por línea según el ancho del papel. */
const COLUMNS: Record<PaperWidth, number> = {
  58: 32,
  80: 48,
}

export interface ReceiptBusiness {
  nombre: string
  rif?: string | null
  direccion?: string | null
  telefono?: string | null
}

export interface ReceiptItem {
  nombre: string
  cantidad: number
  precioUnitario: number
  total: number
}

export interface ReceiptTotals {
  subtotal: number
  descuento?: number
  baseImponible?: number
  iva?: number
  igtf?: number
  total: number
  totalBs?: number | null
  tasa?: number | null
}

export interface ReceiptData {
  negocio: ReceiptBusiness
  numeroDocumento: string | null
  tipoDocumento: string
  fecha: Date
  cajero?: string | null
  cliente?: { nombre?: string | null; documento?: string | null } | null
  items: ReceiptItem[]
  totales: ReceiptTotals
  metodoPago: string
  /** Vuelto entregado, si lo hubo. */
  vueltoBs?: number | null
  anulada?: boolean
}

const money = (value: number) => value.toFixed(2)

const moneyBs = (value: number) =>
  value.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Escapa el texto: un nombre de producto con `<` no debe romper el recibo. */
function escape(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/** Línea con la etiqueta a la izquierda y el importe a la derecha. */
function fila(label: string, value: string, columns: number): string {
  const espacio = Math.max(1, columns - label.length - value.length)
  return escape(label + " ".repeat(espacio) + value)
}

function separador(columns: number, caracter = "-"): string {
  return caracter.repeat(columns)
}

/** Divide un nombre largo en varias líneas sin cortar palabras por la mitad. */
function envolver(texto: string, columns: number): string[] {
  const palabras = String(texto ?? "").split(/\s+/).filter(Boolean)
  const lineas: string[] = []
  let actual = ""

  for (const palabra of palabras) {
    if (!actual.length) {
      actual = palabra
    } else if (actual.length + 1 + palabra.length <= columns) {
      actual += " " + palabra
    } else {
      lineas.push(actual)
      actual = palabra
    }

    // Una palabra sola más larga que el papel: ahí sí hay que partirla.
    while (actual.length > columns) {
      lineas.push(actual.slice(0, columns))
      actual = actual.slice(columns)
    }
  }

  if (actual.length) lineas.push(actual)
  return lineas.length ? lineas : [""]
}

/**
 * El cuerpo del recibo, en columnas de ancho fijo.
 *
 * Ojo con el nombre: el texto sale ESCAPADO para HTML, porque su único
 * consumidor es `buildReceiptHtml`. Si algún día hiciera falta el texto plano
 * de verdad (para mandarlo por ESC/POS, por ejemplo), hay que sacar el escapado
 * fuera de esta función en vez de deshacerlo a la salida.
 */
export function buildReceiptText(data: ReceiptData, width: PaperWidth = 58): string {
  const cols = COLUMNS[width]
  const lineas: string[] = []
  const centrar = (texto: string) => {
    const limpio = String(texto ?? "").slice(0, cols)
    const margen = Math.max(0, Math.floor((cols - limpio.length) / 2))
    return escape(" ".repeat(margen) + limpio)
  }

  lineas.push(centrar(data.negocio.nombre.toUpperCase()))
  if (data.negocio.rif) lineas.push(centrar(`RIF: ${data.negocio.rif}`))
  if (data.negocio.direccion) {
    for (const linea of envolver(data.negocio.direccion, cols)) lineas.push(centrar(linea))
  }
  if (data.negocio.telefono) lineas.push(centrar(data.negocio.telefono))

  lineas.push("")
  lineas.push(centrar(data.tipoDocumento.toUpperCase()))
  if (data.numeroDocumento) {
    lineas.push(centrar(data.numeroDocumento))
  } else {
    // Se dice en el papel, no solo en la pantalla: quien reciba este recibo
    // tiene que saber que su número está pendiente.
    lineas.push(centrar("SIN NUMERAR"))
  }

  if (data.anulada) {
    lineas.push("")
    lineas.push(centrar("*** ANULADA ***"))
  }

  lineas.push(separador(cols, "="))
  lineas.push(
    escape(
      data.fecha.toLocaleString("es-VE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    ),
  )
  if (data.cajero) lineas.push(escape(`Atendido por: ${data.cajero}`))
  if (data.cliente?.nombre) lineas.push(escape(`Cliente: ${data.cliente.nombre}`))
  if (data.cliente?.documento) lineas.push(escape(`Doc: ${data.cliente.documento}`))

  lineas.push(separador(cols))

  for (const item of data.items) {
    for (const linea of envolver(item.nombre, cols)) lineas.push(escape(linea))
    const detalle = `${item.cantidad} x ${money(item.precioUnitario)}`
    lineas.push(fila(`  ${detalle}`, money(item.total), cols))
  }

  lineas.push(separador(cols))
  lineas.push(fila("Subtotal", money(data.totales.subtotal), cols))

  if (data.totales.descuento && data.totales.descuento > 0) {
    lineas.push(fila("Descuento", `-${money(data.totales.descuento)}`, cols))
  }
  if (data.totales.iva && data.totales.iva > 0) {
    lineas.push(fila("Base imponible", money(data.totales.baseImponible ?? 0), cols))
    lineas.push(fila("IVA", money(data.totales.iva), cols))
  }
  if (data.totales.igtf && data.totales.igtf > 0) {
    lineas.push(fila("IGTF", money(data.totales.igtf), cols))
  }

  lineas.push(separador(cols, "="))
  lineas.push(fila("TOTAL $", money(data.totales.total), cols))

  if (data.totales.totalBs) {
    lineas.push(fila("TOTAL Bs", moneyBs(data.totales.totalBs), cols))
  }
  if (data.totales.tasa) {
    lineas.push(fila("Tasa", moneyBs(data.totales.tasa), cols))
  }

  lineas.push("")
  lineas.push(fila("Pago", data.metodoPago, cols))
  if (data.vueltoBs && data.vueltoBs > 0) {
    lineas.push(fila("Vuelto Bs", moneyBs(data.vueltoBs), cols))
  }

  lineas.push("")
  lineas.push(centrar("¡Gracias por su compra!"))
  // Papel de sobra al final: la cuchilla corta unos milímetros más arriba de
  // donde termina la impresión, y sin esto se lleva la última línea.
  lineas.push("")
  lineas.push("")
  lineas.push("")

  return lineas.join("\n")
}

/**
 * Documento imprimible completo.
 *
 * El `@page` con el ancho exacto del papel y márgenes a cero es lo que hace
 * que el controlador no intente encajar una carta en un rollo de 58 mm.
 */
export function buildReceiptHtml(data: ReceiptData, width: PaperWidth = 58): string {
  // 58 mm de papel tienen ~48 mm imprimibles; 80 mm tienen ~72.
  const printable = width === 58 ? 48 : 72
  const cols = COLUMNS[width]

  // El cuerpo de letra NO se elige a ojo: se calcula para que quepan
  // exactamente `cols` caracteres en el ancho imprimible.
  //
  // En una tipografía monoespaciada cada carácter avanza 0,6 em, así que:
  //     em = ancho imprimible / columnas / 0,6
  //
  // Sale ~2,5 mm para los dos anchos, que es coherente: ambos rollos dan algo
  // más de 1,5 mm por carácter. Se aplica un 4% de margen por si el sistema
  // sustituye Courier por otra monoespaciada un poco más ancha.
  //
  // Esto empezó a 9 pt puestos a ojo y las líneas se partían en dos: los
  // importes dejaban de estar en columna y el recibo se volvía ilegible.
  const fontSize = ((printable / cols / 0.6) * 0.96).toFixed(3)

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escape(data.numeroDocumento ?? "Recibo")}</title>
<style>
  @page {
    size: ${width}mm auto;
    margin: 0;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
  }
  pre {
    margin: 0;
    padding: 2mm 0 2mm 2mm;
    width: ${printable}mm;
    /* Monoespaciada: sin ella los importes no quedan en columna. */
    font-family: "Courier New", Courier, monospace;
    font-size: ${fontSize}mm;
    line-height: 1.3;
    /* Negro puro: la térmica no tiene grises, solo quema o no quema. */
    color: #000;
    /* pre, y no pre-wrap: las líneas ya vienen con el largo exacto del papel.
       Si alguna se pasara, es un fallo que hay que ver, no algo que deba
       envolverse en silencio rompiendo la alineación de los importes. */
    white-space: pre;
  }
  @media screen {
    body {
      display: flex;
      justify-content: center;
      padding: 16px;
      background: #f2f4f7;
    }
    pre {
      background: #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,.2);
    }
  }
</style>
</head>
<body><pre>${buildReceiptText(data, width)}</pre></body>
</html>`
}

/**
 * Imprime el recibo.
 *
 * Se usa un iframe oculto en vez de `window.open`: los bloqueadores de
 * ventanas emergentes matan la ventana nueva justo cuando el cajero pulsa
 * imprimir, que es el peor momento posible. El iframe siempre funciona.
 */
export function printReceipt(data: ReceiptData, width: PaperWidth = 58): void {
  if (typeof document === "undefined") return

  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"

  document.body.appendChild(iframe)

  const limpiar = () => {
    // Se espera un poco antes de quitarlo: algunos navegadores cancelan la
    // impresión si el iframe desaparece mientras el diálogo sigue abierto.
    setTimeout(() => iframe.remove(), 1000)
  }

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch (error) {
      console.error("No se pudo imprimir el recibo:", error)
    } finally {
      limpiar()
    }
  }

  const documento = iframe.contentWindow?.document
  if (!documento) {
    iframe.remove()
    return
  }

  documento.open()
  documento.write(buildReceiptHtml(data, width))
  documento.close()
}

/** Descarga el recibo como archivo, para reimprimirlo o enviarlo. */
export function downloadReceipt(data: ReceiptData, width: PaperWidth = 58): void {
  const blob = new Blob([buildReceiptHtml(data, width)], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)

  const enlace = document.createElement("a")
  enlace.href = url
  enlace.download = `${data.numeroDocumento ?? "recibo"}.html`
  enlace.click()

  URL.revokeObjectURL(url)
}
