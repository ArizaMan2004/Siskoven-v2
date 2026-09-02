// components/landing/landing-data.ts
//
// El contenido de la portada, separado del maquetado.
//
// Está aparte por una razón práctica: los textos de venta se retocan mucho más
// que el diseño, y así se cambian sin abrir un archivo de 600 líneas de JSX.

import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Calculator,
  ClipboardList,
  CloudOff,
  Coins,
  FileText,
  Hammer,
  Landmark,
  Package,
  Receipt,
  Shirt,
  ShoppingBasket,
  ShoppingCart,
  Smartphone,
  UtensilsCrossed,
  Wallet,
  Wrench,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { PLANS } from "@/lib/subscriptions"

export interface Pain {
  icon: LucideIcon
  quote: string
  detail: string
}

/**
 * Los problemas que el comerciante reconoce como suyos.
 *
 * Van en primera persona y entrecomillados a propósito: quien se ve retratado
 * en una frase sigue leyendo; quien lee una lista de funciones, no.
 */
export const PAINS: Pain[] = [
  {
    icon: ClipboardList,
    quote: "No sé qué tengo en el depósito",
    detail: "Anotas en un cuaderno, en el teléfono, en la cabeza. Y a fin de mes nada cuadra.",
  },
  {
    icon: Coins,
    quote: "Cobro en bolívares y compro en dólares",
    detail: "Cada venta a una tasa distinta, y al reponer la mercancía te falta plata sin saber por qué.",
  },
  {
    icon: AlertTriangle,
    quote: "No sé si estoy ganando",
    detail: "Vendes todo el día, pero a fin de mes no entiendes dónde quedó la ganancia.",
  },
  {
    icon: Wallet,
    quote: "No sé cuadrar la caja",
    detail: "Cierras contando billetes contra un cuaderno, y si falta algo no sabes de qué turno salió.",
  },
]

export interface ModuleFeature {
  id: string
  label: string
  icon: LucideIcon
  headline: string
  detail: string
  bullets: string[]
}

export const MODULES: ModuleFeature[] = [
  {
    id: "ventas",
    label: "Punto de venta",
    icon: ShoppingCart,
    headline: "Cobra rápido, sin calculadora en la mano.",
    detail:
      "Registra la venta, elige el método de pago y el sistema te dice el vuelto exacto en bolívares.",
    bullets: [
      "Efectivo, Zelle, Binance, débito, pago móvil y biopago",
      "Pago mixto: parte en divisa, parte en bolívares",
      "El vuelto en bolívares calculado a la tasa del día",
      "Lector de código de barras",
    ],
  },
  {
    id: "inventario",
    label: "Inventario",
    icon: Package,
    headline: "Sabes qué tienes y qué te queda.",
    detail: "El stock baja solo con cada venta. Los precios se calculan del costo y el margen que tú pongas.",
    bullets: [
      "Precio en divisa y en bolívares, siempre cuadrados",
      "Venta por unidad o por peso",
      "Categorías propias de tu negocio",
      "El cajero consulta el catálogo pero no ve tus costos",
    ],
  },
  {
    id: "caja",
    label: "Caja y turnos",
    icon: Wallet,
    headline: "Cada bolívar tiene dueño y hora.",
    detail:
      "Abres el turno con el fondo inicial, cada venta queda atada a quien la cobró, y al cerrar cuentas a ciegas.",
    bullets: [
      "Cierre con conteo por método de pago",
      "Sobrante y faltante calculados al cerrar",
      "Entradas y salidas que no son ventas, con motivo",
      "El cajero cierra su turno, nunca el de otro",
    ],
  },
  {
    id: "reportes",
    label: "Reportes",
    icon: FileText,
    headline: "Los números listos para tu contador.",
    detail: "Notas de entrega numeradas, reportes de inventario y etiquetas, en PDF o en papel térmico.",
    bullets: [
      "Numeración correlativa sin saltos",
      "Recibos para impresora térmica de 58 y 80 mm",
      "Reporte de inventario valorizado",
      "Etiquetas con código de barras",
    ],
  },
  {
    id: "estadisticas",
    label: "Estadísticas",
    icon: BarChart3,
    headline: "Qué se vende, cuándo y a quién.",
    detail: "Ventas por día, por método de pago y por producto, con la utilidad real de cada período.",
    bullets: [
      "Ventas por día y por método de pago",
      "Utilidad real, no solo facturación",
      "Filtros por fecha",
      "Historial completo de cada venta",
    ],
  },
  {
    id: "calculadora",
    label: "Calculadora",
    icon: Calculator,
    headline: "Convierte sin salir del sistema.",
    detail: "Dólar y euro, tasa oficial y paralelo, actualizados solos varias veces al día.",
    bullets: [
      "Dólar BCV y dólar paralelo",
      "Euro BCV y euro paralelo",
      "O tu propia tasa, si cobras a una distinta",
      "De divisa a bolívares y al revés",
    ],
  },
]

export interface Differentiator {
  icon: LucideIcon
  title: string
  detail: string
}

/**
 * Lo que nos separa del resto.
 *
 * Esta sección ocupa el sitio donde la competencia pone su asistente de IA.
 * Es una apuesta deliberada: preferimos enseñar cuatro cosas que resuelven un
 * problema real del comercio venezolano antes que una función de moda.
 */
export const DIFFERENTIATORS: Differentiator[] = [
  {
    icon: AlertTriangle,
    title: "Te avisa si te estás descapitalizando",
    detail:
      "La trampa que mata negocios sin que el dueño se entere: vendes con ganancia, pero reponer la mercancía cuesta más que lo que cobraste. Siskoven te enseña las dos ganancias, la del reporte y la de verdad, una al lado de la otra.",
  },
  {
    icon: CloudOff,
    title: "Sigue vendiendo sin luz y sin internet",
    detail:
      "La caja no se detiene. Las ventas se guardan en el dispositivo y suben solas cuando vuelve la señal. Aquí eso no es un lujo: es martes.",
  },
  {
    icon: Landmark,
    title: "IVA e IGTF, como manda la ley",
    detail:
      "El 3% del IGTF solo sobre lo que se cobra en divisa, y el IVA por producto: general, reducido o exento. Configurado por ti, no impuesto por el sistema.",
  },
  {
    icon: Receipt,
    title: "Cuadre de caja a ciegas",
    detail:
      "Al cerrar, el cajero cuenta y escribe lo que hay. El sistema le enseña el descuadre después. Un cuadre donde ves lo esperado antes de contar no sirve para nada.",
  },
]

export interface Industry {
  icon: LucideIcon
  name: string
  detail: string
  /** Ancho en la retícula de escritorio. */
  span: string
}

export const INDUSTRIES: Industry[] = [
  { icon: ShoppingBasket, name: "Bodegas y abastos", detail: "Venta por peso, vencimientos y mermas", span: "md:col-span-4" },
  { icon: Shirt, name: "Ropa y calzado", detail: "Tallas, colores y referencias", span: "md:col-span-4" },
  { icon: UtensilsCrossed, name: "Restaurante y cafetería", detail: "Cierre de caja por turno", span: "md:col-span-4" },
  { icon: Smartphone, name: "Electrónica", detail: "Series, IMEI y garantías", span: "md:col-span-3" },
  { icon: Wrench, name: "Repuestos", detail: "Modelos y compatibilidad", span: "md:col-span-3" },
  { icon: Hammer, name: "Ferretería", detail: "Unidades de medida y granel", span: "md:col-span-3" },
  { icon: Boxes, name: "Distribuidoras", detail: "Precios sin IVA y por mayor", span: "md:col-span-3" },
]

export interface Faq {
  category: string
  question: string
  answer: string
  icon: LucideIcon
}

/**
 * Preguntas frecuentes.
 *
 * Las respuestas dicen lo que el sistema hace hoy, no lo que hará. Una promesa
 * en el FAQ que no se cumple en la prueba gratis es una baja garantizada.
 */
export const FAQS: Faq[] = [
  {
    category: "Precios",
    icon: Coins,
    question: "¿Cuánto cuesta Siskoven?",
    answer: `${PLANS.mensual.label} $${PLANS.mensual.price} al mes. ${PLANS.trimestral.label} $${PLANS.trimestral.price} (sale a $${PLANS.trimestral.perMonth} al mes). ${PLANS.anual.label} $${PLANS.anual.price}, que son dos meses gratis y sale a $${PLANS.anual.perMonth} al mes. Un solo plan con todo incluido: no hay funciones bloqueadas ni cobro por usuario.`,
  },
  {
    category: "Prueba",
    icon: ClipboardList,
    question: "¿Tengo que pagar para probarlo?",
    answer:
      "No. Tienes 7 días con el sistema completo, sin tarjeta de crédito y sin compromiso. Si no te sirve, no haces nada y la cuenta se cierra sola.",
  },
  {
    category: "Sin conexión",
    icon: CloudOff,
    question: "¿Qué pasa si se va la luz o el internet?",
    answer:
      "Sigues vendiendo. Las ventas se guardan en el dispositivo y suben solas cuando vuelve la conexión, incluso si cierras el navegador. La pantalla te avisa de qué está pendiente en todo momento.",
  },
  {
    category: "Equipo",
    icon: Wallet,
    question: "¿Puedo poner a mi cajero sin que vea mis costos?",
    answer:
      "Sí, y es la razón de que existan los roles. El cajero vende, consulta el catálogo y cierra su turno, pero no ve a cuánto compras, no ve la utilidad y no puede ajustar el inventario. Puede anular una venta con motivo, que queda registrado a su nombre.",
  },
  {
    category: "Impuestos",
    icon: Landmark,
    question: "¿Maneja IVA e IGTF?",
    answer:
      "Sí, y los dos son configurables. El IVA va por producto (general, reducido o exento) y puedes tener los precios con el impuesto incluido o sumarlo al final. El IGTF del 3% se aplica solo sobre la parte que el cliente paga en divisa.",
  },
  {
    category: "Dispositivos",
    icon: Smartphone,
    question: "¿En qué puedo usarlo?",
    answer:
      "En el teléfono, la tablet o la computadora, desde el navegador. No hay que instalar nada. Se puede añadir a la pantalla de inicio como una aplicación más.",
  },
  {
    category: "Impresión",
    icon: Receipt,
    question: "¿Funciona con mi impresora de tickets?",
    answer:
      "Sí, con rollos de 58 y 80 mm. La impresora tiene que estar instalada en el sistema como cualquier otra; no hace falta ningún programa adicional.",
  },
  {
    category: "Datos",
    icon: BarChart3,
    question: "¿De quién son mis datos?",
    answer:
      "Tuyos. Cada negocio solo puede ver lo suyo, y eso no depende de que la pantalla lo oculte: está impuesto en el servidor y se comprueba con pruebas automáticas en cada cambio.",
  },
]
