"use client"

import { useRef, useState } from "react"
import { m } from "framer-motion"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { usePricingSettings } from "@/hooks/use-pricing-settings"
import { reportFirestoreError } from "@/lib/sync-status"
import { popIn } from "@/lib/motion"
import {
  CAMPOS,
  type CampoImportable,
  type FilaPreparada,
  type HojaLeida,
  type Mapeo,
  adivinarMapeo,
  importar,
  leerArchivo,
  plantillaCsv,
  validar,
} from "@/lib/import-products"

type Fase = "archivo" | "mapeo" | "revision" | "importando" | "listo"

interface Props {
  onClose: () => void
  onImported: () => void
}

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * Carga masiva del inventario, en cuatro pasos.
 *
 * El paso de revisión es el que hace que esto sea usable: se enseña
 * exactamente qué va a entrar y qué no, ANTES de escribir nada. Importar a
 * ciegas trescientos productos y descubrir después que los precios entraron
 * multiplicados por mil es un desastre que no tiene arreglo cómodo.
 */
export default function ImportProductsDialog({ onClose, onImported }: Props) {
  const { user, negocioId } = useAuth()
  const { settings: pricing } = usePricingSettings()
  const inputRef = useRef<HTMLInputElement>(null)

  const [fase, setFase] = useState<Fase>("archivo")
  const [nombreArchivo, setNombreArchivo] = useState("")
  const [hoja, setHoja] = useState<HojaLeida | null>(null)
  const [mapeo, setMapeo] = useState<Mapeo>({})
  const [filas, setFilas] = useState<FilaPreparada[]>([])
  const [error, setError] = useState("")
  const [progreso, setProgreso] = useState({ escritos: 0, total: 0 })

  const validas = filas.filter((fila) => fila.errores.length === 0)
  const conErrores = filas.filter((fila) => fila.errores.length > 0)
  const conAvisos = validas.filter((fila) => fila.avisos.length > 0)

  const elegirArchivo = async (archivo: File) => {
    setError("")
    try {
      const leida = await leerArchivo(archivo)

      if (leida.filas.length === 0) {
        setError("El archivo no tiene filas de datos, solo el encabezado.")
        return
      }

      setNombreArchivo(archivo.name)
      setHoja(leida)
      setMapeo(adivinarMapeo(leida.encabezados))
      setFase("mapeo")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.")
    }
  }

  const revisar = () => {
    if (!hoja) return

    if (mapeo.name === undefined) {
      setError("Tienes que indicar cuál columna tiene el nombre del producto.")
      return
    }

    setError("")
    setFilas(validar(hoja, mapeo).filas)
    setFase("revision")
  }

  const confirmar = async () => {
    if (!user || !negocioId) return

    setFase("importando")
    setProgreso({ escritos: 0, total: validas.length })

    try {
      await importar({
        negocioId,
        filas: validas,
        pricing,
        onProgreso: setProgreso,
      })
      setFase("listo")
    } catch (err) {
      console.error("Error importando:", err)
      reportFirestoreError(err)
      setError("Se cortó la importación. Revisa cuántos productos entraron antes de repetirla.")
      setFase("revision")
    }
  }

  const descargarPlantilla = () => {
    // El BOM al principio es lo que hace que Excel abra el archivo con los
    // acentos bien en vez de mostrar "Categorï¿½a".
    const blob = new Blob(["﻿" + plantillaCsv()], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement("a")
    enlace.href = url
    enlace.download = "plantilla-inventario-siskoven.csv"
    enlace.click()
    URL.revokeObjectURL(url)
  }

  return (
    <m.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => fase !== "importando" && onClose()}
    >
      <m.div
        variants={popIn}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(event) => event.stopPropagation()}
        className="bg-card flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border shadow-lg"
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="text-primary size-5" aria-hidden />
            <h3 className="font-semibold">Cargar inventario desde una hoja</h3>
          </div>
          {fase !== "importando" && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
              <X className="size-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Las fases se remontan por `key`. Ver la nota de lib/motion.ts. */}
          <div key={fase}>
            {/* ------------------------------------------------ 1. archivo */}
            {fase === "archivo" && (
              <m.div key="archivo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-muted-foreground text-sm">
                  Sube tu lista de productos y nosotros la interpretamos. No hace falta que use
                  ningún formato concreto: leemos los encabezados y tú corriges lo que haga falta.
                </p>

                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="border-border hover:border-primary hover:bg-primary/5 mt-5 flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors"
                >
                  <Upload className="text-muted-foreground size-8" aria-hidden />
                  <span className="font-medium">Elegir archivo</span>
                  <span className="text-muted-foreground text-xs">Excel (.xlsx, .xls) o CSV</span>
                </button>

                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt,.tsv"
                  className="hidden"
                  onChange={(event) => {
                    const archivo = event.target.files?.[0]
                    if (archivo) void elegirArchivo(archivo)
                    event.target.value = ""
                  }}
                />

                <div className="bg-muted/50 mt-5 rounded-lg p-4">
                  <p className="text-sm font-medium">¿No tienes la lista hecha?</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Descarga la plantilla, llénala en Excel y súbela.
                  </p>
                  <Button variant="outline" size="sm" onClick={descargarPlantilla} className="mt-3 gap-2">
                    <Download className="size-4" />
                    Descargar plantilla
                  </Button>
                </div>
              </m.div>
            )}

            {/* -------------------------------------------------- 2. mapeo */}
            {fase === "mapeo" && hoja && (
              <m.div key="mapeo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-sm">
                  <strong>{nombreArchivo}</strong>
                  <span className="text-muted-foreground"> · {hoja.filas.length} filas</span>
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Esto es lo que entendimos de tus columnas. Corrige lo que esté mal.
                </p>

                <div className="mt-5 space-y-3">
                  {CAMPOS.map((campo) => (
                    <div key={campo.id} className="grid grid-cols-[1fr_1.2fr] items-center gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {campo.label}
                          {campo.requerido && <span className="text-destructive"> *</span>}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">{campo.ayuda}</p>
                      </div>

                      <select
                        className={SELECT_CLASS}
                        value={mapeo[campo.id] ?? ""}
                        onChange={(event) => {
                          const valor = event.target.value
                          setMapeo((actual) => {
                            const siguiente = { ...actual }
                            if (valor === "") delete siguiente[campo.id as CampoImportable]
                            else siguiente[campo.id as CampoImportable] = Number(valor)
                            return siguiente
                          })
                        }}
                      >
                        <option value="">— sin columna —</option>
                        {hoja.encabezados.map((encabezado, indice) => (
                          <option key={indice} value={indice}>
                            {encabezado || `Columna ${indice + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </m.div>
            )}

            {/* ----------------------------------------------- 3. revisión */}
            {fase === "revision" && (
              <m.div key="revision" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="grid grid-cols-3 gap-3">
                  <div className="border-success/40 bg-success/10 rounded-lg border p-3 text-center">
                    <p className="text-success text-2xl font-bold">{validas.length}</p>
                    <p className="text-muted-foreground text-xs">entran</p>
                  </div>
                  <div className="border-warning/50 bg-warning/10 rounded-lg border p-3 text-center">
                    <p className="text-warning-foreground dark:text-warning text-2xl font-bold">
                      {conAvisos.length}
                    </p>
                    <p className="text-muted-foreground text-xs">con avisos</p>
                  </div>
                  <div className="border-destructive/40 bg-destructive/10 rounded-lg border p-3 text-center">
                    <p className="text-destructive text-2xl font-bold">{conErrores.length}</p>
                    <p className="text-muted-foreground text-xs">se saltan</p>
                  </div>
                </div>

                {conErrores.length > 0 && (
                  <div className="mt-4">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <AlertTriangle className="text-destructive size-4" aria-hidden />
                      Filas que no van a entrar
                    </p>
                    <ul className="divide-border mt-2 divide-y text-sm">
                      {conErrores.slice(0, 8).map((fila) => (
                        <li key={fila.linea} className="py-2">
                          <span className="text-muted-foreground">Fila {fila.linea}</span>
                          {fila.name ? <span className="ml-2">{fila.name}</span> : null}
                          <p className="text-destructive text-xs">{fila.errores.join(" · ")}</p>
                        </li>
                      ))}
                    </ul>
                    {conErrores.length > 8 && (
                      <p className="text-muted-foreground mt-2 text-xs">
                        …y {conErrores.length - 8} más.
                      </p>
                    )}
                  </div>
                )}

                {conAvisos.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium">Entran, pero míralas</p>
                    <ul className="divide-border mt-2 divide-y text-sm">
                      {conAvisos.slice(0, 5).map((fila) => (
                        <li key={fila.linea} className="py-2">
                          <span className="text-muted-foreground">Fila {fila.linea}</span>
                          <span className="ml-2">{fila.name}</span>
                          <p className="text-warning-foreground dark:text-warning text-xs">
                            {fila.avisos.join(" · ")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Primeras filas tal como quedarán, para cazar de un vistazo
                    un precio mil veces mayor de lo que debería. */}
                {validas.length > 0 && (
                  <div className="mt-5">
                    <p className="text-sm font-medium">Así van a quedar las primeras</p>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-border text-muted-foreground border-b text-left text-xs">
                            <th className="py-2 pr-3">Producto</th>
                            <th className="py-2 pr-3 text-right">Cant.</th>
                            <th className="py-2 pr-3 text-right">Costo</th>
                            <th className="py-2 text-right">Precio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validas.slice(0, 5).map((fila) => (
                            <tr key={fila.linea} className="border-border border-b">
                              <td className="py-2 pr-3">{fila.name}</td>
                              <td className="py-2 pr-3 text-right tabular-nums">{fila.quantity}</td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                ${fila.costUsd.toFixed(2)}
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                $
                                {(fila.precioUsd ??
                                  (fila.profit > 0 && fila.profit < 100
                                    ? fila.costUsd / (1 - fila.profit / 100)
                                    : fila.costUsd)
                                ).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </m.div>
            )}

            {/* -------------------------------------------- 4. importando */}
            {fase === "importando" && (
              <m.div key="importando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 text-center">
                <Loader2 className="text-primary mx-auto size-8 animate-spin" aria-hidden />
                <p className="mt-4 font-medium">
                  Cargando {progreso.escritos} de {progreso.total}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">No cierres esta ventana.</p>

                <div className="bg-muted mt-5 h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full transition-all"
                    style={{
                      width: `${progreso.total ? (progreso.escritos / progreso.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </m.div>
            )}

            {/* -------------------------------------------------- 5. listo */}
            {fase === "listo" && (
              <m.div key="listo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 text-center">
                <div className="bg-success/15 mx-auto grid size-14 place-items-center rounded-full">
                  <CheckCircle2 className="text-success size-7" aria-hidden />
                </div>
                <p className="mt-4 text-lg font-semibold">
                  {progreso.escritos} {progreso.escritos === 1 ? "producto cargado" : "productos cargados"}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Ya puedes vender. Revisa los precios antes de abrir la caja.
                </p>
              </m.div>
            )}
          </div>

          {error && (
            <p className="text-destructive mt-4 flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>

        {/* ------------------------------------------------------- acciones */}
        {fase !== "importando" && (
          <div className="flex gap-2 border-t px-5 py-4">
            {fase === "mapeo" && (
              <>
                <Button variant="outline" onClick={() => setFase("archivo")} className="gap-2">
                  <ArrowLeft className="size-4" />
                  Otro archivo
                </Button>
                <Button onClick={revisar} className="flex-1">
                  Revisar antes de cargar
                </Button>
              </>
            )}

            {fase === "revision" && (
              <>
                <Button variant="outline" onClick={() => setFase("mapeo")} className="gap-2">
                  <ArrowLeft className="size-4" />
                  Corregir columnas
                </Button>
                <Button onClick={confirmar} disabled={validas.length === 0} className="flex-1">
                  Cargar {validas.length} {validas.length === 1 ? "producto" : "productos"}
                </Button>
              </>
            )}

            {fase === "listo" && (
              <Button
                onClick={() => {
                  onImported()
                  onClose()
                }}
                className="w-full"
              >
                Ver mi inventario
              </Button>
            )}

            {fase === "archivo" && (
              <Button variant="outline" onClick={onClose} className="w-full">
                Cancelar
              </Button>
            )}
          </div>
        )}
      </m.div>
    </m.div>
  )
}
