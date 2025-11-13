"use client"

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const PRECIO_M2 = 15 // Precio base por m²

interface Product {
  id: string
  name: string
  category: string
  costUsd: number
  quantity: number
  profit: number
  saleType: "unit" | "weight" | "area"
}

interface SaleItem {
  productId: string
  name: string
  quantity: number
  priceUsd: number
  priceBs: number
}

// ===============================================
// 🎯 Lógica unificada para calcular el precio de venta (MARGEN BRUTO)
// ===============================================
function calculateSalePrice(product: Product): number {
  let profitDecimal = product.profit > 1 ? product.profit / 100 : product.profit
  
  // Manejo de errores/valores no deseados: El margen debe ser menor a 100% (1.0)
  if (isNaN(profitDecimal) || profitDecimal < 0 || profitDecimal >= 1) {
    profitDecimal = 0; 
  }

  // 💡 Divisor de la fórmula de Margen Bruto: 1 - Margen en decimal
  const divisor = 1 - profitDecimal;
  
  switch (product.saleType) {
    case "unit":
    case "weight": {
      // Precio de Venta = Costo / (1 - Margen en decimal)
      const salePrice = product.costUsd / divisor;
      return Number.isFinite(salePrice) ? salePrice : 0
    }
    case "area": {
      // Precio de Venta m² = Costo Base / (1 - Margen en decimal)
      const salePrice = PRECIO_M2 / divisor;
      return Number.isFinite(salePrice) ? salePrice : 0
    }
    default:
      return 0
  }
}
// ===============================================


/**
 * Genera un reporte de inventario en PDF (Diseño Profesional)
 */
export function generateInventoryReport(products: Product[], businessName: string, bcvRate: number) {
  const doc = new jsPDF()

  // 1. Título y Cabecera
  doc.setFontSize(20)
  doc.setFont("helvetica", "bold")
  doc.text("REPORTE DE INVENTARIO", 14, 15)
  
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text(`Comercio: ${businessName}`, 14, 22)
  
  // Línea divisoria elegante (color primario)
  doc.setDrawColor(79, 53, 248) 
  doc.setLineWidth(0.5)
  doc.line(14, 25, 200, 25) 

  // Detalles secundarios
  doc.text(`Fecha de Reporte: ${new Date().toLocaleDateString("es-VE")}`, 14, 32)
  doc.text(`Tasa BCV: Bs ${bcvRate.toFixed(2)}`, 14, 38)

  const tableData = products.map((p) => {
    const salePrice = calculateSalePrice(p)
    const salePriceBs = salePrice * bcvRate

    return [
      p.name,
      p.category,
      `${p.quantity}`,
      `$${p.costUsd.toFixed(2)}`, 
      `$${salePrice.toFixed(2)}`,
      `Bs ${salePriceBs.toFixed(2)}`,
    ]
  })

  // 2. Tabla (con estilos de filas alternas)
  autoTable(doc, {
    startY: 45, 
    head: [["Producto", "Categoría", "Cantidad", "Costo Unidad USD", "Precio USD", "Precio Bs"]],
    body: tableData,
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [79, 53, 248], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    margin: { top: 40, left: 14, right: 14 }
  })

  doc.save(`inventario_${new Date().toISOString().slice(0, 10)}.pdf`)
}

/**
 * Genera una factura PDF (Diseño Profesional)
 */
export function generateInvoice(
  items: SaleItem[],
  businessName: string,
  totalBs: number,
  totalUsd: number,
  paymentMethod: string,
  bcvRate: number,
) {
  const doc = new jsPDF()

  // 1. Bloque de Título Profesional (Color Primario)
  doc.setFillColor(79, 53, 248) 
  doc.rect(0, 0, 210, 20, "F") // Rectángulo azul/morado en la parte superior
  doc.setFontSize(18)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(255) // Texto blanco
  doc.text(businessName.toUpperCase(), 14, 10)
  doc.setFontSize(12)
  doc.text("FACTURA DE VENTA", 14, 16)
  
  // Restablecer color de texto a negro
  doc.setTextColor(0) 

  // 2. Detalles de la Factura
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text(`Fecha: ${new Date().toLocaleString("es-VE")}`, 150, 25)
  doc.text(`Método de Pago: ${paymentMethod.toUpperCase()}`, 14, 25)
  doc.text(`Tasa BCV: Bs ${bcvRate.toFixed(2)}`, 14, 30)

  const tableData = items.map((item, index) => [
    (index + 1).toString(),
    item.name,
    `${item.quantity}`,
    `$${item.priceUsd.toFixed(2)}`,
    `Bs ${(item.priceBs).toFixed(2)}`, 
  ])

  // 3. Tabla (con estilos de filas alternas)
  autoTable(doc, {
    startY: 40,
    head: [["#", "Producto", "Cantidad", "Precio USD (Unit)", "Total Bs (Línea)"]], 
    body: tableData,
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [79, 53, 248], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    margin: { top: 40, left: 14, right: 14 }
  })

  // 4. Totales (Bloque destacado)
  const finalY = (doc as any).lastAutoTable.finalY + 10
  const marginX = 140
  
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)

  // Total USD
  doc.text("TOTAL USD:", marginX, finalY)
  doc.text(`$${totalUsd.toFixed(2)}`, 190, finalY, { align: "right" })

  // Total Bs (Más grande y en color primario)
  doc.setFontSize(14)
  doc.setTextColor(79, 53, 248) 
  doc.text("TOTAL BS:", marginX, finalY + 8)
  doc.text(`Bs ${totalBs.toFixed(2)}`, 190, finalY + 8, { align: "right" })
  doc.setTextColor(0) // Reset color

  doc.setFontSize(8)
  doc.text("Gracias por su compra.", 14, finalY + 20)

  doc.save(`factura_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.pdf`)
}

/**
 * Genera etiquetas de productos en PDF (Diseño Limpio)
 */
export function generateProductLabels(products: Product[], bcvRate: number) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" })

  const labelsPerRow = 4
  const labelsPerColumn = 4
  const marginLeft = 10
  const marginTop = 15
  const horizontalSpace = 65
  const verticalSpace = 50
  const labelWidth = 60
  const labelHeight = 45

  products.forEach((p, index) => {
    const salePrice = calculateSalePrice(p)
    const salePriceBs = salePrice * bcvRate

    const row = Math.floor(index / labelsPerRow) % labelsPerColumn
    const col = index % labelsPerRow

    const x = marginLeft + col * horizontalSpace
    const y = marginTop + row * verticalSpace

    // Borde más sutil
    doc.setDrawColor(180) 
    doc.setLineWidth(0.5)
    doc.rect(x, y, labelWidth, labelHeight)

    // Nombre del producto
    doc.setFont("helvetica", "bold")
    let fontSize = 14 // Tamaño inicial
    const maxTextWidth = labelWidth - 4; // 56 mm de espacio seguro (de 60mm total)
    let text = p.name.toUpperCase();
    
    // ⭐️ LÓGICA DE AJUSTE DE FUENTE
    // Decrementa la fuente hasta que el texto quepa (mínimo 8pt)
    while (doc.getTextWidth(text) > maxTextWidth && fontSize > 8) {
      fontSize -= 0.5;
      doc.setFontSize(fontSize);
    }
    // ⭐️ FIN LÓGICA DE AJUSTE DE FUENTE

    doc.setFontSize(fontSize)
    doc.text(text, x + labelWidth / 2, y + 10, { align: "center" })

    // Precio USD (Elemento dominante)
    doc.setFontSize(28)
    doc.setTextColor(79, 53, 248) // Color primario
    doc.text(`$${salePrice.toFixed(2)}`, x + labelWidth / 2, y + 27, { align: "center" })

    // Precio Bs (Secundario)
    doc.setFontSize(11)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(50) // Gris oscuro
    doc.text(`(Bs ${salePriceBs.toFixed(2)})`, x + labelWidth / 2, y + 37, { align: "center" })
    
    // Tipo de venta
    doc.setFontSize(8)
    doc.setFont("helvetica", "italic")
    doc.text(`Venta: ${p.saleType.toUpperCase()}`, x + labelWidth / 2, y + 43, { align: "center" })

    doc.setTextColor(0) // Reset color

    if ((index + 1) % (labelsPerRow * labelsPerColumn) === 0 && index + 1 < products.length) {
      doc.addPage()
    }
  })

  doc.save("etiquetas_productos.pdf")
}