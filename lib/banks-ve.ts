// /lib/banks-ve.ts
//
// Los bancos venezolanos, con su código de cuatro dígitos.
//
// POR QUÉ EL CÓDIGO IMPORTA MÁS QUE EL NOMBRE
//
// Ese número (0102, 0134, 0191…) es el prefijo de toda cuenta del país y el
// que se elige al hacer un pago móvil. Es corto, no tiene acentos y no cambia:
// el nombre comercial sí —"Provincial" es "BBVA Provincial", el "Banco
// Nacional de Crédito" es "BNC" en la mitad de las pantallas—, así que casar
// por nombre es frágil y casar por código no falla.
//
// De ahí que cada banco lleve sus `alias`: son las formas en que aparece
// escrito en las capturas de pantalla y en los estados de cuenta, en minúsculas
// y sin acentos. El lector de comprobantes los usa para deducir el banco cuando
// el código no se ve, que pasa más de lo que parece porque muchas aplicaciones
// solo enseñan el logotipo.

export interface BancoVE {
  /** Código de cuatro dígitos. Es la llave de verdad. */
  codigo: string
  /** Nombre corto, el que se enseña en la interfaz. */
  nombre: string
  /** Nombre completo, para documentos formales. */
  nombreLargo?: string
  /**
   * Cómo aparece escrito en capturas y estados de cuenta. En minúsculas y sin
   * acentos, porque así es como se compara.
   */
  alias: string[]
}

export const BANCOS_VE: BancoVE[] = [
  {
    codigo: "0102",
    nombre: "Banco de Venezuela",
    nombreLargo: "Banco de Venezuela, S.A. Banco Universal",
    alias: ["banco de venezuela", "bdv", "venezuela", "b.d.v"],
  },
  {
    codigo: "0104",
    nombre: "Venezolano de Crédito",
    alias: ["venezolano de credito", "banco venezolano de credito", "bvc"],
  },
  {
    codigo: "0105",
    nombre: "Mercantil",
    nombreLargo: "Mercantil, C.A. Banco Universal",
    alias: ["mercantil", "banco mercantil"],
  },
  {
    codigo: "0108",
    nombre: "Provincial",
    nombreLargo: "BBVA Provincial",
    alias: ["provincial", "bbva", "bbva provincial"],
  },
  { codigo: "0114", nombre: "Bancaribe", alias: ["bancaribe", "banco caribe"] },
  { codigo: "0115", nombre: "Exterior", alias: ["exterior", "banco exterior"] },
  { codigo: "0128", nombre: "Banco Caroní", alias: ["caroni", "banco caroni"] },
  {
    codigo: "0134",
    nombre: "Banesco",
    nombreLargo: "Banesco Banco Universal",
    alias: ["banesco"],
  },
  { codigo: "0137", nombre: "Sofitasa", alias: ["sofitasa", "banco sofitasa"] },
  { codigo: "0138", nombre: "Banco Plaza", alias: ["plaza", "banco plaza"] },
  { codigo: "0146", nombre: "Bangente", alias: ["bangente", "banco de la gente emprendedora"] },
  { codigo: "0151", nombre: "BFC", nombreLargo: "BFC Banco Fondo Común", alias: ["bfc", "fondo comun", "banco fondo comun"] },
  { codigo: "0156", nombre: "100% Banco", alias: ["100% banco", "100 banco", "cien por ciento banco"] },
  { codigo: "0157", nombre: "DelSur", alias: ["delsur", "del sur", "banco del sur"] },
  {
    codigo: "0163",
    nombre: "Banco del Tesoro",
    alias: ["tesoro", "banco del tesoro", "bt"],
  },
  { codigo: "0166", nombre: "Banco Agrícola", alias: ["agricola", "banco agricola de venezuela", "bav"] },
  { codigo: "0168", nombre: "Bancrecer", alias: ["bancrecer"] },
  { codigo: "0169", nombre: "Mi Banco", alias: ["mi banco", "mibanco"] },
  { codigo: "0171", nombre: "Banco Activo", alias: ["activo", "banco activo"] },
  { codigo: "0172", nombre: "Bancamiga", alias: ["bancamiga"] },
  { codigo: "0174", nombre: "Banplus", alias: ["banplus"] },
  {
    codigo: "0175",
    nombre: "Bicentenario",
    nombreLargo: "Banco Bicentenario del Pueblo",
    alias: ["bicentenario", "banco bicentenario"],
  },
  { codigo: "0177", nombre: "Banfanb", alias: ["banfanb", "banco de la fuerza armada nacional bolivariana"] },
  {
    codigo: "0191",
    nombre: "BNC",
    nombreLargo: "Banco Nacional de Crédito",
    alias: ["bnc", "banco nacional de credito", "nacional de credito"],
  },
]

const POR_CODIGO = new Map(BANCOS_VE.map((banco) => [banco.codigo, banco]))

export function bancoPorCodigo(codigo: string | null | undefined): BancoVE | null {
  if (!codigo) return null
  // Se admite tanto "0134" como "134": las aplicaciones a veces se comen el cero.
  const normalizado = codigo.trim().padStart(4, "0")
  return POR_CODIGO.get(normalizado) ?? null
}

/** Texto en minúsculas, sin acentos y con los espacios colapsados. */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Deduce el banco a partir de un texto suelto: el de una captura, el de una
 * celda del estado de cuenta.
 *
 * Busca primero el código, que es inequívoco, y solo si no aparece cae a los
 * nombres. El orden importa: "Banco de Venezuela" contiene "venezuela", y en un
 * comprobante puede haber media docena de palabras que se parezcan a un banco.
 *
 * Entre varios nombres que encajan gana el más largo, para que "banco nacional
 * de credito" gane a un "bnc" suelto que podría venir de otra palabra.
 */
export function detectarBanco(texto: string | null | undefined): BancoVE | null {
  if (!texto) return null

  const limpio = normalizarTexto(texto)

  // 1. Por código de cuatro dígitos. Se exige que no venga pegado a más
  //    números, para no confundirlo con un trozo de la referencia.
  for (const banco of BANCOS_VE) {
    if (new RegExp(`(^|\\D)${banco.codigo}(\\D|$)`).test(limpio)) return banco
  }

  // 2. Por nombre, quedándose con la coincidencia más específica.
  let mejor: { banco: BancoVE; largo: number } | null = null
  for (const banco of BANCOS_VE) {
    for (const alias of banco.alias) {
      if (limpio.includes(alias) && (!mejor || alias.length > mejor.largo)) {
        mejor = { banco, largo: alias.length }
      }
    }
  }

  return mejor?.banco ?? null
}

/** Para los desplegables: ordenados por nombre, como se buscan. */
export const BANCOS_ORDENADOS = [...BANCOS_VE].sort((a, b) =>
  a.nombre.localeCompare(b.nombre, "es"),
)
