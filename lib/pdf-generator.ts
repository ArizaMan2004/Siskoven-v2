"use client"

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
// ⚠️ IMPORTANTE: Necesitas instalar 'jsbarcode' para que esto funcione.
import JsBarcode from 'jsbarcode'; // <-- ACTIVADO

// ==============================================
// 🎨 CONFIGURACIÓN GENERAL (COLORES Y ESTILOS)
// ==============================================
const PRIMARY_COLOR = [79, 53, 248]        // Morado corporativo
const LIGHT_ROW = [245, 245, 250]          // Gris suave
const CARD_TEXT = [50, 50, 50]             // Gris oscuro
const SUCCESS_GREEN = [40, 167, 69]

const PRECIO_M2 = 15 // Precio base por metro²

// ==============================================
// 📦 TIPOS
// ==============================================
interface Product {
  id: string
  name: string
  category: string
  costUsd: number
  quantity: number
  profit: number
  saleType: "unit" | "weight" | "area"
  barcode?: string 
}

interface SaleItem {
  productId: string
  name: string
  quantity: number
  priceUsd: number
}

// ==============================================
// 🧮 CALCULAR PRECIO DE VENTA (PROFESIONAL)
// ==============================================
function calculateSalePrice(product: Product): number {
  const costUsd = Number(product.costUsd) || 0
  let profitDecimal = product.profit > 1 ? product.profit / 100 : product.profit

  if (!Number.isFinite(profitDecimal) || profitDecimal < 0 || profitDecimal >= 1) {
    profitDecimal = 0
  }

  const divisor = 1 - profitDecimal

  if (product.saleType === "area") {
    return PRECIO_M2 / divisor
  }

  if (costUsd <= 0) return 0

  return costUsd / divisor
}

// ==============================================
// 🧰 FUNCIÓN AUXILIAR: OBTENER BCV SEGURO
// ==============================================
function safeBCV(bcvRate: number): number {
  const rate = Number(bcvRate)
  return (rate > 0 && Number.isFinite(rate)) ? rate : 1
}

// ==============================================
// 🖼️ FUNCIÓN AUXILIAR: GENERAR CÓDIGO DE BARRAS (Data URL)
// ==============================================
function generateBarcodeDataURL(text: string, canvasWidth: number, canvasHeight: number): string | null {
  if (typeof window === "undefined" || !text) return null;
  
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // Lógica de JsBarcode activada
    if (typeof (window as any).JsBarcode !== 'undefined' || typeof JsBarcode !== 'undefined') {
      const barcodeFunc = (typeof JsBarcode !== 'undefined' ? JsBarcode : (window as any).JsBarcode);

      barcodeFunc(canvas, text, {
        format: "CODE128",       
        displayValue: false,     // Desactivamos el texto para posicionarlo con jspdf
        margin: 0,               
        width: 1.5,              // Ancho de la barra ajustado
        height: canvasHeight * 0.7, // Altura de la barra ajustada para ser baja
        background: "#ffffff",   
        lineColor: "#000000"     
      });
    } else {
      console.error("JsBarcode no está disponible. Asegúrate de haberlo instalado e importado correctamente.");
      return null;
    }

    return canvas.toDataURL("image/png");

  } catch (e) {
    console.error("Error al generar el código de barras:", e);
    return null;
  }
}


// ==============================================
// 📘 1. REPORTE DE INVENTARIO (CARTA) - AHORA MUESTRA EN PANTALLA
// ==============================================
export function generateInventoryReport(products: Product[], businessName: string, bcvRate: number) {
  const doc = new jsPDF({ format: "letter", unit: "mm" })
  const safeRate = safeBCV(bcvRate)

  // ENCABEZADO
  doc.setFillColor(...PRIMARY_COLOR)
  doc.rect(0, 0, 216, 20, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(255)
  doc.text("REPORTE DE INVENTARIO", 14, 12)

  // INFO
  doc.setTextColor(0)
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text(`Comercio: ${businessName}`, 14, 28)
  doc.text(`Fecha: ${new Date().toLocaleDateString("es-VE")}`, 14, 34)
  doc.text(`Tasa BCV: Bs ${safeRate.toFixed(2)}`, 14, 40) 

  const tableData = products.map((p) => {
    const priceUsd = calculateSalePrice(p)
    const priceBs = priceUsd * safeRate

    return [
      p.name,
      p.category,
      `${p.quantity}`,
      `$${p.costUsd.toFixed(2)}`,
      `$${priceUsd.toFixed(2)}`,
      `Bs ${priceBs.toFixed(2)}`,
    ]
  })

  autoTable(doc, {
    startY: 45,
    head: [["Producto", "Categoría", "Cantidad", "Costo (USD)", "Precio (USD)", "Precio (Bs)"]],
    body: tableData,
    styles: { fontSize: 9, cellPadding: 3, lineColor: 0, lineWidth: 0.1 },
    headStyles: { fillColor: PRIMARY_COLOR, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: LIGHT_ROW },
    margin: { left: 14, right: 14 },
  })

  // CAMBIO A PREVISUALIZACIÓN
  doc.output('dataurlnewwindow');
}


// ==============================================
// 📗 2. FACTURA EN PDF (CARTA PROFESIONAL) - AHORA MUESTRA EN PANTALLA
// ==============================================
export function generateInvoice(
  items: SaleItem[],
  businessName: string,
  totalBs: number,
  totalUsd: number,
  paymentMethod: string,
  bcvRate: number,
  discountApplied: number = 0 
) {
  const safeRate = safeBCV(bcvRate)
  const doc = new jsPDF({ format: "letter", unit: "mm" })

  const discountRate = discountApplied / 100
  const rateFactor = 1 - discountRate

  // ENCABEZADO PROFESIONAL
  doc.setFillColor(...PRIMARY_COLOR)
  doc.rect(0, 0, 216, 20, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(255)
  doc.text(businessName.toUpperCase(), 14, 10)
  doc.setFontSize(13)
  doc.text("FACTURA DE VENTA", 14, 16)

  // INFO
  doc.setTextColor(0)
  doc.setFontSize(10)
  doc.text(`Fecha: ${new Date().toLocaleString("es-VE")}`, 150, 28)
  doc.text(`Método de Pago: ${paymentMethod.toUpperCase()}`, 14, 28)
  doc.text(`Tasa BCV: Bs ${safeRate.toFixed(2)}`, 14, 34)

  if (discountApplied > 0) {
    doc.setTextColor(...SUCCESS_GREEN)
    doc.text(`Descuento aplicado: ${discountApplied}%`, 14, 40)
    doc.setTextColor(0)
  }

  // TABLA
  const tableData = items.map((item, index) => {
    const priceUsdDiscounted = item.priceUsd * rateFactor
    const totalLineUsdDiscounted = priceUsdDiscounted * item.quantity 
    const totalLineBs = totalLineUsdDiscounted * safeRate

    return [
      (index + 1).toString(),
      item.name,
      `${item.quantity}`,
      `$${priceUsdDiscounted.toFixed(2)}`, 
      `Bs ${totalLineBs.toFixed(2)}`,
    ]
  })

  autoTable(doc, {
    startY: 48,
    head: [["#", "Producto", "Cantidad", "Precio USD (Desc.)", "Total Bs"]],
    body: tableData,
    styles: { fontSize: 10, cellPadding: 3, lineColor: 0, lineWidth: 0.1 },
    headStyles: { fillColor: PRIMARY_COLOR, textColor: 255 },
    alternateRowStyles: { fillColor: LIGHT_ROW },
    margin: { left: 14, right: 14 },
  })

  // TOTALES
  const finalY = (doc as any).lastAutoTable.finalY + 10

  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text("TOTAL USD:", 140, finalY)
  doc.text(`$${totalUsd.toFixed(2)}`, 200, finalY, { align: "right" })

  doc.setFontSize(14)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text("TOTAL BS:", 140, finalY + 8)
  doc.setFontSize(20)
  doc.text(`Bs ${totalBs.toFixed(2)}`, 200, finalY + 16, { align: "right" })
  doc.setTextColor(0)

  doc.setFontSize(8)
  doc.text("Gracias por su compra.", 14, finalY + 26)

  // CAMBIO A PREVISUALIZACIÓN
  doc.output('dataurlnewwindow');
}


// ==============================================
// 📘 3. ETIQUETAS DE PRODUCTOS (CARTA – LANDSCAPE) - AHORA MUESTRA EN PANTALLA
// ==============================================
export function generateProductLabels(products: Product[], bcvRate: number) {
  const safeRate = safeBCV(bcvRate)
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" }) 

  const labelsPerRow = 4
  const labelsPerColumn = 4
  const labelWidth = 60 
  const labelHeight = 50 
  const marginLeft = 10
  const marginTop = 15
  const horizontalSpace = 65
  const verticalSpace = 55 
  const labelCenterX = labelWidth / 2;

  const productsWithBarcode = products.filter(p => p.barcode);

  productsWithBarcode.forEach((p, i) => {
    
    const salePrice = calculateSalePrice(p)
    const salePriceBs = salePrice * safeRate

    const row = Math.floor(i / labelsPerRow) % labelsPerColumn
    const col = i % labelsPerRow

    const x = marginLeft + col * horizontalSpace
    const y = marginTop + row * verticalSpace

    // Marco exterior para el corte (BORDE NEGRO)
    doc.setDrawColor(0) // Negro
    doc.setLineWidth(0.2)
    doc.rect(x, y, labelWidth, labelHeight)

    // --- SECCIÓN SUPERIOR: INFO y TASA ---
    
    // 1. Tasa y tipo de venta (Pequeño, arriba a la izquierda)
    doc.setFontSize(7)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...CARD_TEXT) // Gris oscuro
    doc.text(`Venta: ${p.saleType.toUpperCase()} | Tasa: ${safeRate.toFixed(2)} Bs/$`, x + 3, y + 4)
    
    // Línea de separación sutil con el color primario
    doc.setDrawColor(...PRIMARY_COLOR) 
    doc.setLineWidth(0.5)
    doc.line(x + 3, y + 5.5, x + labelWidth - 3, y + 5.5)

    // 2. Nombre del producto (GRANDE Y AJUSTABLE)
    doc.setFont("helvetica", "bold")
    let fontSize = 16 // Tamaño inicial grande
    const maxWidth = labelWidth - 6 
    while (doc.getTextWidth(p.name.toUpperCase()) > maxWidth && fontSize > 10) {
      fontSize -= 0.5
      doc.setFontSize(fontSize)
    }
    doc.setTextColor(0) // Negro para el nombre
    doc.text(p.name.toUpperCase(), x + 3, y + 12) // Desplazado 2mm hacia abajo por la línea

    // 3. Precio en Bs (POSICIÓN DEL SKU)
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...CARD_TEXT) // Gris oscuro para el precio en Bs
    doc.text(`PRECIO BS: ${salePriceBs.toFixed(2)}`, x + 3, y + 17) 


    // --- SECCIÓN MEDIA: PRECIO USD (EL MÁS GRANDE Y CON COLOR) ---
    const USD_Y_START = 22; 
    
    doc.setFontSize(28) // TAMAÑO GIGANTE para precio USD
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...PRIMARY_COLOR) // Color corporativo
    
    // El valor del precio USD (Alineado a la derecha)
    doc.text(`$${salePrice.toFixed(2)}`, x + labelWidth - 3, y + USD_Y_START + 8, { align: "right" })

    // --- SECCIÓN INFERIOR: CÓDIGO DE BARRAS ---
    
    const BARCODE_HEIGHT_MM = 8; // Altura baja
    const BARCODE_WIDTH_MM = labelWidth - 8; 
    
    // Posicionamiento justo arriba del borde inferior
    const BARCODE_Y_START = y + labelHeight - BARCODE_HEIGHT_MM - 6; 
    // Separación aumentada
    const BARCODE_TEXT_Y = BARCODE_Y_START + BARCODE_HEIGHT_MM + 2.5; 

    if (p.barcode) {
        // Generar la URL de datos. 
        const barcodeDataURL = generateBarcodeDataURL(p.barcode, 400, 70); 
        
        if (barcodeDataURL) {
            // Incrustar la imagen del código de barras
            doc.addImage(
                barcodeDataURL, 
                'PNG', 
                x + 4, // Margen de 4mm
                BARCODE_Y_START, 
                BARCODE_WIDTH_MM, 
                BARCODE_HEIGHT_MM 
            );
        }

        // Imprimir el número legible del código de barras (muy pequeño y centrado)
        doc.setFontSize(6); 
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...CARD_TEXT); // Gris oscuro
        doc.text(p.barcode, x + labelCenterX, BARCODE_TEXT_Y, { align: "center" });
    }

    if ((i + 1) % (labelsPerRow * labelsPerColumn) === 0 && i + 1 < productsWithBarcode.length) {
      doc.addPage()
    }
  })

  // CAMBIO A PREVISUALIZACIÓN
  doc.output('dataurlnewwindow');
}