// /lib/tutorials.ts
//
// El tutorial de cada pantalla, en diapositivas.
//
// POR QUÉ ESTÁ AQUÍ Y NO EN UN MANUAL
//
// Nadie lee el manual. La ayuda que funciona es la que está a un clic de la
// pantalla que no se entiende, y que habla de ESA pantalla: no de "el módulo de
// inventario" en abstracto, sino de los botones que la persona tiene delante.
//
// CÓMO SE ESCRIBEN ESTAS DIAPOSITIVAS
//
// Tres reglas, y las tres cuestan trabajo:
//
//  1. Se explica QUÉ HACER, no qué es. "Pulsa Nuevo producto y ponle el costo"
//     sirve; "esta es la pantalla de inventario" no le dice nada a nadie.
//
//  2. Se explica POR QUÉ cuando la razón no es evidente. La mitad de las cosas
//     raras de este sistema son deliberadas —el cajero no ve costos, la
//     inversión no resta de la utilidad, anular no borra—, y una función que
//     parece un capricho se usa mal o no se usa.
//
//  3. `ojo` es para lo que la gente hace mal de verdad, no para adornar. Si
//     todas las diapositivas llevan aviso, ninguna lo lleva.
//
// El texto es corto a propósito: una diapositiva que no cabe en la pantalla de
// un teléfono sin desplazarse ya es un manual.

/** Las ilustraciones disponibles. Ver components/dashboard/tutorial-figures.tsx */
export type FiguraId =
  | "venta"
  | "carrito"
  | "caja-abierta"
  | "caja-cierre"
  | "inventario"
  | "stock-bajo"
  | "cuentas"
  | "gastos"
  | "clientes"
  | "fiado"
  | "resumen"
  | "permisos"
  | "equipo"
  | "tasa"
  | "movil"

export interface Diapositiva {
  titulo: string
  cuerpo: string
  /** Lo que la gente hace mal. Se pinta destacado. Con moderación. */
  ojo?: string
  figura?: FiguraId
}

export interface Tutorial {
  /** Id del módulo, el mismo de la navegación. */
  vista: string
  titulo: string
  /** Una línea: para qué sirve la pantalla. */
  resumen: string
  diapositivas: Diapositiva[]
}

const TUTORIALES: Tutorial[] = [
  // -------------------------------------------------------------------------
  {
    vista: "home",
    titulo: "Inicio",
    resumen: "Qué pasa hoy y qué hace falta atender",
    diapositivas: [
      {
        titulo: "Lo primero: ¿está la caja abierta?",
        cuerpo:
          "La franja de arriba te lo dice de un vistazo. Si no está abierta, ábrela antes de vender: es lo que permite cuadrar al final del turno y saber de quién es un faltante.",
        ojo: "Enterarte a media mañana de que nadie abrió el turno significa que las ventas de toda la mañana no cuadran con nada.",
        figura: "caja-abierta",
      },
      {
        titulo: "Las cifras son de HOY",
        cuerpo:
          "Lo vendido, cuántas ventas y el promedio por venta. Si tu rol no tiene permiso para ver las ventas de los demás, aquí solo salen las tuyas — y dice “Vendiste hoy” en vez de “Vendido hoy”.",
      },
      {
        titulo: "Cosas que atender",
        cuerpo:
          "Deudas vencidas, productos agotados y productos por debajo del mínimo. Cada línea te lleva a la pantalla donde se arregla.",
        ojo: "Esta lista está vacía muchos días, y así tiene que ser. Una lista que siempre tiene algo se deja de leer.",
      },
      {
        titulo: "Cada quien ve lo suyo",
        cuerpo:
          "Un cajero ve tres bloques y el dueño ocho. No es que falten cosas: es que enseñarte lo que no puedes tocar convertiría tu primera pantalla del día en una lista de prohibiciones.",
        figura: "permisos",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    vista: "sales",
    titulo: "Punto de venta",
    resumen: "Cobrar, imprimir y descontar del inventario",
    diapositivas: [
      {
        titulo: "Busca y añade al carrito",
        cuerpo:
          "Escribe el nombre o pasa el código de barras. Los productos por peso te piden los kilos; los servicios se añaden sin tocar existencias, porque reparar un teléfono no se agota.",
        figura: "venta",
      },
      {
        titulo: "La tasa manda sobre el total en bolívares",
        cuerpo:
          "Arriba a la derecha ves la tasa vigente. El precio en divisa y el precio en bolívares salen del mismo número, así que si la tasa está vieja, el total en bolívares está mal.",
        ojo: "Sin tasa cargada el sistema no te deja cobrar. Es a propósito: registraría una venta en cero.",
        figura: "tasa",
      },
      {
        titulo: "Cómo paga",
        cuerpo:
          "Efectivo, Zelle, Binance, débito, transferencia, pago móvil o biopago. “Mixto” es para cuando paga una parte en divisa y otra en bolívares, y no te deja cerrar hasta que la suma cubra el total.",
        figura: "carrito",
      },
      {
        titulo: "Fiado: entregar sin cobrar",
        cuerpo:
          "Si tu rol lo permite, aparece “Fiado” en la lista. Hay que identificar al cliente y elegir el plazo. La venta se registra completa —descuenta inventario y numera su documento— pero en vez de entrar dinero se crea una deuda.",
        ojo: "El sistema te avisa antes de fiar si el cliente ya se pasa de su tope. Eso es lo que evita creer que vendiste mil y tener cuatrocientos en la gaveta.",
        figura: "fiado",
      },
      {
        titulo: "Si te equivocas, se anula",
        cuerpo:
          "Anular no borra: crea el movimiento contrario, devuelve el stock y deja las dos entradas en el historial con el motivo y quién lo hizo.",
        ojo: "Un historial que se puede editar no es un historial. Por eso ninguna venta se borra nunca.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    vista: "cash",
    titulo: "Caja",
    resumen: "Abrir el turno, mover dinero y cuadrar al cerrar",
    diapositivas: [
      {
        titulo: "Abre el turno declarando el fondo",
        cuerpo:
          "Cuenta lo que hay en la gaveta antes de empezar y anótalo. Desde ese momento, cada venta que cobres queda atada a tu turno y a tu nombre.",
        figura: "caja-abierta",
      },
      {
        titulo: "Entradas y salidas que no son ventas",
        cuerpo:
          "Pagar a un proveedor, sacar para el dueño, comprar insumos, buscar cambio. Anótalo aquí en el momento: al cerrar, el sistema lo tiene en cuenta.",
        ojo: "Sacar plata sin anotarlo es la causa número uno de que una caja no cuadre.",
      },
      {
        titulo: "El cierre es a ciegas",
        cuerpo:
          "Cuentas lo que hay por cada método de pago y lo escribes SIN ver lo que el sistema esperaba. Después te enseña la diferencia.",
        ojo: "Si vieras el esperado antes de contar, escribirías ese número sin darte cuenta. Ese es todo el sentido de contar a ciegas.",
        figura: "caja-cierre",
      },
      {
        titulo: "La diferencia se guarda como quedó",
        cuerpo:
          "Contado menos esperado, por método. Negativo es que falta dinero. Se guarda el cálculo de ese momento, con la tasa de ese momento: si se recalculara meses después, la tasa nueva daría otro resultado.",
      },
      {
        titulo: "Cada quien cierra la suya",
        cuerpo:
          "Cierras tu propio turno. Cerrar el de otro es un permiso aparte, para cuando alguien se fue sin cerrar — así nadie cuadra la caja ajena.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    vista: "products",
    titulo: "Productos",
    resumen: "Qué hay, cuánto queda y a cuánto se vende",
    diapositivas: [
      {
        titulo: "Carga el inventario de golpe",
        cuerpo:
          "El botón de importar lee un Excel o un CSV y adivina qué columna es cada cosa. Te enseña todo antes de guardar nada y, si hay una fila mala, no escribe ninguna.",
        ojo: "Cargar mil productos a mano es lo que hace que la gente abandone un sistema en la primera semana.",
        figura: "inventario",
      },
      {
        titulo: "Unidad, peso o servicio",
        cuerpo:
          "Por unidad es lo normal. Por peso pide los kilos al vender. Servicio no tiene existencias: desaparecen los campos de cantidad y de mínimo, porque un servicio no se agota.",
      },
      {
        titulo: "El stock mínimo es lo que dispara la alerta",
        cuerpo:
          "Ponle un mínimo a lo que no puedes dejar de tener. Cuando quede esa cantidad o menos, aparece arriba y en Inicio. Cero significa que no se vigila.",
        ojo: "Si ningún producto tiene mínimo, la alerta nunca puede saltar. Por eso, cuando eso pasa, la pantalla te lo dice en vez de callarse.",
        figura: "stock-bajo",
      },
      {
        titulo: "El costo no lo ve todo el mundo",
        cuerpo:
          "El costo y la utilidad viven aparte del producto, y solo los lee quien tenga el permiso. No es que la pantalla los esconda: es que al cajero no le llegan del servidor.",
        ojo: "Si el costo estuviera dentro del producto, cualquiera podría verlo abriendo la consola del navegador. Que esté separado es lo que convierte la promesa en garantía.",
      },
      {
        titulo: "Cambiar los ajustes de cobro reescribe los precios",
        cuerpo:
          "El precio se guarda ya calculado, no se deduce al mostrarlo. Así que si cambias el redondeo o el descuento en divisa, hay que recalcular el catálogo — el botón está en los ajustes.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    vista: "clientes",
    titulo: "Clientes",
    resumen: "Quién te compra y quién te debe",
    diapositivas: [
      {
        titulo: "Solo el nombre es obligatorio",
        cuerpo:
          "Lo demás lo completas después. La cédula y el teléfono sirven para dos cosas: facturarle sin volver a preguntárselo, y poder llamarlo cuando deba.",
        figura: "clientes",
      },
      {
        titulo: "El tope de fiado",
        cuerpo:
          "Hasta cuánto se le puede fiar. Cuando una venta fiada lo pasaría, el sistema no la deja y te dice por cuánto se pasa y cuánto debe ya.",
        ojo: "Cero significa SIN TOPE, no “no se le fía”. Para eso último, desactiva al cliente.",
      },
      {
        titulo: "Por cobrar: lo vencido primero",
        cuerpo:
          "La segunda pestaña ordena las deudas por atraso. Arriba, lo que más días lleva pasado de fecha: es el orden en que se hacen las llamadas.",
        ojo: "“Me deben 800” es un dato. “Me deben 800, y 600 ya pasaron de fecha” es una tarde de trabajo.",
        figura: "fiado",
      },
      {
        titulo: "Abonar poco a poco",
        cuerpo:
          "Un abono baja la deuda y el saldo del cliente a la vez. Hay un botón para el caso más común, que es pagarlo todo, porque teclear el importe exacto invita a fallar por un centavo.",
        ojo: "No se puede abonar de más. Un saldo negativo se leería como “el negocio le debe al cliente”, que es otra conversación.",
      },
      {
        titulo: "Nada se borra",
        cuerpo:
          "Los clientes se desactivan. Sus ventas y sus deudas apuntan a ellos, y un historial que dice “cliente eliminado” no sirve para cobrar nada.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    vista: "cuentas",
    titulo: "Cuentas",
    resumen: "Dónde está el dinero de tu negocio",
    diapositivas: [
      {
        titulo: "Una cuenta por cada sitio donde hay plata",
        cuerpo:
          "La gaveta, el banco, el Zelle, el pago móvil. Cada una con su moneda: el saldo se enseña en la moneda de la cuenta, nunca convertido.",
        figura: "cuentas",
      },
      {
        titulo: "Arriba, los totales",
        cuerpo:
          "Lo que hay en divisas, lo que hay en bolívares, y las dos cosas juntas convertidas a la tasa de hoy. Ese último número cambia cuando cambia la tasa, aunque no hayas movido un bolívar.",
      },
      {
        titulo: "Transferir entre cuentas",
        cuerpo:
          "De la gaveta al banco, de Zelle a efectivo. Si cambias de moneda te pide los dos importes, el que sale y el que entra, porque la tasa a la que cambiaste es tuya, no la del sistema.",
      },
      {
        titulo: "Un movimiento no se retoca",
        cuerpo:
          "Si se registró mal, se corrige con otro movimiento en sentido contrario y quedan los dos. El saldo se mantiene sumando movimientos, no escribiéndolo a mano.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    vista: "gastos",
    titulo: "Gastos",
    resumen: "En qué se te va la plata",
    diapositivas: [
      {
        titulo: "Cinco tipos, y no son un capricho",
        cuerpo:
          "Fijo, variable, discrecional, inversión y retiro. Los tres primeros restan de tu utilidad. Los dos últimos NO, y esa distinción es la que hace que el número final sea de verdad.",
        figura: "gastos",
      },
      {
        titulo: "Inversión no es gasto del mes",
        cuerpo:
          "Una estantería, una nevera, una máquina: salió dinero, pero se convirtió en algo que el negocio conserva. Meterlo como gasto hace que un mes bueno parezca malo.",
      },
      {
        titulo: "Los retiros tampoco",
        cuerpo:
          "Lo que sacas para ti no es un costo de operar: es repartir lo que el negocio ganó. Si lo cuentas como gasto, el negocio no gana nunca — cada bolívar que sobra se retira y vuelve a restar.",
        ojo: "Este es el error de contabilidad más común en un negocio pequeño, y el que hace creer que no da dinero.",
      },
      {
        titulo: "Discrecional es el pastel de cumpleaños",
        cuerpo:
          "El gasto que sí resta pero que podrías no haber hecho. Separarlo del alquiler te deja ver, al final del mes, cuánto de lo que gastaste era obligatorio.",
      },
      {
        titulo: "Proveedores y gastos que se repiten",
        cuerpo:
          "Anota de quién compraste para saber a quién le compras más. Y si es un gasto fijo, márcalo como recurrente: el sistema te avisa cuando se acerca la próxima vez.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    vista: "resumen",
    titulo: "Resumen",
    resumen: "Si el negocio gana o pierde, y por qué",
    diapositivas: [
      {
        titulo: "Es una cuenta, no un tablero",
        cuerpo:
          "Se lee de arriba abajo: ventas, menos lo que costó la mercancía, menos los gastos de operar, igual a lo que ganaste. La cifra grande va abajo, como en cualquier factura.",
        figura: "resumen",
      },
      {
        titulo: "Utilidad bruta y utilidad",
        cuerpo:
          "La bruta es lo que deja el margen antes de pagar nada. La de abajo es lo que quedó de verdad. Si la bruta es buena y la final es mala, el problema no son los precios: son los gastos.",
      },
      {
        titulo: "Cuando el número está inflado, te lo dice",
        cuerpo:
          "Las ventas que hizo alguien sin permiso para ver costos se anotan con costo cero, así que cuentan como ganancia entera. Si eso pasa, sale un aviso arriba con cuántas ventas son.",
        ojo: "Preferimos decirte que el número está mal a inventarnos el costo por detrás. Un número con advertencia sirve; uno inventado, no.",
      },
      {
        titulo: "Lo que salió pero no es gasto",
        cuerpo:
          "Inversión y retiros van en su propio bloque, fuera de la cuenta. Y abajo, cuánto se quedó de verdad en el negocio después de lo que sacaste.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    vista: "statistics",
    titulo: "Estadísticas",
    resumen: "Cómo se mueven las ventas",
    diapositivas: [
      {
        titulo: "Elige el rango primero",
        cuerpo:
          "Todo lo de abajo se recalcula con las fechas que pongas. Sin rango, los números de un año se mezclan con los de esta semana y no dicen nada.",
      },
      {
        titulo: "Por día y por método de pago",
        cuerpo:
          "Sirve para dos preguntas distintas: qué días vendes más (para saber cuándo hace falta gente) y en qué te pagan (para saber cuánto efectivo tienes que tener para el vuelto).",
      },
      {
        titulo: "Los más vendidos no son los que más dejan",
        cuerpo:
          "Un producto puede salir mucho y dejar poco. Si tienes permiso para ver costos, mira la utilidad y no solo la cantidad.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    vista: "reports",
    titulo: "Reportes",
    resumen: "El detalle, y cómo sacarlo del sistema",
    diapositivas: [
      {
        titulo: "Aquí está el detalle venta por venta",
        cuerpo:
          "Con su número de documento, su fecha, quién la hizo y cómo se pagó. Es donde se viene a buscar una venta concreta cuando un cliente reclama.",
      },
      {
        titulo: "Exportar a Excel o PDF",
        cuerpo:
          "Para el contador, para el banco, o para guardarlo. Exportar es un permiso aparte de ver: sacar los datos del sistema no es lo mismo que consultarlos dentro.",
      },
      {
        titulo: "Documentos sin numerar",
        cuerpo:
          "Si vendiste sin conexión, la venta se guardó pero sin número. Aquí aparecen y se numeran por orden de creación cuando vuelve internet.",
        ojo: "Nunca se inventa un número provisional: se rompe la numeración, nunca la venta.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    vista: "equipo",
    titulo: "Equipo",
    resumen: "Quién entra y qué puede hacer",
    diapositivas: [
      {
        titulo: "Primero el rol, después la persona",
        cuerpo:
          "Un rol es un conjunto de permisos con nombre: lo creas una vez y se lo pones a quien haga ese trabajo. Empieza desde la plantilla de Cajero o Encargado y quítale o ponle lo que quieras.",
        figura: "permisos",
      },
      {
        titulo: "Cada casilla dice qué hace de verdad",
        cuerpo:
          "Debajo de cada permiso hay una línea explicando qué significa. Las marcadas como “delicado” dan acceso a información que quizá no quieras repartir: costos, saldos, gastos.",
      },
      {
        titulo: "Las dependencias se resuelven solas",
        cuerpo:
          "Si marcas “vender fiado” se marca también “ver clientes”, porque sin eso el permiso no haría nada. Y al quitar uno se quitan los que dependían de él. Te avisa debajo cuando lo hace.",
      },
      {
        titulo: "A la gente se la invita",
        cuerpo:
          "Pones su correo y el rol. Esa persona se registra sola en Siskoven con ese mismo correo y entra directo a tu negocio con los permisos que le diste.",
        ojo: "Tú nunca ves su contraseña: la elige ella. Crear su cuenta desde aquí te sacaría de la tuya.",
        figura: "equipo",
      },
      {
        titulo: "Suspender, no borrar",
        cuerpo:
          "Quitarle el acceso a alguien deja su cuenta y su historial en pie. Sus ventas y sus cierres tienen que seguir apuntando a una persona con nombre.",
      },
      {
        titulo: "Al dueño no lo toca nadie",
        cuerpo:
          "Ni siquiera quien gestione el equipo. No se le pueden recortar permisos ni suspenderlo, porque el único que podría devolvérselos es él mismo.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    vista: "calculator",
    titulo: "Calculadora",
    resumen: "Convertir entre divisa y bolívares",
    diapositivas: [
      {
        titulo: "A la tasa que elijas",
        cuerpo:
          "Oficial, paralelo, euro o la que escribas a mano. Sirve para calcular un vuelto rápido o para comprobar un precio sin salir del sistema.",
        figura: "tasa",
      },
      {
        titulo: "No registra nada",
        cuerpo:
          "Es una calculadora, no una venta. Lo que hagas aquí no toca la caja, ni el inventario, ni los reportes.",
      },
    ],
  },
]

const INDICE = new Map(TUTORIALES.map((tutorial) => [tutorial.vista, tutorial]))

export function tutorialDe(vista: string): Tutorial | undefined {
  return INDICE.get(vista)
}

export function hayTutorial(vista: string): boolean {
  return INDICE.has(vista)
}

/**
 * Qué tutoriales ya se vieron, guardado en el navegador.
 *
 * Va en `localStorage` y no en Firestore a propósito: es una preferencia de
 * quien mira, no un dato del negocio, y no vale una escritura pagada por cada
 * persona que cierre una ayuda. Que se repita en otro dispositivo es un precio
 * pequeño; que falle la lectura, también, y por eso todo va en try/catch.
 */
const CLAVE = "siskoven:tutoriales-vistos"

export function tutorialesVistos(): string[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE)
    const lista = crudo ? JSON.parse(crudo) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

export function marcarTutorialVisto(vista: string): void {
  try {
    const vistos = new Set(tutorialesVistos())
    vistos.add(vista)
    window.localStorage.setItem(CLAVE, JSON.stringify([...vistos]))
  } catch {
    // Navegador en privado, o con el almacenamiento bloqueado. La ayuda sigue
    // funcionando: lo único que se pierde es dejar de señalarla.
  }
}

export function olvidarTutoriales(): void {
  try {
    window.localStorage.removeItem(CLAVE)
  } catch {
    // Igual que arriba: no poder olvidar no es motivo para romper nada.
  }
}

export { TUTORIALES }
