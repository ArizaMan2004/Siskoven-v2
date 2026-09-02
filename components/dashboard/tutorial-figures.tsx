"use client"

// Ilustraciones del tutorial.
//
// SON SVG A MANO, NO CAPTURAS. Tres razones, por orden de importancia:
//
//  1. Una captura envejece. La primera vez que muevas un botón, el tutorial
//     empieza a enseñar una pantalla que ya no existe, y una ayuda que miente
//     es peor que no tener ayuda.
//  2. Estas se pintan con los colores del tema, así que funcionan en claro y en
//     oscuro sin duplicar nada.
//  3. Pesan bytes en vez de kilobytes, y el sistema tiene que abrir rápido en
//     el teléfono de una bodega.
//
// Son esquemas, no retratos: enseñan la FORMA de la pantalla y dónde mirar, que
// es lo que hace falta para orientarse. El detalle real está a un clic.

import type { FiguraId } from "@/lib/tutorials"

const VB = "0 0 320 170"

/** Marco común: fondo de tarjeta y borde, como el resto del sistema. */
function Lienzo({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox={VB}
      className="h-full w-full"
      role="img"
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x="0" y="0" width="320" height="170" rx="10" className="fill-muted/40" />
      {children}
    </svg>
  )
}

/** Barrita gris: hace de texto sin tener que escribir texto de mentira. */
function Linea({
  x,
  y,
  w,
  h = 6,
  clase = "fill-muted-foreground/25",
}: {
  x: number
  y: number
  w: number
  h?: number
  clase?: string
}) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} className={clase} />
}

function Tarjeta({
  x,
  y,
  w,
  h,
  clase = "fill-card stroke-border",
}: {
  x: number
  y: number
  w: number
  h: number
  clase?: string
}) {
  return <rect x={x} y={y} width={w} height={h} rx="6" className={clase} strokeWidth="1" />
}

// ---------------------------------------------------------------------------

function Venta() {
  return (
    <Lienzo>
      {/* Catálogo a la izquierda, carrito a la derecha: la forma real de la
          pantalla de cobro. */}
      <Tarjeta x={12} y={12} w={180} h={146} />
      <Linea x={22} y={24} w={70} />
      <rect x={22} y={38} width={160} height={20} rx="4" className="fill-muted-foreground/10" />
      <Linea x={28} y={45} w={90} h={5} />

      {[70, 96, 122].map((y) => (
        <g key={y}>
          <rect x={22} y={y} width={160} height={20} rx="4" className="fill-background" />
          <circle cx={33} cy={y + 10} r="5" className="fill-primary/25" />
          <Linea x={44} y={y + 7} w={70} h={5} />
          <Linea x={150} y={y + 7} w={24} h={5} clase="fill-primary/50" />
        </g>
      ))}

      <Tarjeta x={200} y={12} w={108} h={146} />
      <Linea x={210} y={24} w={44} />
      {[42, 60, 78].map((y) => (
        <g key={y}>
          <Linea x={210} y={y} w={54} h={5} />
          <Linea x={274} y={y} w={22} h={5} clase="fill-muted-foreground/40" />
        </g>
      ))}
      <line x1="210" y1="100" x2="298" y2="100" className="stroke-border" strokeWidth="1" />
      <Linea x={210} y={110} w={30} h={7} clase="fill-foreground/60" />
      <Linea x={258} y={110} w={40} h={7} clase="fill-primary" />
      <rect x={210} y={130} width={88} height={18} rx="5" className="fill-primary" />
    </Lienzo>
  )
}

function Carrito() {
  return (
    <Lienzo>
      <Tarjeta x={40} y={16} w={240} h={138} />
      <Linea x={54} y={30} w={80} />

      {/* Divisa arriba, bolívares abajo: el pago mixto en dos bloques. */}
      <rect x={54} y={48} width={212} height={34} rx="6" className="fill-primary/10" />
      <Linea x={64} y={56} w={60} h={5} />
      <Linea x={64} y={68} w={40} h={7} clase="fill-primary" />
      <Linea x={210} y={62} w={46} h={6} clase="fill-primary/40" />

      <rect x={54} y={90} width={212} height={34} rx="6" className="fill-muted-foreground/10" />
      <Linea x={64} y={98} w={70} h={5} />
      <Linea x={64} y={110} w={54} h={7} clase="fill-foreground/50" />
      <Linea x={200} y={104} w={56} h={6} clase="fill-muted-foreground/40" />

      <Linea x={54} y={134} w={90} h={6} />
      <Linea x={216} y={134} w={50} h={6} clase="fill-success" />
    </Lienzo>
  )
}

function CajaAbierta() {
  return (
    <Lienzo>
      <rect x={16} y={30} width={288} height={54} rx="8" className="fill-success/10 stroke-success/40" strokeWidth="1" />
      <circle cx={42} cy={57} r="11" className="fill-success/25" />
      <path
        d="M36 57l4 4 8-8"
        className="stroke-success"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Linea x={64} y={46} w={104} h={7} clase="fill-foreground/70" />
      <Linea x={64} y={62} w={168} h={5} />
      <rect x={244} y={46} width={48} height={20} rx="5" className="fill-card stroke-border" strokeWidth="1" />

      <rect x={16} y={96} width={288} height={54} rx="8" className="fill-warning/10 stroke-warning/40" strokeWidth="1" />
      <circle cx={42} cy={123} r="11" className="fill-warning/25" />
      <path d="M42 117v7" className="stroke-warning" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={42} cy={129} r="1.4" className="fill-warning" />
      <Linea x={64} y={112} w={124} h={7} clase="fill-foreground/70" />
      <Linea x={64} y={128} w={150} h={5} />
      <rect x={244} y={112} width={48} height={20} rx="5" className="fill-primary" />
    </Lienzo>
  )
}

function CajaCierre() {
  return (
    <Lienzo>
      <Tarjeta x={16} y={14} w={288} h={142} />
      <Linea x={28} y={26} w={96} />

      {/* Lo que cuentas, sin ver lo que se esperaba: la columna de la derecha
          está tapada a propósito. */}
      {[46, 72, 98].map((y) => (
        <g key={y}>
          <Linea x={28} y={y + 6} w={62} h={5} />
          <rect x={116} y={y} width={64} height={18} rx="4" className="fill-background stroke-primary/40" strokeWidth="1" />
          <Linea x={126} y={y + 6} w={34} h={5} clase="fill-foreground/50" />
          <rect x={200} y={y} width={92} height={18} rx="4" className="fill-muted-foreground/15" />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={i} cx={218 + i * 14} cy={y + 9} r="2.5" className="fill-muted-foreground/40" />
          ))}
        </g>
      ))}

      <Linea x={28} y={130} w={70} h={6} />
      <rect x={200} y={126} width={92} height={18} rx="5" className="fill-primary" />
    </Lienzo>
  )
}

function Inventario() {
  return (
    <Lienzo>
      <Tarjeta x={16} y={14} w={288} h={142} />
      <rect x={28} y={26} width={140} height={18} rx="5" className="fill-background stroke-border" strokeWidth="1" />
      <circle cx={40} cy={35} r="4" className="fill-none stroke-muted-foreground/50" strokeWidth="1.5" />
      <Linea x={52} y={32} w={70} h={5} />
      <rect x={228} y={26} width={64} height={18} rx="5" className="fill-primary" />

      <line x1="28" y1="54" x2="292" y2="54" className="stroke-border" strokeWidth="1" />
      {[62, 86, 110, 134].map((y, i) => (
        <g key={y}>
          <rect x={28} y={y} width={18} height={16} rx="3" className="fill-primary/15" />
          <Linea x={54} y={y + 5} w={86} h={6} />
          <Linea x={168} y={y + 5} w={40} h={6} clase="fill-muted-foreground/20" />
          <Linea x={240} y={y + 5} w={22} h={6} clase={i === 1 ? "fill-warning" : "fill-muted-foreground/30"} />
          <Linea x={272} y={y + 5} w={20} h={6} clase="fill-primary/50" />
        </g>
      ))}
    </Lienzo>
  )
}

function StockBajo() {
  return (
    <Lienzo>
      <rect x={16} y={14} width={288} height={62} rx="8" className="fill-warning/10 stroke-warning/40" strokeWidth="1" />
      <path
        d="M34 28l11 19H23z"
        className="fill-none stroke-warning"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <Linea x={56} y={26} w={130} h={7} clase="fill-foreground/70" />

      {[42, 58].map((y, i) => (
        <g key={y}>
          <circle cx={62} cy={y + 5} r="3.5" className={i === 0 ? "fill-destructive" : "fill-warning"} />
          <Linea x={74} y={y + 2} w={92} h={5} />
          <Linea x={224} y={y + 2} w={56} h={5} clase={i === 0 ? "fill-destructive/60" : "fill-warning/60"} />
        </g>
      ))}

      <Tarjeta x={16} y={88} w={288} h={68} />
      <Linea x={28} y={100} w={80} h={5} />
      {[114, 134].map((y, i) => (
        <g key={y}>
          <Linea x={28} y={y} w={90} h={6} />
          <Linea x={200} y={y} w={26} h={6} clase={i === 0 ? "fill-destructive" : "fill-warning"} />
          <Linea x={236} y={y} w={56} h={6} clase="fill-muted-foreground/20" />
        </g>
      ))}
    </Lienzo>
  )
}

function Cuentas() {
  return (
    <Lienzo>
      {[
        { x: 16, moneda: "fill-primary/25" },
        { x: 112, moneda: "fill-success/25" },
        { x: 208, moneda: "fill-primary/25" },
      ].map((c) => (
        <g key={c.x}>
          <Tarjeta x={c.x} y={14} w={96} h={64} />
          <Linea x={c.x + 12} y={26} w={50} h={5} />
          <Linea x={c.x + 12} y={38} w={36} h={4} clase="fill-muted-foreground/20" />
          <rect x={c.x + 66} y={24} width={18} height={18} rx="5" className={c.moneda} />
          <Linea x={c.x + 12} y={56} w={58} h={9} clase="fill-foreground/60" />
        </g>
      ))}

      <Tarjeta x={16} y={90} w={288} h={66} />
      <Linea x={28} y={102} w={72} h={5} />
      {[118, 136].map((y, i) => (
        <g key={y}>
          <circle cx={34} cy={y + 3} r="5" className={i === 0 ? "fill-success/30" : "fill-destructive/30"} />
          <Linea x={46} y={y} w={104} h={5} />
          <Linea x={244} y={y} w={48} h={5} clase={i === 0 ? "fill-success" : "fill-destructive"} />
        </g>
      ))}
    </Lienzo>
  )
}

function Gastos() {
  // Las tres primeras barras restan de la utilidad; las dos últimas, no. Por eso
  // van en gris: el color es lo que separa un tipo del otro.
  const barras = [
    { y: 40, w: 200, resta: true },
    { y: 62, w: 250, resta: true },
    { y: 84, w: 60, resta: true },
    { y: 106, w: 140, resta: false },
    { y: 128, w: 170, resta: false },
  ]

  return (
    <Lienzo>
      <Tarjeta x={16} y={14} w={288} h={142} />
      <Linea x={28} y={24} w={90} />

      {barras.map((b) => (
        <g key={b.y}>
          <rect
            x={28}
            y={b.y}
            width={44}
            height={12}
            rx="6"
            className={b.resta ? "fill-primary/20" : "fill-muted-foreground/15"}
          />
          <rect
            x={82}
            y={b.y + 3}
            width={b.w * 0.68}
            height={6}
            rx="3"
            className={b.resta ? "fill-primary" : "fill-muted-foreground/40"}
          />
        </g>
      ))}
    </Lienzo>
  )
}

function Clientes() {
  return (
    <Lienzo>
      <Tarjeta x={16} y={14} w={288} h={142} />
      <rect x={28} y={26} width={264} height={18} rx="5" className="fill-background stroke-border" strokeWidth="1" />
      <circle cx={40} cy={35} r="4" className="fill-none stroke-muted-foreground/50" strokeWidth="1.5" />
      <Linea x={52} y={32} w={90} h={5} />

      {[56, 82, 108, 134].map((y, i) => (
        <g key={y}>
          <circle cx={40} cy={y + 8} r="9" className="fill-muted-foreground/15" />
          <Linea x={58} y={y + 3} w={88} h={6} />
          <Linea x={58} y={y + 14} w={62} h={4} clase="fill-muted-foreground/20" />
          {i < 3 && (
            <Linea
              x={232}
              y={y + 6}
              w={58}
              h={7}
              clase={i === 0 ? "fill-destructive" : "fill-foreground/40"}
            />
          )}
        </g>
      ))}
    </Lienzo>
  )
}

function Fiado() {
  return (
    <Lienzo>
      <rect x={16} y={14} width={288} height={58} rx="8" className="fill-destructive/10 stroke-destructive/40" strokeWidth="1" />
      <Linea x={30} y={26} w={96} h={7} clase="fill-foreground/70" />
      <Linea x={30} y={42} w={140} h={5} />
      <Linea x={224} y={30} w={66} h={12} clase="fill-destructive" />
      <Linea x={238} y={48} w={52} h={4} clase="fill-destructive/50" />

      {[84, 118].map((y, i) => (
        <g key={y}>
          <Tarjeta x={16} y={y} w={288} h={28} />
          <Linea x={30} y={y + 7} w={84} h={6} />
          <Linea x={30} y={y + 18} w={110} h={4} clase={i === 0 ? "fill-warning" : "fill-muted-foreground/20"} />
          <Linea x={202} y={y + 10} w={40} h={7} clase="fill-foreground/50" />
          <rect x={252} y={y + 6} width={40} height={16} rx="5" className="fill-primary" />
        </g>
      ))}
    </Lienzo>
  )
}

function Resumen() {
  const filas = [
    { y: 22, w: 74, importe: 46, tono: "fill-foreground/60" },
    { y: 46, w: 108, importe: 40, tono: "fill-muted-foreground/40" },
    { y: 74, w: 84, importe: 44, tono: "fill-foreground/60", regla: true },
    { y: 100, w: 96, importe: 38, tono: "fill-muted-foreground/40" },
  ]

  return (
    <Lienzo>
      <Tarjeta x={16} y={12} w={288} h={146} />

      {filas.map((f) => (
        <g key={f.y}>
          {f.regla && <line x1="28" y1={f.y - 8} x2="292" y2={f.y - 8} className="stroke-border" strokeWidth="1" />}
          <Linea x={28} y={f.y} w={f.w} h={6} />
          <Linea x={292 - f.importe} y={f.y} w={f.importe} h={6} clase={f.tono} />
        </g>
      ))}

      {/* La cifra grande abajo, como en cualquier factura. */}
      <line x1="28" y1="122" x2="292" y2="122" className="stroke-foreground/30" strokeWidth="2" />
      <Linea x={28} y={134} w={62} h={10} clase="fill-foreground/70" />
      <Linea x={222} y={132} w={70} h={14} clase="fill-success" />
    </Lienzo>
  )
}

function Permisos() {
  const grupos = [
    { y: 16, filas: 2 },
    { y: 74, filas: 2 },
  ]

  return (
    <Lienzo>
      {grupos.map((g) => (
        <g key={g.y}>
          <Tarjeta x={16} y={g.y} w={288} h={20 + g.filas * 22} />
          <rect x={16} y={g.y} width={288} height={20} rx="6" className="fill-muted-foreground/10" />
          <Linea x={28} y={g.y + 7} w={64} h={6} />
          <Linea x={252} y={g.y + 7} w={40} h={6} clase="fill-muted-foreground/25" />

          {Array.from({ length: g.filas }).map((_, i) => {
            const y = g.y + 26 + i * 22
            const marcado = i === 0

            return (
              <g key={y}>
                <rect
                  x={28}
                  y={y}
                  width={14}
                  height={14}
                  rx="3"
                  className={marcado ? "fill-primary" : "fill-background stroke-border"}
                  strokeWidth="1"
                />
                {marcado && (
                  <path
                    d="M31.5 37.5l2.5 2.5 4.5-4.5"
                    transform={`translate(0, ${y - 30})`}
                    className="stroke-primary-foreground"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                )}
                <Linea x={52} y={y + 1} w={78} h={6} />
                <Linea x={52} y={y + 11} w={150} h={4} clase="fill-muted-foreground/20" />
                {i === 1 && <Linea x={252} y={y + 3} w={40} h={8} clase="fill-warning/50" />}
              </g>
            )
          })}
        </g>
      ))}
    </Lienzo>
  )
}

function Equipo() {
  return (
    <Lienzo>
      <Tarjeta x={16} y={14} w={288} h={80} />
      {[24, 56].map((y, i) => (
        <g key={y}>
          <circle cx={40} cy={y + 12} r="11" className={i === 0 ? "fill-primary/20" : "fill-muted-foreground/15"} />
          <Linea x={60} y={y + 6} w={86} h={6} />
          <Linea x={60} y={y + 18} w={110} h={4} clase="fill-muted-foreground/20" />
          {i > 0 && (
            <>
              <rect x={190} y={y + 4} width={48} height={16} rx="5" className="fill-card stroke-border" strokeWidth="1" />
              <rect x={244} y={y + 4} width={48} height={16} rx="5" className="fill-card stroke-border" strokeWidth="1" />
            </>
          )}
        </g>
      ))}

      {/* La invitación: un sobre esperando a que la persona se registre. */}
      <rect x={16} y={104} width={288} height={52} rx="8" className="fill-primary/5 stroke-primary/30" strokeWidth="1" strokeDasharray="4 3" />
      <rect x={30} y={118} width={26} height={20} rx="3" className="fill-none stroke-primary" strokeWidth="1.5" />
      <path d="M30 120l13 9 13-9" className="fill-none stroke-primary" strokeWidth="1.5" strokeLinejoin="round" />
      <Linea x={70} y={120} w={120} h={6} />
      <Linea x={70} y={132} w={90} h={4} clase="fill-muted-foreground/25" />
    </Lienzo>
  )
}

function Tasa() {
  return (
    <Lienzo>
      <Tarjeta x={16} y={20} w={288} h={44} />
      <circle cx={40} cy={42} r="10" className="fill-primary/15" />
      <path d="M40 36v12M37 39h6M37 45h6" className="stroke-primary" strokeWidth="1.6" strokeLinecap="round" />
      <Linea x={60} y={32} w={70} h={5} />
      <Linea x={60} y={45} w={96} h={9} clase="fill-foreground/60" />
      <rect x={228} y={32} width={64} height={20} rx="6" className="fill-muted-foreground/10" />
      <Linea x={238} y={39} w={44} h={6} clase="fill-muted-foreground/40" />

      {/* Las cuatro tasas: oficial y paralelo, en dólar y en euro. */}
      {[
        { x: 16, w: 68 },
        { x: 90, w: 68 },
        { x: 164, w: 68 },
        { x: 238, w: 66 },
      ].map((c, i) => (
        <g key={c.x}>
          <Tarjeta x={c.x} y={78} w={c.w} h={54} />
          <Linea x={c.x + 10} y={90} w={c.w - 30} h={5} />
          <Linea x={c.x + 10} y={106} w={c.w - 20} h={9} clase={i < 2 ? "fill-primary" : "fill-foreground/50"} />
        </g>
      ))}
    </Lienzo>
  )
}

function Movil() {
  return (
    <Lienzo>
      <rect x={110} y={10} width={100} height={150} rx="12" className="fill-card stroke-border" strokeWidth="1.5" />
      <rect x={140} y={16} width={40} height="5" rx="2.5" className="fill-muted-foreground/25" />

      <Linea x={122} y={34} w={54} h={7} />
      {[50, 70, 90].map((y) => (
        <rect key={y} x={122} y={y} width={76} height={14} rx="4" className="fill-muted-foreground/10" />
      ))}

      {/* La barra inferior: cuatro fijos y "Más". */}
      <rect x={112} y={126} width={96} height={32} rx="0" className="fill-muted-foreground/10" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <circle
            cx={124 + i * 19}
            cy={138}
            r="5"
            className={i === 0 ? "fill-primary" : "fill-muted-foreground/40"}
          />
          <rect
            x={118 + i * 19}
            y={148}
            width={12}
            height={3}
            rx="1.5"
            className={i === 0 ? "fill-primary/60" : "fill-muted-foreground/25"}
          />
        </g>
      ))}
    </Lienzo>
  )
}

// ---------------------------------------------------------------------------

const FIGURAS: Record<FiguraId, () => React.ReactElement> = {
  venta: Venta,
  carrito: Carrito,
  "caja-abierta": CajaAbierta,
  "caja-cierre": CajaCierre,
  inventario: Inventario,
  "stock-bajo": StockBajo,
  cuentas: Cuentas,
  gastos: Gastos,
  clientes: Clientes,
  fiado: Fiado,
  resumen: Resumen,
  permisos: Permisos,
  equipo: Equipo,
  tasa: Tasa,
  movil: Movil,
}

export function Figura({ id }: { id: FiguraId }) {
  const Componente = FIGURAS[id]
  return Componente ? <Componente /> : null
}
