"use client"

import { useEffect, useRef, useState } from "react"
import { m } from "framer-motion"
import {
  AlertTriangle,
  Camera,
  Check,
  ImageIcon,
  Loader2,
  ScanLine,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BANCOS_ORDENADOS, bancoPorCodigo } from "@/lib/banks-ve"
import { camposDudosos, leerComprobante, type ProgresoOCR } from "@/lib/ocr-receipt"
import { type DatosComprobante, referenciaYaUsada } from "@/lib/payment-receipts"
import { formatBs } from "@/lib/pricing"
import { fadeUp } from "@/lib/motion"

const SELECT_CLASS =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

interface Props {
  negocioId: string
  metodo: string
  /** Lo que el sistema espera cobrar, para avisar si no cuadra. */
  montoEsperadoBs: number
  onCambio: (estado: {
    datos: DatosComprobante | null
    archivo: File | null
    completo: boolean
  }) => void
}

/**
 * Captura del comprobante de pago: la imagen y sus datos.
 *
 * TRES DECISIONES QUE SE NOTAN EN EL MOSTRADOR
 *
 * · La imagen es opcional; la referencia no. Se puede teclear la referencia sin
 *   subir nada —a veces el cliente solo la dicta— pero sin referencia el pago
 *   no se puede cuadrar después contra el banco, que es todo el objetivo.
 *
 * · Lo que lee el OCR entra en los campos y ahí se queda, editable. Nada se da
 *   por bueno solo. Los campos que salieron con poca confianza se marcan, para
 *   que la vista vaya justo a donde hay que mirar.
 *
 * · La referencia repetida se avisa MIENTRAS SE ESCRIBE, no al cobrar. Enterarse
 *   de que esa captura ya se usó cuando el cliente ya se fue no sirve de nada.
 */
export default function ReceiptCapture({ negocioId, metodo, montoEsperadoBs, onCambio }: Props) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null)

  const [referencia, setReferencia] = useState("")
  const [bancoCodigo, setBancoCodigo] = useState("")
  const [telefono, setTelefono] = useState("")
  const [montoBs, setMontoBs] = useState("")

  const [leyendo, setLeyendo] = useState(false)
  const [progreso, setProgreso] = useState<ProgresoOCR | null>(null)
  const [dudosos, setDudosos] = useState<string[]>([])
  const [errorOcr, setErrorOcr] = useState("")

  const [avisoRepetida, setAvisoRepetida] = useState<string | null>(null)
  const entradaArchivo = useRef<HTMLInputElement>(null)

  // La vista previa es un objeto en memoria del navegador. Si no se revoca al
  // cambiar de imagen, cada comprobante de la jornada se queda ocupando sitio.
  useEffect(() => {
    if (!archivo) {
      setVistaPrevia(null)
      return
    }

    const url = URL.createObjectURL(archivo)
    setVistaPrevia(url)
    return () => URL.revokeObjectURL(url)
  }, [archivo])

  // Se avisa al padre en cada cambio para que el botón de cobrar sepa si puede
  // habilitarse.
  useEffect(() => {
    const monto = Number(montoBs) || 0
    const banco = bancoPorCodigo(bancoCodigo)

    onCambio({
      archivo,
      datos: referencia.trim()
        ? {
            referencia: referencia.trim(),
            bancoCodigo: banco?.codigo ?? null,
            bancoNombre: banco?.nombre ?? null,
            telefonoEmisor: telefono.trim() || null,
            montoBs: monto || montoEsperadoBs,
            metodo,
          }
        : null,
      completo: referencia.trim().length >= 4,
    })
    // `onCambio` cambia de identidad en cada render del padre; incluirla aquí
    // dispararía un bucle infinito de avisos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referencia, bancoCodigo, telefono, montoBs, archivo, metodo, montoEsperadoBs])

  // Comprobación de referencia repetida, esperando a que deje de teclear.
  useEffect(() => {
    const limpia = referencia.trim()
    if (limpia.length < 4) {
      setAvisoRepetida(null)
      return
    }

    let cancelado = false
    const temporizador = setTimeout(async () => {
      try {
        const estado = await referenciaYaUsada({
          negocioId,
          referencia: limpia,
          montoBs: Number(montoBs) || undefined,
        })
        if (cancelado) return

        if (!estado.repetida) {
          setAvisoRepetida(null)
        } else if (estado.mismoMonto) {
          setAvisoRepetida(
            "Esta referencia YA está registrada, y por el mismo monto. O se cobró dos veces, o es la misma captura otra vez. Compruébalo antes de entregar nada.",
          )
        } else {
          setAvisoRepetida(
            `Esta referencia ya está registrada, pero por ${formatBs(estado.comprobante.montoBs)}. Revisa que no te hayas equivocado al teclearla.`,
          )
        }
      } catch {
        // Sin conexión no se puede comprobar. No se bloquea el cobro por eso:
        // el aviso es una ayuda, no un requisito.
        if (!cancelado) setAvisoRepetida(null)
      }
    }, 600)

    return () => {
      cancelado = true
      clearTimeout(temporizador)
    }
  }, [referencia, montoBs, negocioId])

  const elegirImagen = async (nuevo: File | null) => {
    setArchivo(nuevo)
    setErrorOcr("")
    setDudosos([])
    if (!nuevo) return

    setLeyendo(true)
    try {
      const leido = await leerComprobante(nuevo, setProgreso)

      // Solo se rellena lo que esté vacío: si alguien ya tecleó la referencia a
      // mano, el OCR no se la pisa.
      if (leido.referencia.valor) setReferencia((actual) => actual || leido.referencia.valor!)
      if (leido.banco.valor) setBancoCodigo((actual) => actual || leido.banco.valor!.codigo)
      if (leido.telefono.valor) setTelefono((actual) => actual || leido.telefono.valor!)
      if (leido.montoBs.valor) setMontoBs((actual) => actual || String(leido.montoBs.valor))

      setDudosos(camposDudosos(leido))
    } catch {
      setErrorOcr("No se pudo leer la imagen. Escribe los datos a mano; la imagen se guarda igual.")
    } finally {
      setLeyendo(false)
      setProgreso(null)
    }
  }

  const montoLeido = Number(montoBs) || 0
  const descuadre = montoLeido > 0 && Math.abs(montoLeido - montoEsperadoBs) > 0.01

  return (
    <m.div variants={fadeUp} initial="hidden" animate="visible" className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Comprobante del pago</p>
        {referencia.trim().length >= 4 && !avisoRepetida ? (
          <span className="text-success flex items-center gap-1 text-xs font-medium">
            <Check className="size-3.5" aria-hidden />
            listo
          </span>
        ) : null}
      </div>

      {/* La imagen. `capture` hace que en el teléfono se abra la cámara
          directamente, que es lo que se quiere cuando el cliente enseña su
          pantalla; en escritorio el atributo se ignora y abre el explorador. */}
      {!vistaPrevia ? (
        <div className="flex gap-2">
          <input
            ref={entradaArchivo}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(evento) => elegirImagen(evento.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-2"
            onClick={() => entradaArchivo.current?.click()}
          >
            <ImageIcon className="size-4" aria-hidden />
            Subir captura
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-2"
            onClick={() => {
              if (!entradaArchivo.current) return
              entradaArchivo.current.setAttribute("capture", "environment")
              entradaArchivo.current.click()
              entradaArchivo.current.removeAttribute("capture")
            }}
          >
            <Camera className="size-4" aria-hidden />
            Tomar foto
          </Button>
        </div>
      ) : (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={vistaPrevia}
            alt="Comprobante del pago"
            className="max-h-44 w-full rounded-md border object-contain"
          />
          <button
            type="button"
            onClick={() => elegirImagen(null)}
            aria-label="Quitar la imagen"
            className="bg-background/90 absolute top-1.5 right-1.5 rounded-md border p-1.5 shadow-sm"
          >
            <Trash2 className="text-muted-foreground size-4" aria-hidden />
          </button>

          {leyendo && (
            <div className="bg-background/85 absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md">
              <ScanLine className="text-primary size-6 animate-pulse" aria-hidden />
              <p className="text-sm font-medium">{progreso?.etapa ?? "Leyendo"}</p>
              <div className="bg-muted h-1.5 w-40 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${Math.round((progreso?.progreso ?? 0) * 100)}%` }}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                La imagen no sale de tu teléfono
              </p>
            </div>
          )}
        </div>
      )}

      {errorOcr ? <p className="text-muted-foreground text-xs">{errorOcr}</p> : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="comp-referencia" className="mb-1 block text-xs font-medium">
            Referencia <span className="text-destructive">*</span>
          </label>
          <Input
            id="comp-referencia"
            value={referencia}
            onChange={(evento) => setReferencia(evento.target.value.replace(/\s/g, ""))}
            placeholder="Número de la operación"
            inputMode="numeric"
            className={dudosos.includes("referencia") && referencia ? "border-warning" : ""}
          />
        </div>

        <div>
          <label htmlFor="comp-banco" className="mb-1 block text-xs font-medium">
            Banco emisor
          </label>
          <select
            id="comp-banco"
            value={bancoCodigo}
            onChange={(evento) => setBancoCodigo(evento.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Sin especificar</option>
            {BANCOS_ORDENADOS.map((banco) => (
              <option key={banco.codigo} value={banco.codigo}>
                {banco.codigo} · {banco.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="comp-telefono" className="mb-1 block text-xs font-medium">
            Teléfono emisor
          </label>
          <Input
            id="comp-telefono"
            value={telefono}
            onChange={(evento) => setTelefono(evento.target.value)}
            placeholder="04141234567"
            inputMode="tel"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="comp-monto" className="mb-1 block text-xs font-medium">
            Monto del comprobante (Bs)
          </label>
          <Input
            id="comp-monto"
            value={montoBs}
            onChange={(evento) => setMontoBs(evento.target.value)}
            placeholder={montoEsperadoBs.toFixed(2)}
            inputMode="decimal"
            className={descuadre ? "border-warning" : ""}
          />
        </div>
      </div>

      {/* El descuadre entre lo que dice el comprobante y lo que se está
          cobrando. No bloquea —a veces se paga de más y se da vuelto— pero
          tiene que verse. */}
      {descuadre && (
        <p className="text-warning-foreground dark:text-warning flex items-start gap-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          El comprobante dice {formatBs(montoLeido)} y estás cobrando{" "}
          {formatBs(montoEsperadoBs)}. Diferencia de{" "}
          {formatBs(Math.abs(montoLeido - montoEsperadoBs))}.
        </p>
      )}

      {avisoRepetida && (
        <p className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-xs font-medium">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {avisoRepetida}
        </p>
      )}

      {dudosos.length > 0 && !leyendo && (
        <p className="text-muted-foreground text-xs">
          Revisa {dudosos.join(" y ")}: la lectura no quedó clara.
        </p>
      )}
    </m.div>
  )
}

/** Se exporta el icono de cerrar para que el diálogo padre no lo reimporte. */
export { X }
