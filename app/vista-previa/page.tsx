"use client"

// PÁGINA DE VISTA PREVIA
//
// Enseña cómo quedan las pantallas SIN necesidad de iniciar sesión, con datos
// de ejemplo. Sirve para revisar el diseño mientras se construye.
//
// Es una maqueta: los datos son inventados y los botones no guardan nada. Las
// pantallas de verdad están en /panel y necesitan sesión.

import { useState } from "react"
import { m } from "framer-motion"
import { Banknote, Building2, Landmark, Smartphone, TrendingDown, Wallet } from "lucide-react"
import Sidebar from "@/components/dashboard/sidebar"
import BottomNav from "@/components/dashboard/bottom-nav"
import { navItemsFor } from "@/components/dashboard/navigation"
import { ROLE_LABELS, type Role } from "@/lib/roles"
import { StatCard } from "@/components/ui/stat-card"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatBs, formatMoney } from "@/lib/pricing"
import { TIPOS_GASTO } from "@/lib/expenses"
import { listItem, staggerContainer } from "@/lib/motion"

const CUENTAS = [
  { nombre: "Gaveta de la tienda", detalle: "Efectivo", saldo: 340.5, moneda: "USD", icono: Banknote },
  { nombre: "Banco de Venezuela", detalle: "Banesco ·· 4821", saldo: 128940.75, moneda: "BS", icono: Landmark },
  { nombre: "Zelle", detalle: "Bank of America", saldo: 1210, moneda: "USD", icono: Smartphone },
  { nombre: "Pago móvil BNC", detalle: "BNC ·· 1103", saldo: 45300, moneda: "BS", icono: Landmark },
]

const GASTOS = [
  {
    concepto: "Telas para la tanda de camisas",
    tipo: "variable",
    categoria: "Materia prima",
    proveedor: "Telas El Castillo",
    monto: 245,
    fecha: "28 ago",
    recurrente: null as string | null,
  },
  {
    concepto: "Alquiler del local",
    tipo: "fijo",
    categoria: "Alquiler",
    proveedor: null,
    monto: 200,
    fecha: "01 sep",
    recurrente: "Cada mes",
  },
  {
    concepto: "Pastel del cumpleaños de Yorbis",
    tipo: "discrecional",
    categoria: "Agasajos al personal",
    proveedor: "Panadería La Nueva",
    monto: 18.5,
    fecha: "30 ago",
    recurrente: null,
  },
  {
    concepto: "Estantería metálica",
    tipo: "inversion",
    categoria: "Mobiliario",
    proveedor: "Ferretería Sur",
    monto: 165,
    fecha: "26 ago",
    recurrente: null,
  },
  {
    concepto: "Sueldo del dueño",
    tipo: "retiro",
    categoria: "Sueldo del dueño",
    proveedor: null,
    monto: 300,
    fecha: "01 sep",
    recurrente: null,
  },
  {
    concepto: "Flete del pedido de telas",
    tipo: "variable",
    categoria: "Flete y transporte",
    proveedor: "Transporte Rápido",
    monto: 35,
    fecha: "28 ago",
    recurrente: null,
  },
]

const POR_TIPO: Record<string, number> = {
  fijo: 200,
  variable: 280,
  discrecional: 18.5,
  inversion: 165,
  retiro: 300,
}

const TOTAL_SALIDAS = Object.values(POR_TIPO).reduce((a, b) => a + b, 0)

export default function VistaPrevia() {
  const [role, setRole] = useState<Role>("owner")
  const [vista, setVista] = useState("cuentas")
  const navItems = navItemsFor(role)

  return (
    <div className="bg-background min-h-screen">
      <Sidebar
        items={navItems}
        roleLabel={ROLE_LABELS[role]}
        activeView={vista}
        setActiveView={setVista}
        businessName="Bodega La Esquina"
        userEmail="jesus@ejemplo.com"
        onLogout={() => {}}
      />

      <div className="flex min-h-screen flex-col lg:ml-64">
        <header className="bg-card/95 sticky top-0 z-20 border-b backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div>
              <h1 className="text-base font-semibold sm:text-lg">Bodega La Esquina</h1>
              <p className="text-muted-foreground text-xs">Vista previa con datos de ejemplo</p>
            </div>
            <div className="flex gap-1.5">
              {(["owner", "admin", "cashier"] as Role[]).map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={role === r ? "default" : "outline"}
                  onClick={() => setRole(r)}
                >
                  {ROLE_LABELS[r]}
                </Button>
              ))}
            </div>
          </div>
          <div className="bg-warning/15 text-warning-foreground dark:text-warning px-4 py-2 text-center text-xs font-medium sm:px-6">
            Maqueta con datos inventados. Las pantallas reales están en /panel y necesitan sesión.
          </div>
        </header>

        <main className="pb-nav flex-1 space-y-5 px-4 py-4 sm:px-6 sm:py-6 lg:pb-6">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={vista === "cuentas" ? "default" : "outline"}
              onClick={() => setVista("cuentas")}
            >
              Cuentas
            </Button>
            <Button
              size="sm"
              variant={vista === "gastos" ? "default" : "outline"}
              onClick={() => setVista("gastos")}
            >
              Gastos
            </Button>
          </div>

          {vista !== "gastos" ? (
            <>
              <PageHeader title="Cuentas" description="Dónde está el dinero de tu negocio, ahora mismo" />

              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
                <StatCard label="En divisas" value={formatMoney(1550.5)} icon={Banknote} />
                <StatCard label="En bolívares" value={formatBs(174240.75)} icon={Landmark} />
                <StatCard
                  label="Todo junto"
                  value={formatMoney(1769.72)}
                  hint="Bolívares convertidos a la tasa de hoy"
                  icon={Wallet}
                  className="col-span-2 lg:col-span-1"
                />
              </div>

              <m.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              >
                {CUENTAS.map((cuenta, i) => (
                  <m.div
                    key={cuenta.nombre}
                    custom={i}
                    variants={listItem}
                    className="bg-card rounded-xl border p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{cuenta.nombre}</p>
                        <p className="text-muted-foreground truncate text-xs">{cuenta.detalle}</p>
                      </div>
                      <span className="bg-primary/10 grid size-9 shrink-0 place-items-center rounded-lg">
                        <cuenta.icono className="text-primary size-4" aria-hidden />
                      </span>
                    </div>
                    <p className="mt-5 text-2xl font-semibold tabular-nums">
                      {cuenta.moneda === "USD" ? formatMoney(cuenta.saldo) : formatBs(cuenta.saldo)}
                    </p>
                  </m.div>
                ))}
              </m.div>
            </>
          ) : (
            <>
              <PageHeader title="Gastos" description="En qué se te va la plata" />

              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <StatCard
                  label="Costo de operar"
                  value={formatMoney(498.5)}
                  hint="Fijos + variables + discrecionales"
                  icon={TrendingDown}
                  className="col-span-2"
                />
                <StatCard
                  label="Inversión"
                  value={formatMoney(165)}
                  hint="No resta de la utilidad"
                  icon={Building2}
                />
                <StatCard
                  label="Retiros"
                  value={formatMoney(300)}
                  hint="Lo que sacaste para ti"
                  icon={Wallet}
                />
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Cómo se reparte</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {TIPOS_GASTO.map((tipo) => {
                      const monto = POR_TIPO[tipo.id] ?? 0
                      if (!monto) return null

                      return (
                        <li key={tipo.id}>
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tipo.chip}`}>
                                {tipo.label}
                              </span>
                              {!tipo.afectaUtilidad && (
                                <span className="text-muted-foreground text-xs">no resta utilidad</span>
                              )}
                            </span>
                            <span className="font-semibold tabular-nums">{formatMoney(monto)}</span>
                          </div>
                          <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                            <div
                              className={
                                tipo.afectaUtilidad ? "bg-primary h-full" : "bg-muted-foreground/40 h-full"
                              }
                              style={{ width: `${(monto / TOTAL_SALIDAS) * 100}%` }}
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{GASTOS.length} gastos</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-border divide-y">
                    {GASTOS.map((gasto) => {
                      const def = TIPOS_GASTO.find((t) => t.id === gasto.tipo)
                      if (!def) return null

                      return (
                        <li key={gasto.concepto} className="flex items-start justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{gasto.concepto}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${def.chip}`}>
                                {def.label}
                              </span>
                              <span className="text-muted-foreground text-xs">{gasto.categoria}</span>
                              {gasto.proveedor && (
                                <span className="text-muted-foreground text-xs">· {gasto.proveedor}</span>
                              )}
                              {gasto.recurrente && (
                                <span className="text-muted-foreground text-xs">· {gasto.recurrente}</span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-semibold tabular-nums">{formatMoney(gasto.monto)}</p>
                            <p className="text-muted-foreground text-xs">{gasto.fecha}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>

      <BottomNav items={navItems} activeView={vista} setActiveView={setVista} />
    </div>
  )
}
