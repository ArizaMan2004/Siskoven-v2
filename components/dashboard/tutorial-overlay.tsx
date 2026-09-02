"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import { ChevronLeft, ChevronRight, Lightbulb, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Figura } from "./tutorial-figures"
import { type Tutorial, marcarTutorialVisto } from "@/lib/tutorials"
import { DURATION, EASE, popIn } from "@/lib/motion"

interface Props {
  tutorial: Tutorial
  onClose: () => void
}

/**
 * El tutorial de una pantalla, en diapositivas.
 *
 * Se pasa con las flechas del teclado, con los botones, o arrastrando en el
 * teléfono. Se cierra con Escape o pulsando fuera.
 *
 * DECISIONES QUE SE NOTAN AL USARLO
 *
 * · La ilustración va arriba y ocupa la mitad. Una ayuda que es solo texto se
 *   lee como un manual, y el manual no lo lee nadie. El dibujo enseña la FORMA
 *   de la pantalla, que es lo que hace falta para orientarse.
 *
 * · Se puede saltar en cualquier momento, y saltar cuenta como verla. Obligar a
 *   pasar seis diapositivas para llegar al botón de cerrar es lo que hace que la
 *   gente aprenda a cerrar la ayuda sin leerla.
 *
 * · La diapositiva se anima entrando desde el lado por el que vas. Sin eso, tres
 *   pantallas seguidas parecen la misma pantalla parpadeando.
 */
export default function TutorialOverlay({ tutorial, onClose }: Props) {
  const [indice, setIndice] = useState(0)
  const [direccion, setDireccion] = useState(1)
  /** Dónde empezó el dedo, para saber hacia dónde se deslizó. */
  const inicioX = useRef<number | null>(null)

  const total = tutorial.diapositivas.length
  const diapositiva = tutorial.diapositivas[indice]
  const esUltima = indice === total - 1

  const cerrar = useCallback(() => {
    // Cerrar cuenta como visto, aunque se haya saltado: si alguien decide que no
    // lo necesita, insistirle cada vez que entre es hostigarlo.
    marcarTutorialVisto(tutorial.vista)
    onClose()
  }, [tutorial.vista, onClose])

  const ir = useCallback(
    (paso: number) => {
      setDireccion(paso)
      setIndice((actual) => Math.min(Math.max(actual + paso, 0), total - 1))
    },
    [total],
  )

  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") cerrar()
      if (evento.key === "ArrowRight") ir(1)
      if (evento.key === "ArrowLeft") ir(-1)
    }

    window.addEventListener("keydown", alPulsar)
    return () => window.removeEventListener("keydown", alPulsar)
  }, [cerrar, ir])

  return (
    <m.div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={cerrar}
      role="dialog"
      aria-modal="true"
      aria-label={`Cómo se usa: ${tutorial.titulo}`}
    >
      <m.div
        variants={popIn}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(evento) => evento.stopPropagation()}
        className="bg-card flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border shadow-2xl sm:max-h-[88vh] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Cómo se usa
            </p>
            <h2 className="truncate text-lg font-semibold">{tutorial.titulo}</h2>
          </div>

          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar la ayuda"
            className="text-muted-foreground hover:text-foreground -m-2 shrink-0 p-2"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* overflow-x-hidden porque la diapositiva entra desplazándose en X:
            sin esto, esos 28 píxeles de más sacan una barra horizontal dentro
            del propio tutorial. */}
        <div className="flex-1 overflow-x-hidden overflow-y-auto">
          {/* SIN AnimatePresence, y a propósito.
              Este diálogo ya vive dentro de otro AnimatePresence (el que lo
              abre y lo cierra) y encima al otro lado de un portal. Anidados así,
              con mode="wait", la salida de la diapositiva no llegaba a
              completarse nunca: el índice avanzaba —los puntos se movían, el
              botón cambiaba a "Entendido"— pero el contenido se quedaba
              congelado en el paso 1.
              Cambiar la `key` basta: React desmonta y vuelve a montar, y
              framer-motion reproduce la entrada. Se pierde la animación de
              salida, que con 220 ms no se echa de menos. */}
          <div key={indice}>
            <m.div
              initial={{ opacity: 0, x: direccion * 28 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DURATION.base, ease: EASE }}
              // El deslizamiento con el dedo va con eventos táctiles y no con el
              // `drag` de framer-motion: la aplicación carga LazyMotion con
              // `domAnimation`, que NO incluye la función de arrastre. Usarla
              // dejaba colgada la animación de salida y la diapositiva
              // siguiente no llegaba a montarse nunca — se veía un hueco en
              // blanco. Cargar `domMax` lo arreglaría a cambio de engordar el
              // paquete para todo el sistema por un gesto de una pantalla.
              onTouchStart={(evento) => {
                inicioX.current = evento.touches[0]?.clientX ?? null
              }}
              onTouchEnd={(evento) => {
                const inicio = inicioX.current
                const fin = evento.changedTouches[0]?.clientX
                inicioX.current = null
                if (inicio == null || fin == null) return

                // 60 píxeles: por debajo de eso, desplazar el texto con el dedo
                // cambiaría de diapositiva sin querer.
                const recorrido = fin - inicio
                if (recorrido < -60) ir(1)
                if (recorrido > 60) ir(-1)
              }}
              className="px-5 py-5"
            >
              {diapositiva.figura ? (
                <div className="bg-background mb-5 overflow-hidden rounded-xl border">
                  <div className="aspect-[320/170] w-full">
                    <Figura id={diapositiva.figura} />
                  </div>
                </div>
              ) : null}

              <p className="text-muted-foreground mb-1 text-xs font-medium tabular-nums">
                Paso {indice + 1} de {total}
              </p>

              <h3 className="text-xl leading-tight font-semibold tracking-tight">
                {diapositiva.titulo}
              </h3>

              <p className="text-muted-foreground mt-2.5 leading-relaxed">{diapositiva.cuerpo}</p>

              {diapositiva.ojo ? (
                <div className="bg-warning/10 border-warning/40 mt-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-3">
                  <Lightbulb
                    className="text-warning-foreground dark:text-warning mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
                  <p className="text-sm leading-relaxed">{diapositiva.ojo}</p>
                </div>
              ) : null}
            </m.div>
          </div>
        </div>

        <div className="bg-card flex items-center justify-between gap-3 border-t px-5 py-3.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => ir(-1)}
            disabled={indice === 0}
            aria-label="Anterior"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Button>

          {/* Los puntos también navegan: en una ayuda de seis pasos, volver al
              tercero a base de flechas es más trabajo del que merece. */}
          <div className="flex items-center gap-1.5">
            {tutorial.diapositivas.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setDireccion(i > indice ? 1 : -1)
                  setIndice(i)
                }}
                aria-label={`Ir al paso ${i + 1}`}
                aria-current={i === indice ? "step" : undefined}
                className="grid size-6 place-items-center"
              >
                <span
                  className={`block rounded-full transition-all ${
                    i === indice ? "bg-primary h-2 w-5" : "bg-muted-foreground/30 size-2"
                  }`}
                />
              </button>
            ))}
          </div>

          {esUltima ? (
            <Button size="sm" onClick={cerrar}>
              Entendido
            </Button>
          ) : (
            <Button variant="ghost" size="icon" onClick={() => ir(1)} aria-label="Siguiente">
              <ChevronRight className="size-5" aria-hidden />
            </Button>
          )}
        </div>
      </m.div>
    </m.div>
  )
}
