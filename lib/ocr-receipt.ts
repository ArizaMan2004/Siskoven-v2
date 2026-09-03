// /lib/ocr-receipt.ts
//
// Lee un comprobante de pago móvil y saca sus datos.
//
// POR QUÉ SE HACE EN EL PROPIO TELÉFONO
//
// Un comprobante lleva el teléfono del cliente, su banco y a veces su cédula.
// Mandarlo a un servicio de terceros para que lo transcriba es repartir datos
// de un cliente que no dio permiso para eso. Tesseract corre dentro del
// navegador: la imagen no sale del dispositivo.
//
// De rebote sale gratis y funciona sin conexión, que es como funciona el resto
// del sistema.
//
// EL CASO ES MÁS FÁCIL DE LO QUE PARECE
//
// Casi nadie fotografía un papel: se enseña la CAPTURA DE PANTALLA de la
// aplicación del banco. Eso es texto digital, nítido y de alto contraste, que
// es justo donde Tesseract acierta. Las fotos de pantallas ajenas —con reflejo
// y en ángulo— salen peor, y por eso nada de lo que sale de aquí se da por
// bueno solo.
//
// LA REGLA QUE NO SE ROMPE
//
// Esto RELLENA campos, no los confirma. Todo lo que devuelve se puede corregir
// a mano antes de cobrar, y la venta no se cierra sola. Una referencia mal
// leída que entra sin que nadie la mire ensucia la conciliación en silencio, y
// meses después nadie sabe por qué un pago no cuadra.

import { type BancoVE, detectarBanco } from "./banks-ve"

export interface CampoLeido<T> {
  valor: T | null
  /** 0 a 1. Por debajo de 0,6 la pantalla lo marca para que lo revisen. */
  confianza: number
}

export interface ComprobanteLeido {
  referencia: CampoLeido<string>
  montoBs: CampoLeido<number>
  fecha: CampoLeido<Date>
  telefono: CampoLeido<string>
  banco: CampoLeido<BancoVE>
  /** El texto completo, por si hay que depurar por qué no encontró algo. */
  textoCrudo: string
}

/**
 * Arregla las confusiones típicas del OCR en un trozo que SABEMOS que es
 * numérico.
 *
 * Solo se aplica a campos numéricos: hacerlo sobre texto libre convertiría
 * "Banesco" en "8ane5co". La lista sale de mirar fallos reales sobre capturas
 * de banca en móvil.
 */
function soloDigitos(texto: string): string {
  return texto
    .replace(/[OoQ]/g, "0")
    .replace(/[lIi|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8")
    .replace(/[Zz]/g, "2")
    .replace(/\D/g, "")
}

/**
 * Interpreta un importe en formato venezolano: 1.234,56
 *
 * El punto separa millares y la coma decimales, al revés que en inglés. Si se
 * lee al derecho inglés, "1.234,56" se convierte en 1,23 y la conciliación
 * empieza a fallar por mil.
 */
function parsearMontoVE(texto: string): number | null {
  const limpio = texto.replace(/[^\d.,]/g, "")
  if (!limpio) return null

  const ultimaComa = limpio.lastIndexOf(",")
  const ultimoPunto = limpio.lastIndexOf(".")

  let normalizado: string
  if (ultimaComa > ultimoPunto) {
    // Formato venezolano: los puntos son millares, la coma es el decimal.
    normalizado = limpio.replace(/\./g, "").replace(",", ".")
  } else if (ultimoPunto > ultimaComa) {
    // Puede ser "1,234.56" (inglés) o "1234.56". En los dos casos, quitar las
    // comas y dejar el punto acierta.
    normalizado = limpio.replace(/,/g, "")
  } else {
    normalizado = limpio
  }

  const valor = Number(normalizado)
  return Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : null
}

/** dd/mm/aaaa y sus variantes con guion o punto. */
function parsearFechaVE(texto: string): Date | null {
  const coincidencia = texto.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (!coincidencia) return null

  const [, d, m, a] = coincidencia
  const dia = Number(d)
  const mes = Number(m)
  const año = Number(a) < 100 ? 2000 + Number(a) : Number(a)

  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null

  const fecha = new Date(año, mes - 1, dia)
  // Una fecha de hace diez años o del año que viene es un error de lectura, no
  // un pago. Descartarla es mejor que meterla en la conciliación.
  const ahora = Date.now()
  const haceUnAño = ahora - 365 * 24 * 60 * 60 * 1000
  const enUnaSemana = ahora + 7 * 24 * 60 * 60 * 1000

  return fecha.getTime() >= haceUnAño && fecha.getTime() <= enUnaSemana ? fecha : null
}

// ---------------------------------------------------------------------------
// Extracción campo por campo
// ---------------------------------------------------------------------------

/**
 * La referencia de la operación.
 *
 * Se busca primero junto a su etiqueta, que es donde no hay dudas. Sin
 * etiqueta se cae a "el número largo suelto más plausible", y ahí hay que
 * esquivar dos trampas que se parecen mucho a una referencia:
 *
 *  · el teléfono, que empieza por 04 y tiene 11 dígitos
 *  · la cédula, que suele venir precedida de V, E o J
 */
function extraerReferencia(texto: string): CampoLeido<string> {
  // Dos detalles de esta expresión que costaron un fallo real:
  //
  //   [^\S\n]  es "espacio, pero NO salto de línea"
  //   [^\n]    corta al llegar al final de la línea
  //
  // Sin eso, la captura se comía la línea siguiente. "Referencia: 001234567890"
  // seguido de "Beneficiario:" devolvía la referencia con un 8 pegado al final,
  // porque soloDigitos() convierte la B de "Beneficiario" en un 8.
  // Se prueban TODAS las etiquetas que aparezcan, no solo la primera.
  //
  // Casi todo comprobante venezolano empieza con "Operación exitosa", que
  // coincide con la etiqueta `operación` mucho antes de que aparezca el
  // "Referencia:" de verdad. Quedándose con la primera coincidencia se leía
  // " exitosa", no daba dígitos, y la referencia buena se perdía aunque
  // estuviera tres líneas más abajo.
  const etiquetas =
    /(?:referencia|referen|nro\.?[^\S\n]*ref|n[úu]mero[^\S\n]+de[^\S\n]+operaci[óo]n|operaci[óo]n|comprobante)[^\S\n]*[:#.]?[^\S\n]*([^\n]{4,30})/gi

  for (const coincidencia of texto.matchAll(etiquetas)) {
    // Dentro de la línea se corta en la primera PALABRA —dos letras o más
    // seguidas—, para que "Referencia: 12345678 Bs 500,00" no acabe siendo
    // "12345678850500". Una letra suelta sí pasa: casi siempre es un dígito mal
    // leído, que es justo lo que soloDigitos() viene a arreglar.
    const hastaLaPalabra = coincidencia[1].split(/[A-Za-z]{2,}/)[0]
    const digitos = soloDigitos(hastaLaPalabra)
    if (digitos.length >= 6) return { valor: digitos, confianza: 0.92 }
  }

  // Sin etiqueta: números largos que no sean un teléfono ni una fecha pegada.
  const candidatos = [...texto.matchAll(/\b(\d{6,15})\b/g)]
    .map((coincidencia) => coincidencia[1])
    .filter((numero) => !/^04\d{9}$/.test(numero))

  if (candidatos.length === 0) return { valor: null, confianza: 0 }

  // El más largo suele ser la referencia; cuantos más candidatos haya, menos
  // seguro está de haber elegido bien.
  const elegido = [...candidatos].sort((a, b) => b.length - a.length)[0]
  return { valor: elegido, confianza: candidatos.length === 1 ? 0.7 : 0.45 }
}

function extraerMonto(texto: string): CampoLeido<number> {
  const conEtiqueta = texto.match(
    /(?:monto|importe|total|bs\.?|se\s+transfiri[óo])\s*[:.]?\s*(?:bs\.?\s*)?([\d.,]{3,20})/i,
  )

  if (conEtiqueta) {
    const valor = parsearMontoVE(conEtiqueta[1])
    if (valor) return { valor, confianza: 0.9 }
  }

  // Sin etiqueta: el importe con decimales más alto del comprobante. En una
  // confirmación de pago casi siempre hay uno solo.
  const candidatos = [...texto.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g)]
    .map((m) => parsearMontoVE(m[1]))
    .filter((n): n is number => n !== null)

  if (candidatos.length === 0) return { valor: null, confianza: 0 }

  return {
    valor: Math.max(...candidatos),
    confianza: candidatos.length === 1 ? 0.75 : 0.5,
  }
}

function extraerTelefono(texto: string): CampoLeido<string> {
  // Los prefijos móviles venezolanos. Fijar la lista evita confundir el
  // teléfono con un trozo de la referencia.
  const coincidencia = texto.match(/\b(0?4(?:12|14|16|24|26|22))[\s-]?(\d{7})\b/)
  if (!coincidencia) return { valor: null, confianza: 0 }

  const prefijo = coincidencia[1].padStart(4, "0")
  return { valor: `${prefijo}${coincidencia[2]}`, confianza: 0.85 }
}

function extraerFecha(texto: string): CampoLeido<Date> {
  const conEtiqueta = texto.match(/(?:fecha|d[íi]a)\s*[:.]?\s*([\d/\-.]{6,12})/i)
  if (conEtiqueta) {
    const fecha = parsearFechaVE(conEtiqueta[1])
    if (fecha) return { valor: fecha, confianza: 0.9 }
  }

  const suelta = parsearFechaVE(texto)
  if (suelta) return { valor: suelta, confianza: 0.65 }

  return { valor: null, confianza: 0 }
}

// ---------------------------------------------------------------------------

/** Saca los campos de un texto ya transcrito. Se exporta para poder probarlo. */
export function extraerCampos(texto: string): ComprobanteLeido {
  const banco = detectarBanco(texto)

  return {
    referencia: extraerReferencia(texto),
    montoBs: extraerMonto(texto),
    fecha: extraerFecha(texto),
    telefono: extraerTelefono(texto),
    banco: { valor: banco, confianza: banco ? 0.85 : 0 },
    textoCrudo: texto,
  }
}

export interface ProgresoOCR {
  etapa: string
  progreso: number
}

/**
 * Transcribe la imagen y saca los campos.
 *
 * Tesseract se carga con `import()` dinámico y no arriba del archivo: son
 * varios megas entre el motor y el idioma, y el punto de venta tiene que abrir
 * rápido en un teléfono con datos móviles. Solo se descarga cuando alguien
 * pulsa "leer comprobante", y el navegador se lo queda en caché para las
 * siguientes.
 */
export async function leerComprobante(
  imagen: File | Blob | string,
  alProgresar?: (progreso: ProgresoOCR) => void,
): Promise<ComprobanteLeido> {
  const { createWorker } = await import("tesseract.js")

  const worker = await createWorker("spa", 1, {
    logger: (mensaje: { status: string; progress: number }) => {
      if (!alProgresar) return

      // Los estados de Tesseract vienen en inglés y son crípticos. Se traducen
      // a lo que la persona está esperando que pase.
      const etapas: Record<string, string> = {
        "loading tesseract core": "Preparando el lector",
        "initializing tesseract": "Preparando el lector",
        "loading language traineddata": "Descargando el idioma",
        "initializing api": "Casi listo",
        "recognizing text": "Leyendo el comprobante",
      }

      alProgresar({
        etapa: etapas[mensaje.status] ?? "Trabajando",
        progreso: mensaje.progress ?? 0,
      })
    },
  })

  try {
    const { data } = await worker.recognize(imagen)
    return extraerCampos(data.text)
  } finally {
    // Sin esto queda un worker vivo por cada comprobante leído, y tras un día
    // de caja el navegador del teléfono se arrastra.
    await worker.terminate()
  }
}

/** Cuántos campos salieron con poca confianza. La pantalla los resalta. */
export function camposDudosos(leido: ComprobanteLeido): string[] {
  const dudosos: string[] = []
  const UMBRAL = 0.6

  if (!leido.referencia.valor || leido.referencia.confianza < UMBRAL) dudosos.push("referencia")
  if (!leido.montoBs.valor || leido.montoBs.confianza < UMBRAL) dudosos.push("monto")
  if (!leido.banco.valor) dudosos.push("banco")

  return dudosos
}
