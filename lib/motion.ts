// /lib/motion.ts
//
// Vocabulario de animación del sistema. Todo pasa por aquí para que las
// transiciones se sientan de la misma familia y para poder ajustar el ritmo
// entero en un solo sitio.
//
// REGLAS QUE NO SE ROMPEN (son lo que separa "animado" de "lento"):
//
//  1. Solo se animan `transform` (x, y, scale) y `opacity`. Animar `width`,
//     `height`, `top` o `left` obliga al navegador a recalcular el diseño en
//     cada fotograma; transform y opacity los resuelve la tarjeta gráfica.
//  2. Duraciones cortas: 0,15-0,3 s. Por encima de eso la interfaz se siente
//     pesada, no elegante.
//  3. El escalonado de listas se corta a los primeros elementos. Escalonar 200
//     productos haría que el último apareciera segundos más tarde.
//  4. Nada de animaciones en bucle ni en elementos que se re-renderizan a cada
//     pulsación de tecla.
//  5. Se respeta `prefers-reduced-motion` (lo aplica MotionConfig en
//     providers.tsx): quien pide menos movimiento no recibe ninguno.

import type { Transition, Variants } from "framer-motion"

/** Curva estándar: sale rápido y frena suave. */
export const EASE = [0.22, 0.61, 0.36, 1] as const

export const DURATION = {
  fast: 0.15,
  base: 0.22,
  slow: 0.32,
} as const

export const springSoft: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.8,
}

/** Entrada básica: aparece subiendo unos píxeles. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE },
  },
}

/** Igual que fadeUp pero sin desplazamiento, para bloques grandes. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE } },
}

/**
 * Contenedor que escalona a sus hijos.
 * `staggerChildren` pequeño y `delayChildren` casi nulo: se busca que la lista
 * "caiga" en cascada rápida, no un desfile.
 */
export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
}

/**
 * Retardo por posición, cortado a partir del octavo elemento.
 * A partir de ahí todos entran a la vez: nadie espera a que el elemento 57
 * termine su turno.
 */
export function stepDelay(index: number, step = 0.04, max = 8): number {
  return Math.min(index, max) * step
}

/** Elemento de lista. Se usa con `custom={index}` y `stepDelay`. */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE, delay: stepDelay(index) },
  }),
  exit: { opacity: 0, y: -6, transition: { duration: DURATION.fast, ease: EASE } },
}

/** Cambio de módulo (productos -> ventas -> reportes). */
export const viewTransition: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE } },
  exit: { opacity: 0, y: -6, transition: { duration: DURATION.fast, ease: EASE } },
}

/** Diálogos y paneles emergentes. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springSoft },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: DURATION.fast, ease: EASE } },
}

/** Realimentación al pulsar. Barata: es una sola propiedad transform. */
export const tapScale = { scale: 0.97 } as const
