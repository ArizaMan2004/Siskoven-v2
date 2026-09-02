"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { AnimatePresence, m } from "framer-motion"
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Menu,
  Monitor,
  Quote,
  Smartphone,
  Sparkles,
  Tablet,
  X,
} from "lucide-react"
import { PLANS } from "@/lib/subscriptions"
import { DIFFERENTIATORS, FAQS, INDUSTRIES, MODULES, PAINS } from "./landing-data"
import { fadeUp, listItem, staggerContainer } from "@/lib/motion"

const NAV = [
  { href: "#modulos", label: "Funcionalidades" },
  { href: "#diferencia", label: "Qué nos separa" },
  { href: "#dispositivos", label: "Dispositivos" },
  { href: "#precios", label: "Precios" },
  { href: "#faq", label: "Preguntas" },
]

/** Botón principal. Todos los de la página llevan al registro. */
function CtaButton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <Link
      href="/entrar?registro=1"
      className={`bg-gradient-brand shadow-glow group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-95 ${className}`}
    >
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

/** Banda de llamada a la acción que se repite entre secciones. */
function CtaBanner({ eyebrow, title, highlight, detail }: {
  eyebrow: string
  title: string
  highlight: string
  detail: string
}) {
  return (
    <section className="relative z-10 mx-auto w-full max-w-6xl px-6 py-12 md:py-16">
      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 p-8 shadow-glow md:p-12"
        style={{
          background:
            "linear-gradient(135deg, rgba(30,58,115,0.55) 0%, rgba(23,169,199,0.18) 55%, rgba(7,12,24,0.6) 100%)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-20 size-72 opacity-60"
          style={{
            background:
              "radial-gradient(circle, rgba(23,169,199,0.55) 0%, rgba(23,169,199,0.15) 45%, transparent 70%)",
          }}
        />
        <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-medium text-slate-300 backdrop-blur-sm">
              <Sparkles className="size-3.5 text-[color:var(--landing-aqua)]" aria-hidden />
              {eyebrow}
            </span>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-balance md:text-4xl">
              <span className="text-gradient-soft">{title} </span>
              <span className="text-gradient-brand">{highlight}</span>
            </h3>
            <p className="mt-3 text-sm text-slate-400 md:text-base">{detail}</p>
          </div>
          <CtaButton className="shrink-0">Empieza gratis</CtaButton>
        </div>
      </div>
    </section>
  )
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeModule, setActiveModule] = useState(MODULES[0].id)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [device, setDevice] = useState<"pc" | "tablet" | "movil">("pc")

  const modulo = MODULES.find((item) => item.id === activeModule) ?? MODULES[0]

  return (
    <div className="landing relative min-h-screen overflow-x-hidden">
      {/* Resplandor y retícula del fondo */}
      {/*
        Resplandor del fondo SIN `blur-3xl`.

        Un filtro de desenfoque sobre un elemento de 1100x700 obliga al
        navegador a rasterizar y desenfocar esa superficie en cada fotograma.
        En el escritorio ni se nota; en el Android de gama baja que hay en un
        mostrador, la página se arrastra. Un degradado radial con paradas
        suaves da el mismo aspecto y no cuesta nada: el degradado YA es difuso,
        no hace falta desenfocarlo.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-20%] left-1/2 h-[700px] w-[1100px] -translate-x-1/2 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(30,58,115,0.9) 0%, rgba(23,169,199,0.35) 35%, rgba(23,169,199,0.12) 55%, transparent 72%)",
        }}
      />
      {/*
        Altura acotada a propósito. Con `inset-0` esta retícula medía los 8.700
        píxeles del documento entero, y una capa de ese tamaño con `mask-image`
        hace que el compositor de Chrome abandone y deje la página SIN PINTAR:
        el contenido estaba ahí, con su fondo oscuro, pero salía todo en blanco.
        Además solo tiene sentido detrás del héroe, que es donde se ve.
      */}
      <div aria-hidden className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[900px] opacity-70" />

      {/* ------------------------------------------------------------ cabecera */}
      <header className="fixed top-0 z-50 w-full border-b border-white/5 bg-[color:var(--landing-ink)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="#hero" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={32} height={32} className="size-8 object-contain" aria-hidden />
            <span className="text-lg font-bold tracking-tight text-white">Siskoven</span>
          </a>

          <nav className="hidden items-center gap-6 text-sm text-slate-400 lg:flex">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="transition hover:text-white">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/entrar"
              className="hidden text-sm font-medium text-slate-300 transition hover:text-white sm:block"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/entrar?registro=1"
              className="text-ink inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-[color:var(--landing-ink)] transition hover:bg-white/90"
            >
              Empieza gratis
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white transition hover:bg-white/[0.08] lg:hidden"
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <m.nav
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-white/5 lg:hidden"
            >
              <ul className="space-y-1 px-6 py-4">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
                <li>
                  <Link
                    href="/entrar"
                    className="block rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                  >
                    Iniciar sesión
                  </Link>
                </li>
              </ul>
            </m.nav>
          )}
        </AnimatePresence>
      </header>

      {/* ---------------------------------------------------------------- héroe */}
      <section
        id="hero"
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-28 pb-24 text-center md:pt-36"
      >
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-4 py-1.5 text-xs text-white backdrop-blur-md sm:text-sm">
          <span
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ background: "#35c6dc", boxShadow: "0 0 8px 1px rgba(53,198,220,.8)" }}
          />
          Hecho en Venezuela, para el comercio venezolano
        </div>

        <h1 className="max-w-5xl text-5xl leading-[1.02] font-semibold tracking-tight text-balance md:text-7xl">
          <span className="text-gradient-soft">Controla tu negocio </span>
          <span className="text-gradient-brand">en bolívares y en divisas</span>
          <span className="text-gradient-soft">, sin descuadres</span>
        </h1>

        <p className="mt-8 max-w-2xl text-base text-balance text-slate-400 md:text-lg">
          Inventario, punto de venta y cierre de caja en un solo sitio. Con las tasas del día, tus
          impuestos como manda la ley, y funcionando aunque se vaya la luz.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <CtaButton>Empieza gratis, 7 días</CtaButton>
          <a
            href="#modulos"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
          >
            Ver qué incluye
          </a>
        </div>

        <p className="mt-6 text-xs text-slate-500">Sin tarjeta de crédito · Listo en 5 minutos</p>
      </section>

      {/* ------------------------------------------------------------- problemas */}
      <section className="relative z-10 mx-auto w-full max-w-7xl px-6 py-16 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-[color:var(--landing-navy)]/40 px-4 py-1.5 text-xs font-semibold tracking-[0.18em] text-[color:var(--landing-aqua)] uppercase">
            ¿Te suena?
          </span>
          <h2 className="mt-6 text-4xl leading-[1.05] font-semibold tracking-tight text-balance md:text-6xl">
            <span className="text-gradient-soft">No es que lleves mal el negocio. </span>
            <span className="text-gradient-brand">Es que aquí llevar cuentas es más difícil.</span>
          </h2>
        </div>

        <m.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {PAINS.map((pain, index) => (
            <m.div
              key={pain.quote}
              custom={index}
              variants={listItem}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm transition hover:border-white/20 hover:bg-white/[0.05]"
            >
              <div className="grid size-11 place-items-center rounded-full bg-[color:var(--landing-navy)]/50 ring-1 ring-[color:var(--landing-aqua)]/20 ring-inset">
                <pain.icon className="size-5 text-[color:var(--landing-aqua)]" aria-hidden />
              </div>
              <p className="mt-6 text-base leading-snug font-semibold text-white">“{pain.quote}”</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{pain.detail}</p>
            </m.div>
          ))}
        </m.div>
      </section>

      {/* --------------------------------------------------------------- módulos */}
      <section id="modulos" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-12 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-medium tracking-[0.2em] text-[color:var(--landing-aqua)] uppercase">
            Todo incluido
          </p>
          <h2 className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            <span className="text-gradient-soft">Todo lo que necesitas </span>
            <span className="text-gradient-brand">para llevar tu negocio.</span>
          </h2>
          <p className="mt-6 text-base text-balance text-slate-400 md:text-lg">
            Un solo plan. Sin funciones bloqueadas y sin cobro por usuario.
          </p>
        </div>

        <div className="relative mt-16 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm md:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 -left-32 size-96 opacity-50"
            style={{
              background: "radial-gradient(circle, rgba(30,58,115,0.7) 0%, transparent 70%)",
            }}
          />
          <div className="relative grid gap-10 lg:grid-cols-[300px_1fr] lg:gap-12">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-col lg:gap-1.5">
              {MODULES.map((item) => {
                const activo = item.id === activeModule
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveModule(item.id)}
                      aria-pressed={activo}
                      className={`group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                        activo
                          ? "border-white/20 bg-white/10 text-white shadow-glow"
                          : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-lg transition ${
                          activo ? "bg-gradient-brand text-white" : "bg-white/5 text-slate-400"
                        }`}
                      >
                        <item.icon className="size-4" aria-hidden />
                      </span>
                      <span className="leading-tight">{item.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {/* Remonte por `key`. Ver la nota de lib/motion.ts: con
                AnimatePresence en modo "wait", este carrusel no pasaba de la
                primera diapositiva. */}
            <div key={modulo.id}>
              <m.div variants={fadeUp} initial="hidden" animate="visible">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
                  <modulo.icon className="size-3.5 text-[color:var(--landing-aqua)]" aria-hidden />
                  Módulo · {modulo.label}
                </div>
                <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  <span className="text-gradient-soft">{modulo.headline}</span>
                </h3>
                <p className="mt-3 text-sm text-slate-400 md:text-base">{modulo.detail}</p>

                <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                  {modulo.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-sm text-slate-300">
                      <span className="bg-gradient-brand mt-0.5 grid size-5 shrink-0 place-items-center rounded-full">
                        <Check className="size-3 text-white" strokeWidth={3.5} aria-hidden />
                      </span>
                      <span className="leading-snug">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </m.div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ diferencia */}
      <section id="diferencia" className="relative z-10 mx-auto w-full max-w-6xl px-6 py-20 md:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 h-[420px] w-[760px] -translate-x-1/2 -translate-y-1/2 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(23,169,199,0.35) 0%, rgba(30,58,115,0.35) 55%, transparent 78%)",
          }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-slate-300 backdrop-blur-sm">
            <Sparkles className="size-3.5 text-[color:var(--landing-aqua)]" aria-hidden />
            Lo que no vas a encontrar en otro sistema
          </span>
          <h2 className="mt-6 text-4xl leading-[1.05] font-semibold tracking-tight text-balance md:text-5xl">
            <span className="text-gradient-soft">Cuatro cosas que hacemos </span>
            <span className="text-gradient-brand">porque aquí hacen falta</span>
          </h2>
        </div>

        <m.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="relative mt-14 grid gap-5 md:grid-cols-2"
        >
          {DIFFERENTIATORS.map((item, index) => (
            <m.article
              key={item.title}
              custom={index}
              variants={listItem}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-sm transition hover:border-[color:var(--landing-aqua)]/30"
            >
              <div className="bg-gradient-brand grid size-11 place-items-center rounded-xl">
                <item.icon className="size-5 text-white" aria-hidden />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.detail}</p>
            </m.article>
          ))}
        </m.div>
      </section>

      <CtaBanner
        eyebrow="Pruébalo completo"
        title="Todo lo de arriba,"
        highlight="gratis por 7 días."
        detail="Sin tarjeta de crédito. Si no te sirve, no haces nada y la cuenta se cierra sola."
      />

      {/* ------------------------------------------------------------ industrias */}
      <section
        id="industrias"
        className="relative z-10 w-full overflow-hidden px-6 py-20 md:py-28"
        style={{ background: "linear-gradient(135deg, #f6f8fb 0%, #e2f6fa 50%, #eef2f8 100%)" }}
      >
        <div className="relative mx-auto max-w-6xl">
          <div className="grid items-end gap-6 md:grid-cols-12">
            <div className="md:col-span-7">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-900/10 bg-white/70 px-3.5 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm">
                <Sparkles className="size-3 text-[color:#17a9c7]" aria-hidden />
                Industrias
              </span>
              <h2 className="mt-4 text-3xl leading-[1.1] font-semibold tracking-tight text-balance text-slate-900 md:text-4xl">
                Hecho para los negocios que mueven{" "}
                <span
                  style={{
                    backgroundImage: "linear-gradient(135deg, #1e3a73 0%, #17a9c7 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  Venezuela
                </span>
                .
              </h2>
            </div>
            <div className="md:col-span-5">
              <p className="text-xs leading-relaxed text-slate-600 md:text-sm">
                Si vendes algo y lo cobras, Siskoven te sirve. Estos son los rubros donde ya está
                afinado.
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-12">
            {INDUSTRIES.map((industry) => (
              <article
                key={industry.name}
                className={`col-span-1 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-sm transition hover:shadow-md ${industry.span}`}
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-[color:#1e3a73] text-white shadow">
                  <industry.icon className="size-4" aria-hidden />
                </span>
                <h3 className="mt-4 text-sm leading-tight font-semibold text-slate-900 md:text-base">
                  {industry.name}
                </h3>
                <p className="mt-1 text-[11px] leading-snug text-slate-600 md:text-xs">
                  {industry.detail}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- dispositivos */}
      <section id="dispositivos" className="relative z-10 mx-auto w-full max-w-6xl px-6 py-20 md:py-28">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-slate-300 backdrop-blur-sm">
            <Monitor className="size-3.5 text-[color:var(--landing-aqua)]" aria-hidden />
            Multiplataforma
          </span>
          <h2 className="mt-4 text-3xl leading-[1.1] font-semibold tracking-tight text-balance md:text-5xl">
            <span className="text-gradient-soft">Desde el mostrador </span>
            <span className="text-gradient-brand">o desde tu casa</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-balance text-slate-400 md:text-base">
            Funciona en el navegador: no hay que instalar nada. En el teléfono, la barra de abajo se
            maneja con el pulgar, sin abrir menús.
          </p>
        </div>

        <div className="mt-10 flex justify-center gap-2">
          {([
            { id: "pc", label: "Computadora", icon: Monitor },
            { id: "tablet", label: "Tablet", icon: Tablet },
            { id: "movil", label: "Teléfono", icon: Smartphone },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDevice(item.id)}
              aria-pressed={device === item.id}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition ${
                device === item.id
                  ? "bg-gradient-brand text-white shadow-glow"
                  : "border border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
              }`}
            >
              <item.icon className="size-3.5" aria-hidden />
              {item.label}
            </button>
          ))}
        </div>

        {/* Marco del dispositivo. Las capturas reales se colocan cuando la
            demostración esté montada; hasta entonces, no se enseña una pantalla
            inventada como si fuera el producto. */}
        <div className="mt-12 flex justify-center">
          <div
            className={`overflow-hidden border border-white/10 bg-white/[0.03] backdrop-blur-sm transition-all ${
              device === "movil"
                ? "w-[280px] rounded-[28px] p-2"
                : device === "tablet"
                  ? "w-full max-w-[520px] rounded-2xl p-2"
                  : "w-full max-w-[860px] rounded-2xl"
            }`}
          >
            {device === "pc" && (
              <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-rose-500/70" />
                <span className="size-2.5 rounded-full bg-amber-500/70" />
                <span className="size-2.5 rounded-full bg-emerald-500/70" />
              </div>
            )}
            <div
              className={`grid place-items-center bg-[color:var(--landing-ink)]/60 ${
                device === "movil" ? "aspect-[9/19] rounded-[22px]" : "aspect-[16/10]"
              }`}
            >
              <p className="px-6 text-center text-xs text-slate-500">
                Captura de {device === "pc" ? "escritorio" : device === "tablet" ? "tablet" : "teléfono"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- testimonios */}
      <section id="testimonios" className="relative z-10 w-full px-6 py-20 md:py-24">
        <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1 text-xs font-medium text-slate-300 backdrop-blur-sm">
            <Quote className="size-3" aria-hidden />
            Testimonios
          </span>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            <span className="text-gradient-soft">Aquí irán los primeros</span>
          </h2>

          {/*
            Sección deliberadamente vacía. Siskoven acaba de salir y no tiene
            clientes todavía: inventar reseñas de negocios que no existen es la
            forma más rápida de perder la confianza de quien sí va a probarlo.
          */}
          <div className="mt-10 max-w-2xl rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8">
            <Clock className="mx-auto size-6 text-slate-500" aria-hidden />
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Siskoven acaba de empezar, así que todavía no hay testimonios que enseñar. Preferimos
              dejar este espacio vacío antes que llenarlo con reseñas inventadas.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Si pruebas el sistema y te sirve, cuéntanoslo: tu negocio puede ser el primero que
              aparezca aquí, con su nombre y de verdad.
            </p>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- precios */}
      <section id="precios" className="relative z-10 mx-auto w-full max-w-4xl px-4 py-16 md:py-24">
        <div className="text-center">
          <h2 className="text-3xl leading-[1.1] font-semibold tracking-tight text-balance md:text-5xl">
            <span className="text-gradient-soft">Un solo plan. </span>
            <span className="text-gradient-brand">Eliges cada cuánto pagas.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-balance text-slate-400 md:text-base">
            Todo incluido en los tres. Cuanto menos seguido pagas, menos te cuesta.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {(["mensual", "trimestral", "anual"] as const).map((id) => {
            const plan = PLANS[id]
            const destacado = id === "trimestral"

            return (
              <div
                key={id}
                className={`relative rounded-3xl bg-white p-6 text-left ${destacado ? "shadow-glow ring-2 ring-[color:var(--landing-cyan)]" : "ring-1 ring-slate-200"}`}
              >
                {destacado && (
                  <span className="bg-gradient-brand absolute -top-3 left-6 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white">
                    El más elegido
                  </span>
                )}

                <p className="text-sm font-bold tracking-wide text-slate-900 uppercase">{plan.label}</p>

                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-slate-900">${plan.price}</span>
                  {id !== "mensual" && (
                    <span className="text-sm text-slate-500">· ${plan.perMonth}/mes</span>
                  )}
                </div>

                <p className="mt-2 text-sm font-medium text-slate-600">{plan.description}</p>

                <Link
                  href="/entrar?registro=1"
                  className={`mt-5 inline-flex w-full items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                    destacado
                      ? "bg-gradient-brand text-white hover:opacity-95"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                >
                  Empezar
                </Link>
              </div>
            )
          })}
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-sm font-semibold text-white">Incluido en cualquiera de los tres</p>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              "Usuarios ilimitados, con roles",
              "Dólar y euro, oficial y paralelo",
              "IVA e IGTF configurables",
              "Cierre de caja por turno",
              "Funciona sin conexión",
              "Recibos para impresora térmica",
              "Numeración correlativa de documentos",
              "Alerta de descapitalización",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="bg-gradient-brand mt-0.5 grid size-5 shrink-0 place-items-center rounded-full">
                  <Check className="size-3 text-white" strokeWidth={3.5} aria-hidden />
                </span>
                <span className="leading-snug">{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-white/10 pt-4 text-xs text-slate-500">
            Los precios no incluyen IVA. Se paga por Zelle, Binance, pago móvil o transferencia.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------- faq */}
      <section
        id="faq"
        className="relative z-10 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #eef2f8 0%, #e2f6fa 55%, #f6f8fb 100%)" }}
      >
        <div className="relative mx-auto w-full max-w-5xl px-6 py-20 md:py-28">
          <div className="text-center">
            <h2 className="text-3xl leading-[1.1] font-semibold tracking-tight text-balance text-slate-900 md:text-5xl">
              ¿Tienes dudas?{" "}
              <span
                style={{
                  backgroundImage: "linear-gradient(135deg, #1e3a73 0%, #17a9c7 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Aquí van las comunes.
              </span>
            </h2>
          </div>

          <div className="mt-10 space-y-3">
            {FAQS.map((faq, index) => {
              const abierto = openFaq === index
              return (
                <article
                  key={faq.question}
                  className={`overflow-hidden rounded-2xl border transition-all ${
                    abierto
                      ? "border-transparent bg-white shadow-lg ring-1 ring-[color:#17a9c7]/30"
                      : "border-slate-900/8 bg-white/70 hover:bg-white/90"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(abierto ? null : index)}
                    aria-expanded={abierto}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left md:px-6 md:py-5"
                  >
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-xl transition ${
                        abierto ? "bg-gradient-brand text-white" : "bg-slate-900/[0.04] text-[color:#1e3a73]"
                      }`}
                    >
                      <faq.icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold tracking-wider text-[color:#17a9c7] uppercase">
                        {faq.category}
                      </p>
                      <h3 className="mt-0.5 text-sm font-semibold text-slate-900 md:text-base">
                        {faq.question}
                      </h3>
                    </div>
                    <ChevronDown
                      className={`size-5 shrink-0 text-slate-400 transition-transform duration-300 ${abierto ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>

                  <div
                    className={`grid transition-all duration-300 ease-out ${abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                  >
                    <div className="overflow-hidden">
                      <div className="border-t border-slate-900/8 px-5 pt-4 pb-5 pl-[4.5rem] text-sm leading-relaxed text-slate-600 md:px-6 md:pl-[5.25rem]">
                        {faq.answer}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <CtaBanner
        eyebrow="Listo para empezar"
        title="Deja de cuadrar en un cuaderno."
        highlight="Empieza hoy."
        detail="Listo en 5 minutos. Sin contratos, sin tarjeta de crédito."
      />

      {/* ---------------------------------------------------------------- pie */}
      <footer className="relative z-10 border-t border-white/5 bg-[color:var(--landing-ink)]/60 py-16 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <Image src="/logo.png" alt="" width={32} height={32} className="size-8 object-contain" aria-hidden />
                <span className="text-lg font-bold text-white">Siskoven</span>
              </div>
              <p className="max-w-xs text-xs leading-relaxed text-slate-500">
                Inventario, punto de venta y caja para el comercio venezolano. En bolívares y en
                divisas, con o sin internet.
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-wider text-white uppercase">Producto</h3>
              <ul className="mt-4 space-y-2.5 text-xs text-slate-500">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className="transition hover:text-white">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold tracking-wider text-white uppercase">Cuenta</h3>
              <ul className="mt-4 space-y-2.5 text-xs text-slate-500">
                <li>
                  <Link href="/entrar" className="transition hover:text-white">
                    Iniciar sesión
                  </Link>
                </li>
                <li>
                  <Link href="/entrar?registro=1" className="transition hover:text-white">
                    Crear cuenta
                  </Link>
                </li>
                <li className="text-[10px] text-slate-600">Venezuela</li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 text-[11px] text-slate-500 sm:flex-row">
            <p>© {new Date().getFullYear()} Siskoven. Todos los derechos reservados.</p>
            <p>Hecho en Venezuela</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
