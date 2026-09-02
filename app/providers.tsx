"use client"

import { LazyMotion, MotionConfig, domAnimation } from "framer-motion"
import { AuthProvider } from "@/lib/auth-context"
import { ThemeProviderWrapper } from "@/components/theme-provider"

/**
 * Los proveedores que envuelven a toda la aplicación.
 *
 * LazyMotion + domAnimation carga solo el motor de animación que se usa
 * (transform y opacidad), no el paquete completo de framer-motion. Son unos
 * 20 kB menos de JavaScript en cada carga, que en un teléfono con datos
 * móviles se nota.
 *
 * Por eso las vistas usan `m.div` y no `motion.div`: `motion` arrastra todas
 * las funciones aunque no se usen y anularía el ahorro. `strict` hace que usar
 * `motion.div` por descuido falle en desarrollo.
 *
 * `reducedMotion="user"` desactiva el movimiento para quien lo haya pedido en
 * la configuración de su sistema.
 *
 * Aquí vivía también el proveedor de reCAPTCHA. Se quitó: lo que de verdad
 * frena a un bot en el registro no es un rompecabezas en el formulario sino
 * que la cuenta no toca ni un dato hasta verificar el correo, y eso lo exige
 * la primera comprobación de firestore.rules.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
        </AuthProvider>
      </MotionConfig>
    </LazyMotion>
  )
}
