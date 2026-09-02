"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { m } from "framer-motion"
import { HelpCircle } from "lucide-react"
import TutorialOverlay from "./tutorial-overlay"
import { tutorialDe, tutorialesVistos } from "@/lib/tutorials"
import { tapScale } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface Props {
  /** Módulo abierto. Decide qué tutorial se abre. */
  vista: string
  className?: string
}

/**
 * El botón de ayuda, y el tutorial de la pantalla que hay debajo.
 *
 * VA EN LA CABECERA, NO FLOTANDO
 *
 * La cabecera es pegajosa, así que el botón está siempre a la vista sin tapar
 * nada. Nació aquí porque abajo a la derecha vivía el distintivo de reCAPTCHA;
 * ese ya no está, pero el sitio se queda: un botón flotante tapa contenido
 * justo en la esquina donde el pulgar ya tiene la barra de navegación.
 *
 * EL PUNTITO
 *
 * Aparece cuando el tutorial de esta pantalla no se ha visto nunca. Es la
 * diferencia entre una ayuda que está y una ayuda que se encuentra: sin él,
 * nadie pulsa un interrogante en una pantalla que cree entender.
 *
 * Se apaga al abrirlo, también si se salta. Insistir a quien ya dijo que no lo
 * necesita es hostigarlo, y enseña a ignorar el aviso el día que sí importe.
 */
export default function HelpButton({ vista, className }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [visto, setVisto] = useState(true)
  /** `document` no existe en el servidor, así que el portal espera al montaje. */
  const [montado, setMontado] = useState(false)

  useEffect(() => setMontado(true), [])

  const tutorial = tutorialDe(vista)

  // Se lee en un efecto y no al renderizar porque `localStorage` no existe en el
  // servidor: leerlo directamente rompería el HTML inicial. Empieza en "visto"
  // para que el punto no parpadee en cada carga.
  useEffect(() => {
    setVisto(tutorialesVistos().includes(vista))
  }, [vista, abierto])

  // Sin tutorial para esta pantalla no se enseña un botón que no hace nada.
  if (!tutorial) return null

  return (
    <>
      <m.button
        type="button"
        whileTap={tapScale}
        onClick={() => setAbierto(true)}
        aria-label={`Cómo se usa ${tutorial.titulo}`}
        className={cn(
          "text-muted-foreground hover:bg-muted hover:text-foreground relative flex h-9 items-center gap-1.5 rounded-full px-2.5 transition-colors sm:px-3",
          className,
        )}
      >
        <HelpCircle className="size-5 shrink-0" aria-hidden />
        <span className="hidden text-sm font-medium sm:inline">Ayuda</span>

        {!visto && (
          <span
            className="bg-primary ring-card absolute top-1 right-1.5 size-2 rounded-full ring-2 sm:right-2"
            aria-hidden
          />
        )}
      </m.button>

      {/* El tutorial se saca al <body> con un portal.
          Sin esto se colaba dentro de la cabecera, y la cabecera lleva
          `backdrop-blur`: cualquier filtro (o transform, o perspective)
          convierte al elemento en el contenedor de referencia de sus hijos
          `position: fixed`. El resultado era un diálogo de 634 píxeles anclado
          a una barra de 100, con la mitad de arriba fuera de la pantalla.

          Y sin AnimatePresence alrededor: en este proyecto no llega a quitar del
          DOM al hijo que sale (ver la nota de lib/motion.ts), así que dejaba un
          `role="dialog" aria-modal="true"` invisible pero vivo, que para un
          lector de pantalla es un diálogo abierto encima de todo. Cerrar de
          golpe no se nota; un diálogo fantasma sí. */}
      {montado &&
        abierto &&
        createPortal(
          <TutorialOverlay tutorial={tutorial} onClose={() => setAbierto(false)} />,
          document.body,
        )}
    </>
  )
}
