"use client"

// PÁGINA DE VISTA PREVIA
//
// Enseña cómo queda el sistema SIN necesidad de iniciar sesión, con datos de
// ejemplo. Sirve para revisar el diseño mientras se construye y para poder
// enseñárselo a alguien sin darle una cuenta.
//
// Es una maqueta: los datos son inventados y los botones no guardan nada. Las
// pantallas de verdad están en /panel.
//
// El selector de rol de arriba NO existe en el sistema real. Aquí está para
// poder ver, sin tres cuentas distintas, qué le aparece a cada quien: en /panel
// los permisos salen del documento del usuario y nadie puede cambiárselos desde
// la interfaz.

import { useState } from "react"
import { m } from "framer-motion"
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Building2,
  CircleDollarSign,
  Crown,
  Eye,
  HandCoins,
  Landmark,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  TrendingDown,
  UserRound,
  Users,
  Wallet,
} from "lucide-react"
import Sidebar from "@/components/dashboard/sidebar"
import BottomNav from "@/components/dashboard/bottom-nav"
import HelpButton from "@/components/dashboard/help-button"
import { navGroupsFor, navItemsFor, navSplitMovil } from "@/components/dashboard/navigation"
import {
  PERMISOS_POR_ROL,
  type Permission,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type Role,
  can,
} from "@/lib/roles"
import { StatCard } from "@/components/ui/stat-card"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatBs, formatMoney } from "@/lib/pricing"
import { TIPOS_GASTO } from "@/lib/expenses"
import { fadeUp, listItem, staggerContainer, viewTransition } from "@/lib/motion"

const CUENTAS = [
  { nombre: "Gaveta de la tienda", detalle: "Efectivo", saldo: 340.5, moneda: "USD", icono: Banknote },
  { nombre: "Banco de Venezuela", detalle: "Banesco ·· 4821", saldo: 128940.75, moneda: "BS", icono: Landmark },
  { nombre: "Zelle", detalle: "Bank of America", saldo: 1210, moneda: "USD", icono: Smartphone },
  { nombre: "Pago móvil BNC", detalle: "BNC ·· 1103", saldo: 45300, moneda: "BS", icono: Landmark },
]

const GASTOS = [
  { concepto: "Telas para la tanda de camisas", tipo: "variable", categoria: "Materia prima", proveedor: "Telas El Castillo", monto: 245, fecha: "28 ago", recurrente: null as string | null },
  { concepto: "Alquiler del local", tipo: "fijo", categoria: "Alquiler", proveedor: null, monto: 200, fecha: "01 sep", recurrente: "Cada mes" },
  { concepto: "Pastel del cumpleaños de Yorbis", tipo: "discrecional", categoria: "Agasajos al personal", proveedor: "Panadería La Nueva", monto: 18.5, fecha: "30 ago", recurrente: null },
  { concepto: "Estantería metálica", tipo: "inversion", categoria: "Mobiliario", proveedor: "Ferretería Sur", monto: 165, fecha: "26 ago", recurrente: null },
  { concepto: "Sueldo del dueño", tipo: "retiro", categoria: "Sueldo del dueño", proveedor: null, monto: 300, fecha: "01 sep", recurrente: null },
  { concepto: "Flete del pedido de telas", tipo: "variable", categoria: "Flete y transporte", proveedor: "Transporte Rápido", monto: 35, fecha: "28 ago", recurrente: null },
]

const POR_TIPO: Record<string, number> = {
  fijo: 200,
  variable: 280,
  discrecional: 18.5,
  inversion: 165,
  retiro: 300,
}

const TOTAL_SALIDAS = Object.values(POR_TIPO).reduce((a, b) => a + b, 0)

const CLIENTES = [
  { nombre: "Yorbis Rodríguez", documento: "V-18456321", telefono: "0414-1234567", debe: 86.5, atraso: 12 },
  { nombre: "Bodegón La Trinidad", documento: "J-40123456-7", telefono: "0212-5551020", debe: 240, atraso: 3 },
  { nombre: "Carmen Villalba", documento: "V-9876543", telefono: "0424-7654321", debe: 0, atraso: null as number | null },
  { nombre: "Taller Hermanos Pérez", documento: "J-31998877-1", telefono: "0416-3344556", debe: 55, atraso: -4 },
]

const ROLES_EJEMPLO = [
  { nombre: "Encargado de turno", descripcion: "Toda la operación menos el plan", permisos: 21, miembros: 2 },
  { nombre: "Cajero de tarde", descripcion: "Vende y cierra su caja", permisos: 7, miembros: 3 },
  { nombre: "Depósito", descripcion: "Recibe mercancía, no factura", permisos: 5, miembros: 1 },
]

const EQUIPO = [
  { nombre: "Jesús Ariza", rol: "Dueño", dueño: true, activo: true },
  { nombre: "María Contreras", rol: "Encargado de turno", dueño: false, activo: true },
  { nombre: "Yorbis Rodríguez", rol: "Cajero de tarde", dueño: false, activo: true },
  { nombre: "Luis Mendoza", rol: "Depósito", dueño: false, activo: false },
]

type Vista = "inicio" | "cuentas" | "gastos" | "clientes" | "equipo"

/**
 * Las maquetas disponibles, cada una con el permiso que la abre.
 *
 * Se filtran igual que el menú de verdad: ofrecerle "Cuentas" a un cajero en la
 * demostración daría a entender que puede verlas, que es justo lo contrario de
 * lo que este selector quiere enseñar.
 */
const VISTAS: Array<{ id: Vista; label: string; requiere?: Permission }> = [
  { id: "inicio", label: "Inicio" },
  { id: "cuentas", label: "Cuentas", requiere: "accounts.view" },
  { id: "gastos", label: "Gastos", requiere: "expenses.view" },
  { id: "clientes", label: "Clientes", requiere: "customers.view" },
  { id: "equipo", label: "Equipo", requiere: "users.manage" },
]

export default function VistaPrevia() {
  const [role, setRole] = useState<Role>("owner")
  const [vista, setVista] = useState<Vista>("inicio")

  // La maqueta pide el menú "como lo vería un cajero" pasando la plantilla del
  // rol, que es exactamente lo que `navItemsFor` acepta además de la lista real.
  const permisos = PERMISOS_POR_ROL[role]
  const grupos = navGroupsFor(permisos)
  const navItems = navItemsFor(permisos)
  const { fijos, extra } = navSplitMovil(permisos)

  const vistasVisibles = VISTAS.filter((v) => !v.requiere || can(permisos, v.requiere))

  // Si el rol elegido no llega a la maqueta abierta, se cae a Inicio: dejar la
  // pantalla en blanco al cambiar de rol parecería un fallo, no una restricción.
  const vistaActual = vistasVisibles.some((v) => v.id === vista) ? vista : "inicio"

  return (
    <div className="bg-background min-h-screen">
      <Sidebar
        grupos={grupos}
        roleLabel={ROLE_LABELS[role]}
        activeView={vistaActual}
        setActiveView={(id) => setVista(id as Vista)}
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

            {/* La ayuda es la de verdad, no una maqueta: son los mismos
                tutoriales que se abren dentro del sistema. La maqueta llama
                "inicio" a lo que el sistema llama "home". */}
            <HelpButton vista={vistaActual === "inicio" ? "home" : vistaActual} />
          </div>

          {/* El selector de rol, con su explicación.
              Antes eran tres botones sueltos con la misma pinta que cualquier
              otro control de la cabecera: nadie podía adivinar que servían para
              cambiar de punto de vista, ni que no formaban parte del sistema. */}
          <div className="bg-muted/50 border-t px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Eye className="size-4 shrink-0" aria-hidden />
                <span>
                  Estás viendo el sistema <strong className="text-foreground">como si fueras…</strong>
                </span>
              </p>

              <div className="flex flex-wrap gap-1.5">
                {(["owner", "admin", "cashier"] as Role[]).map((opcion) => (
                  <Button
                    key={opcion}
                    size="sm"
                    variant={role === opcion ? "default" : "outline"}
                    onClick={() => setRole(opcion)}
                    className="gap-1.5"
                  >
                    {opcion === "owner" && <Crown className="size-3.5" aria-hidden />}
                    {ROLE_LABELS[opcion]}
                  </Button>
                ))}
              </div>
            </div>

            <p className="text-muted-foreground mt-2 text-xs">
              {ROLE_DESCRIPTIONS[role]} · Ve {navItems.length} de 12 módulos. En el sistema real
              este selector no existe: los permisos los reparte el dueño desde Equipo.
            </p>
          </div>

          <div className="bg-warning/15 text-warning-foreground dark:text-warning px-4 py-2 text-center text-xs font-medium sm:px-6">
            Maqueta con datos inventados. Las pantallas reales están en /panel y necesitan sesión.
          </div>
        </header>

        <main className="pb-nav flex-1 space-y-5 px-4 py-4 sm:px-6 sm:py-6 lg:pb-6">
          <div className="flex flex-wrap gap-2">
            {vistasVisibles.map((opcion) => (
              <Button
                key={opcion.id}
                size="sm"
                variant={vistaActual === opcion.id ? "default" : "outline"}
                onClick={() => setVista(opcion.id)}
              >
                {opcion.label}
              </Button>
            ))}
          </div>

          {/* Se cambia de maqueta con el MISMO mecanismo que usa el panel de
              verdad, y no con un condicional suelto. Así, si ese mecanismo se
              rompiera, se rompería aquí —donde se ve sin necesidad de una
              cuenta— y no dentro del sistema.
              Fue justo lo que pasó: con esto puesto se descubrió que el panel
              se quedaba clavado en el primer módulo. Ver lib/motion.ts. */}
          <div key={vistaActual}>
            <m.div
              variants={viewTransition}
              initial="hidden"
              animate="visible"
              className="space-y-5"
            >
              {vistaActual === "inicio" && <MaquetaInicio role={role} />}
              {vistaActual === "cuentas" && <MaquetaCuentas />}
              {vistaActual === "gastos" && <MaquetaGastos />}
              {vistaActual === "clientes" && <MaquetaClientes />}
              {vistaActual === "equipo" && <MaquetaEquipo />}
            </m.div>
          </div>
        </main>
      </div>

      <BottomNav
        fijos={fijos}
        extra={extra}
        activeView={vistaActual}
        setActiveView={(id) => setVista(id as Vista)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

function MaquetaInicio({ role }: { role: Role }) {
  const esCajero = role === "cashier"

  return (
    <>
      <m.div variants={fadeUp} initial="hidden" animate="visible">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Buenas tardes, Bodega</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">martes, 2 de septiembre</p>
      </m.div>

      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="flex items-start gap-3">
            <Wallet className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Tu caja está abierta</p>
              <p className="text-muted-foreground text-sm">
                Desde las 08:15. Al cerrar cuentas lo que hay y se compara con lo que debería haber.
              </p>
            </div>
          </div>
          <Button variant="outline" className="shrink-0 gap-2">
            Ver la caja
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label={esCajero ? "Vendiste hoy" : "Vendido hoy"}
          value={formatMoney(486.2)}
          hint={formatBs(486.2 * 112.4)}
          icon={CircleDollarSign}
        />
        <StatCard label="Ventas de hoy" value="23" hint={`${formatMoney(21.14)} por venta`} icon={ShoppingCart} />
        {!esCajero && (
          <>
            <StatCard label="Te deben" value={formatMoney(381.5)} hint={`${formatMoney(326.5)} ya vencido`} icon={HandCoins} />
            <StatCard label="Gastado este mes" value={formatMoney(498.5)} hint="Sin contar inversión ni retiros" icon={Receipt} />
          </>
        )}
      </div>

      <Card className="border-warning/40">
        <CardContent className="pt-6">
          <p className="mb-3 flex items-center gap-2 font-semibold">
            <AlertTriangle className="text-warning-foreground dark:text-warning size-4" aria-hidden />
            Cosas que atender
          </p>
          <ul className="space-y-2">
            {[
              !esCajero ? `${formatMoney(326.5)} en deudas que ya pasaron de su fecha` : null,
              "2 productos agotados",
              "5 productos por debajo del mínimo",
            ]
              .filter(Boolean)
              .map((texto) => (
                <li key={texto as string}>
                  <div className="hover:bg-muted/50 flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors">
                    <span className="text-sm">{texto}</span>
                    <ArrowRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </div>
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>
    </>
  )
}

function MaquetaCuentas() {
  return (
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
          <m.div key={cuenta.nombre} custom={i} variants={listItem} className="bg-card rounded-xl border p-5 shadow-sm">
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
  )
}

function MaquetaGastos() {
  return (
    <>
      <PageHeader title="Gastos" description="En qué se te va la plata" />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Costo de operar" value={formatMoney(498.5)} hint="Fijos + variables + discrecionales" icon={TrendingDown} className="col-span-2" />
        <StatCard label="Inversión" value={formatMoney(165)} hint="No resta de la utilidad" icon={Building2} />
        <StatCard label="Retiros" value={formatMoney(300)} hint="Lo que sacaste para ti" icon={Wallet} />
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
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tipo.chip}`}>{tipo.label}</span>
                      {!tipo.afectaUtilidad && <span className="text-muted-foreground text-xs">no resta utilidad</span>}
                    </span>
                    <span className="font-semibold tabular-nums">{formatMoney(monto)}</span>
                  </div>
                  <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                    <div
                      className={tipo.afectaUtilidad ? "bg-primary h-full" : "bg-muted-foreground/40 h-full"}
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
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${def.chip}`}>{def.label}</span>
                      <span className="text-muted-foreground text-xs">{gasto.categoria}</span>
                      {gasto.proveedor && <span className="text-muted-foreground text-xs">· {gasto.proveedor}</span>}
                      {gasto.recurrente && <span className="text-muted-foreground text-xs">· {gasto.recurrente}</span>}
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
  )
}

function MaquetaClientes() {
  return (
    <>
      <PageHeader title="Clientes" description="Quién te compra y quién te debe" />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Clientes" value="4" icon={Users} />
        <StatCard label="Te deben" value={formatMoney(381.5)} hint={formatBs(381.5 * 112.4)} icon={HandCoins} />
        <StatCard label="Ya vencido" value={formatMoney(326.5)} hint="Pasó de su fecha" icon={AlertTriangle} />
        <StatCard label="Con deuda" value="3" hint="de 4" icon={UserRound} />
      </div>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-border divide-y">
            {CLIENTES.map((cliente) => (
              <li key={cliente.nombre} className="flex items-center gap-3 p-4">
                <span className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold" aria-hidden>
                  {cliente.nombre.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{cliente.nombre}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {cliente.documento} · {cliente.telefono}
                  </p>
                </div>
                {cliente.debe > 0 && (
                  <span className="shrink-0 text-right">
                    <span className={`block font-semibold tabular-nums ${cliente.atraso && cliente.atraso > 0 ? "text-destructive" : ""}`}>
                      {formatMoney(cliente.debe)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {cliente.atraso && cliente.atraso > 0 ? `${cliente.atraso} días de atraso` : "debe"}
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  )
}

function MaquetaEquipo() {
  return (
    <>
      <PageHeader title="Equipo" description="Quién entra al sistema y qué puede hacer cada uno" />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Personas con acceso" value="3" icon={Users} />
        <StatCard label="Roles creados" value="3" icon={ShieldCheck} />
        <StatCard label="Invitaciones sin usar" value="1" hint="Esperando a que se registren" icon={UserRound} className="col-span-2 lg:col-span-1" />
      </div>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-border divide-y">
            {EQUIPO.map((persona) => (
              <li key={persona.nombre} className="flex flex-wrap items-center gap-3 p-4">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                    persona.dueño ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                  aria-hidden
                >
                  {persona.dueño ? <Crown className="size-5" /> : persona.nombre.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{persona.nombre}</span>
                    {!persona.activo && (
                      <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-[11px] font-medium">sin acceso</span>
                    )}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {persona.dueño ? "Dueño · lo puede todo" : persona.rol}
                  </p>
                </div>
                {!persona.dueño && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline">Cambiar rol</Button>
                    <Button size="sm" variant={persona.activo ? "ghost" : "default"}>
                      {persona.activo ? "Suspender" : "Reactivar"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES_EJEMPLO.map((rol) => (
          <div key={rol.nombre} className="bg-card flex flex-col rounded-xl border p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{rol.nombre}</p>
                <p className="text-muted-foreground mt-0.5 text-sm">{rol.descripcion}</p>
              </div>
              <ShieldCheck className="text-muted-foreground size-5 shrink-0" aria-hidden />
            </div>
            <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="tabular-nums">{rol.permisos} permisos</span>
              <span className="flex items-center gap-1 tabular-nums">
                <UserRound className="size-3.5" aria-hidden />
                {rol.miembros}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
