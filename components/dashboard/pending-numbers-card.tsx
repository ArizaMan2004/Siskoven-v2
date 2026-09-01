"use client"

import { useCallback, useEffect, useState } from "react"
import { m } from "framer-motion"
import { FileWarning, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { asignarPendientes, contarPendientes } from "@/lib/document-numbers"
import { fadeUp } from "@/lib/motion"

/**
 * Ventas guardadas sin conexión que todavía no tienen número correlativo.
 *
 * Solo aparece si hay alguna. Es el cabo suelto del sistema sin conexión: la
 * venta está a salvo, pero su documento no puede imprimirse hasta que reciba su
 * número, y conviene que alguien lo vea y lo resuelva el mismo día.
 */
export default function PendingNumbersCard() {
  const { user, negocioId } = useAuth()
  const [pendientes, setPendientes] = useState(0)
  const [working, setWorking] = useState(false)
  const [checked, setChecked] = useState(false)

  const revisar = useCallback(async () => {
    if (!user || !negocioId) return

    try {
      setPendientes(await contarPendientes(negocioId, "ventas"))
    } catch (error) {
      // Sin conexión no se puede ni contar. No es un fallo que merezca ruido:
      // el aviso aparecerá cuando vuelva la red.
      console.warn("No se pudieron contar los documentos pendientes:", error)
    } finally {
      setChecked(true)
    }
  }, [user, negocioId])

  useEffect(() => {
    void revisar()
  }, [revisar])

  const numerar = async () => {
    if (!negocioId) return
    setWorking(true)

    try {
      const { numerados, fallidos } = await asignarPendientes({
        negocioId,
        tipo: "nota_entrega",
        coleccion: "ventas",
      })

      await revisar()

      alert(
        fallidos === 0
          ? `Listo: ${numerados} ${numerados === 1 ? "documento numerado" : "documentos numerados"}.`
          : `Se numeraron ${numerados}, pero ${fallidos} fallaron. Vuelve a intentarlo en un momento.`,
      )
    } catch (error) {
      console.error("Error numerando los pendientes:", error)
      alert("No se pudieron numerar ahora. Necesitas conexión para asignar los números.")
    } finally {
      setWorking(false)
    }
  }

  if (!checked || pendientes === 0) return null

  return (
    <m.div variants={fadeUp} initial="hidden" animate="visible">
      <Card className="border-warning/50 bg-warning/10">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FileWarning className="text-warning-foreground dark:text-warning mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">
                {pendientes} {pendientes === 1 ? "venta sin número" : "ventas sin número"}
              </p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Se registraron sin conexión, así que aún no tienen correlativo. Están guardadas y no
                se perdió nada; solo falta numerarlas para poder imprimir sus documentos.
              </p>
            </div>
          </div>

          <Button onClick={numerar} disabled={working} className="shrink-0 gap-2">
            {working ? <Loader2 className="size-4 animate-spin" /> : null}
            Numerar ahora
          </Button>
        </CardContent>
      </Card>
    </m.div>
  )
}
