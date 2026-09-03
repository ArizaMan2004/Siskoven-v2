// tests/ocr-receipt.test.ts
//
// Pruebas de la lectura de comprobantes de pago móvil.
//
// Aquí NO se prueba Tesseract, que ya está probado por quien lo escribió. Se
// prueba lo nuestro: sacar la referencia, el monto, el banco y el teléfono de
// un texto transcrito, que es donde están todas las decisiones difíciles y
// donde se rompen las cosas en silencio.
//
// Cada caso viene de un formato real de banca venezolana. Los dos marcados
// como REGRESIÓN son fallos que ya ocurrieron: se dejan escritos para que no
// vuelvan.
//
// Correr con:  npm run test:ocr

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { extraerCampos } from "../lib/ocr-receipt.ts"
import { detectarBanco } from "../lib/banks-ve.ts"

describe("lectura de comprobantes", () => {
  it("saca todos los campos de un pago móvil de Banesco", () => {
    const leido = extraerCampos(`Banesco
Operación exitosa
Pago Móvil
Fecha: 02/09/2026
Referencia: 001234567890
Beneficiario: 0414-1234567
Banco: 0134 Banesco
Monto: Bs. 1.250,00`)

    assert.equal(leido.referencia.valor, "001234567890")
    assert.equal(leido.montoBs.valor, 1250)
    assert.equal(leido.banco.valor?.codigo, "0134")
    assert.equal(leido.telefono.valor, "04141234567")
  })

  it("REGRESIÓN: la referencia no se come la línea siguiente", () => {
    // "Beneficiario" empieza por B, y soloDigitos() convierte la B en 8. Cuando
    // la captura cruzaba el salto de línea, la referencia salía con un 8 pegado
    // al final y no cuadraba jamás contra el banco.
    const leido = extraerCampos(`Referencia: 001234567890
Beneficiario: Juan Pérez`)

    assert.equal(leido.referencia.valor, "001234567890")
  })

  it("REGRESIÓN: 'Operación exitosa' no se traga la etiqueta buena", () => {
    // Casi todo comprobante empieza así, y coincide con la etiqueta `operación`
    // antes que el "Referencia:" de verdad. Quedándose con la primera
    // coincidencia se leía " exitosa" y la referencia se perdía.
    const leido = extraerCampos(`Operación exitosa
Su pago fue procesado
Referencia: 445566778899`)

    assert.equal(leido.referencia.valor, "445566778899")
    assert.ok(leido.referencia.confianza > 0.9, "debería ir con confianza alta")
  })

  it("no corta la referencia en el importe de la misma línea", () => {
    const leido = extraerCampos("Referencia: 12345678 Bs 500,00")
    assert.equal(leido.referencia.valor, "12345678")
  })

  it("lee el formato venezolano y no lo confunde con el inglés", () => {
    // 1.234,56 son mil doscientos treinta y cuatro con cincuenta y seis.
    // Leerlo al derecho inglés daría 1,23 y descuadraría por mil.
    assert.equal(extraerCampos("Monto: 1.234,56").montoBs.valor, 1234.56)
    assert.equal(extraerCampos("Monto: 2.400,75").montoBs.valor, 2400.75)
    assert.equal(extraerCampos("Monto: 850,50").montoBs.valor, 850.5)
  })

  it("también entiende el formato inglés cuando aparece", () => {
    assert.equal(extraerCampos("Monto: 1,234.56").montoBs.valor, 1234.56)
  })

  it("corrige las confusiones del OCR en la referencia", () => {
    // O->0, S->5, l->1, B->8: las que de verdad comete Tesseract sobre
    // capturas de banca en móvil.
    const leido = extraerCampos("Comprobante: O012345S78")
    assert.equal(leido.referencia.valor, "0012345578")
  })

  it("NO corrige esas letras fuera de los campos numéricos", () => {
    // Si se aplicara al texto libre, "Banesco" sería "8ane5co" y el banco no se
    // reconocería nunca.
    assert.equal(extraerCampos("Banesco").banco.valor?.codigo, "0134")
    assert.equal(extraerCampos("Bancamiga").banco.valor?.codigo, "0172")
  })

  it("no confunde el teléfono con la referencia", () => {
    const leido = extraerCampos(`Pago recibido
04141234567
Bs 300,00`)

    assert.equal(leido.telefono.valor, "04141234567")
    assert.notEqual(leido.referencia.valor, "04141234567")
  })

  it("descarta fechas imposibles en vez de meterlas", () => {
    // Una fecha de hace diez años es un error de lectura, no un pago.
    assert.equal(extraerCampos("Fecha: 02/09/2010").fecha.valor, null)
    assert.equal(extraerCampos("Fecha: 45/13/2026").fecha.valor, null)
  })

  it("avisa de los campos que no leyó con seguridad", () => {
    const vacio = extraerCampos("una imagen borrosa sin nada legible")
    assert.equal(vacio.referencia.valor, null)
    assert.equal(vacio.montoBs.valor, null)
  })
})

describe("bancos venezolanos", () => {
  it("reconoce por código de cuatro dígitos", () => {
    assert.equal(detectarBanco("Banco: 0102")?.nombre, "Banco de Venezuela")
    assert.equal(detectarBanco("0191")?.nombre, "BNC")
  })

  it("reconoce por nombre, con y sin acentos", () => {
    assert.equal(detectarBanco("BANCO CARONI")?.codigo, "0128")
    assert.equal(detectarBanco("Banco Caroní")?.codigo, "0128")
  })

  it("prefiere la coincidencia más específica", () => {
    // "banco nacional de credito" debe ganar a un "bnc" suelto.
    assert.equal(detectarBanco("Banco Nacional de Crédito")?.codigo, "0191")
  })

  it("el código manda sobre el nombre", () => {
    // Si la captura trae los dos y no coinciden, el código es el dato fiable:
    // el nombre puede venir de un pie de página o de un anuncio.
    assert.equal(detectarBanco("0134 - transferencia desde Mercantil")?.codigo, "0134")
  })

  it("no inventa un banco donde no lo hay", () => {
    assert.equal(detectarBanco("comprobante de pago"), null)
    assert.equal(detectarBanco(""), null)
  })

  it("no confunde un trozo de la referencia con un código", () => {
    // 0102 dentro de un número largo no es el Banco de Venezuela.
    assert.equal(detectarBanco("Referencia: 990102554433"), null)
  })
})
