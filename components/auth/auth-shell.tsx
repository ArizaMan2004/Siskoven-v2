"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { AlertTriangle, CloudOff, Landmark, Lock, Receipt } from "lucide-react"

interface AuthShellProps {
  children: ReactNode
  /** Paso actual, empezando en 1. Sin valor no se muestra el progreso. */
  step?: number
  totalSteps?: number
  /** Tiempo estimado, para que nadie empiece pensando que son diez minutos. */
  estimate?: string
}

/**
 * Marco de las pantallas de acceso y registro.
 *
 * Dos columnas: a la izquierda el argumento de venta, a la derecha el
 * formulario. La de la izquierda desaparece en móvil, donde el formulario se
 * queda solo y a pantalla completa.
 *
 * En el panel lateral van los diferenciadores reales del producto, no
 * testimonios ni logotipos de clientes: Siskoven todavía no los tiene, y en
 * una pantalla de registro es justo donde una prueba social inventada más
 * daño hace cuando el usuario descubre que no era cierta.
 */
export default function AuthShell({ children, step, totalSteps = 3, estimate }: AuthShellProps) {
  const razones = [
    { icon: AlertTriangle, text: "Te avisa si no te alcanza para reponer lo que vendiste" },
    { icon: CloudOff, text: "Sigues vendiendo sin luz y sin internet" },
    { icon: Landmark, text: "IVA e IGTF configurables, como manda la ley" },
    { icon: Receipt, text: "Cierre de caja a ciegas, con sobrantes y faltantes" },
  ]

  return (
    <div className="landing min-h-screen lg:grid lg:grid-cols-[minmax(0,440px)_1fr]">
      {/* ------------------------------------------------- panel de la marca */}
      <aside className="relative hidden overflow-hidden p-10 lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-20 h-[520px] w-[520px] opacity-60"
          style={{
            background:
              "radial-gradient(circle, rgba(30,58,115,0.85) 0%, rgba(23,169,199,0.28) 45%, transparent 72%)",
          }}
        />

        <Link href="/" className="relative flex items-center gap-2.5">
          <Image src="/logo.png" alt="" width={36} height={36} className="size-9 object-contain" aria-hidden />
          <span className="text-xl font-bold tracking-tight text-white">Siskoven</span>
        </Link>

        <div className="relative mt-16">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance">
            <span className="text-gradient-soft">Estás a un paso de dejar de cuadrar </span>
            <span className="text-gradient-brand">en un cuaderno.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Inventario, punto de venta y caja en un solo sitio. En bolívares y en divisas, con la
            tasa del día y sin descuadres.
          </p>

          <ul className="mt-10 space-y-4">
            {razones.map((razon) => (
              <li key={razon.text} className="flex items-start gap-3">
                <span className="bg-gradient-brand mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg">
                  <razon.icon className="size-4 text-white" aria-hidden />
                </span>
                <span className="text-sm leading-snug text-slate-300">{razon.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-auto pt-10">
          <p className="text-xs leading-relaxed text-slate-500">
            7 días de prueba con todo incluido. Sin tarjeta de crédito y sin compromiso: si no te
            sirve, no haces nada y la cuenta se cierra sola.
          </p>
        </div>
      </aside>

      {/* --------------------------------------------------------- formulario */}
      <main className="bg-background text-foreground flex min-h-screen flex-col">
        <div className="flex items-center gap-4 border-b px-5 py-4 sm:px-8">
          {/* En móvil no hay panel lateral, así que el logo va aquí. */}
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <Image src="/logo.png" alt="" width={28} height={28} className="size-7 object-contain" aria-hidden />
            <span className="text-primary font-bold">Siskoven</span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            {estimate ? (
              <span className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-1 text-xs font-medium">
                {estimate}
              </span>
            ) : null}
            {step ? (
              <span className="text-muted-foreground text-xs font-medium">
                Paso {step} de {totalSteps}
              </span>
            ) : null}
          </div>
        </div>

        {/* Barra de progreso. Solo aparece durante el registro. */}
        {step ? (
          <div className="flex gap-1 px-5 sm:px-8">
            {Array.from({ length: totalSteps }).map((_, index) => (
              <span
                key={index}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  index < step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        ) : null}

        <div className="flex flex-1 items-start justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </div>

        <div className="text-muted-foreground flex items-center justify-center gap-1.5 border-t px-5 py-4 text-xs">
          <Lock className="size-3.5" aria-hidden />
          Tus datos son tuyos. Cada negocio solo ve lo suyo.
        </div>
      </main>
    </div>
  )
}
