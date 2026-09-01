"use client"

import { LazyMotion, MotionConfig, domAnimation } from "framer-motion"
import { AuthProvider } from "@/lib/auth-context"
import { ThemeProviderWrapper } from "@/components/theme-provider"
import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleReCaptchaProvider
      reCaptchaKey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? ""}
      scriptProps={{
        async: true,
        defer: true,
        appendTo: "head",
      }}
    >
      {/*
        LazyMotion + domAnimation carga solo el motor de animación que usamos
        (transform y opacidad), no el paquete completo de framer-motion. Son
        unos 20 kB menos de JavaScript en cada carga, que en un teléfono con
        datos móviles se nota.

        Por eso las vistas usan `m.div` y no `motion.div`: `motion` arrastra
        todas las funciones aunque no se usen y anularía el ahorro. `strict`
        hace que usar `motion.div` por descuido falle en desarrollo.

        reducedMotion="user" desactiva el movimiento para quien lo haya pedido
        en la configuración de su sistema.
      */}
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <AuthProvider>
            <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
          </AuthProvider>
        </MotionConfig>
      </LazyMotion>
    </GoogleReCaptchaProvider>
  )
}
