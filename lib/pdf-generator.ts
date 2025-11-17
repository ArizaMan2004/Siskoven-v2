// pdf-generator.ts

"use client"

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import JsBarcode from 'jsbarcode'; 

// ==============================================
// 🎨 CONFIGURACIÓN GENERAL (COLORES Y ESTILOS)
// ==============================================
const PRIMARY_COLOR = [79, 53, 248]        
const LIGHT_ROW = [245, 245, 250]          
const CARD_TEXT = [50, 50, 50]             
const HEADER_DARK = [44, 52, 60]           
const PRECIO_M2 = 15 
// Tasa de IVA establecida al 16%
const IVA_RATE = 0.16; 

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

// Interfaz para los items dentro del carrito de la venta
export interface SaleItem {
  productId: string
  name: string
  quantity: number
  priceUsd: number
}

// Interfaz Sale (ajustada para el DB)
export interface Sale { 
    id: string; 
    cart: SaleItem[]; 
    totalBs: number;
    totalUsd: number; // Este valor es el TOTAL CON IVA (Gran Total)
    paymentMethod: string;
    bcvRate: number;
    
    clientInfo: { 
        name: string;
        document: string;
        address: string;
        phone: string;
    } | null | undefined; 

    createdAt: { toDate: () => Date } | null | undefined; 
    
    discountUsd?: number;
    ivaUsd?: number;
    subtotalUsd?: number;
} 

// Interfaz completa de BusinessInfo 
export interface BusinessInfo { 
    businessName: string; 
    logoBase64: string; 
    fiscalAddress: string; 
    fiscalDocument: string; 
    phoneNumber: string; 
    email: string; 
    bankName: string; 
    bankAccountOwner: string; 
    bankAccountNumber: string; 
} 

// ==============================================
// 🎯 FUNCIÓN AUXILIAR: FORMATO BS
// ==============================================
function formatBs(amount: number): string {
    return Number(amount).toLocaleString('es-VE', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    });
}


// ==============================================
// 🧮 CALCULAR PRECIO DE VENTA
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
// 🖼️ FUNCIÓN AUXILIAR: GENERAR CÓDIGO DE BARRAS
// ==============================================
function generateBarcodeDataURL(text: string, canvasWidth: number, canvasHeight: number): string | null {
  if (typeof window === "undefined" || !text) return null;
  
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    if (typeof JsBarcode !== 'undefined') {
      JsBarcode(canvas, text, {
        format: "CODE128",       
        displayValue: false,     
        margin: 0,               
        width: 1.5,              
        height: canvasHeight * 0.7, 
        background: "#ffffff",   
        lineColor: "#000000"     
      });
    } else {
      console.error("JsBarcode no está disponible. No se pudo generar el código de barras.");
      return null;
    }

    return canvas.toDataURL("image/png");

  } catch (e) {
    console.error("Error al generar el código de barras:", e);
    return null;
  }
}


// ==============================================
// 📘 1. REPORTE DE INVENTARIO (CARTA) - LA SECCIÓN REQUERIDA
// ==============================================
export function generateInventoryReport(products: Product[], businessInfo: BusinessInfo, bcvRate: number) {
  const doc = new jsPDF({ format: "letter", unit: "mm" })
  const safeRate = safeBCV(bcvRate)

  // Coordenadas base
  const MARGIN_LEFT = 14
  const MARGIN_TOP = 10
  const REPORT_BLOCK_X = 135
  const REPORT_BLOCK_WIDTH = 70
  const LINE_HEIGHT = 5
  
  // -----------------------------------------------------
  // 1. ENCABEZADO DE LA EMPRESA (IZQUIERDA) - LÓGICA DE FACTURA
  // -----------------------------------------------------

  // A. Logo 
  // ❗ CORRECCIÓN: Si businessInfo.logoBase64 está vacío o nulo, el logo no se muestra.
  // La lógica es correcta, el problema está en los datos de entrada.
  if (businessInfo.logoBase64) {
    try {
      doc.addImage(
        businessInfo.logoBase64,
        'PNG',
        MARGIN_LEFT,
        MARGIN_TOP,
        20,
        20
      );
    } catch (e) {
      console.error("Error al añadir la imagen del logo:", e);
    }
  }

  // B. Nombre del Negocio
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.setTextColor(...HEADER_DARK)
  // ❗ CORRECCIÓN: Si businessInfo.businessName está vacío o nulo, se muestra "N/A".
  // La lógica es correcta, debe asegurarse que se pasa el nombre.
  doc.text((businessInfo.businessName || "N/A").toUpperCase(), MARGIN_LEFT + 22, MARGIN_TOP + 5)
  
  // C. RIF y Contacto (Similar a la factura)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`RIF: ${businessInfo.fiscalDocument || "N/A"}`, MARGIN_LEFT + 22, MARGIN_TOP + 10)
  doc.text(`Dirección: ${businessInfo.fiscalAddress || "N/A"}`, MARGIN_LEFT + 22, MARGIN_TOP + 15)
  doc.text(`Teléfono: ${businessInfo.phoneNumber || "N/A"}`, MARGIN_LEFT + 22, MARGIN_TOP + 20)
  
  // -----------------------------------------------------
  // 2. BLOQUE REPORTE (DERECHA) - ESTÉTICA FACTURA
  // -----------------------------------------------------
  // Se usa HEADER_DARK como en el encabezado de la factura
  doc.setFillColor(...HEADER_DARK) 
  doc.rect(REPORT_BLOCK_X - 10, 0, REPORT_BLOCK_WIDTH + 10, 30, "F") 

  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(255) 
  doc.text("REPORTE DE", REPORT_BLOCK_X + 10, MARGIN_TOP + 8)
  doc.text("INVENTARIO", REPORT_BLOCK_X + 10, MARGIN_TOP + 16)
  
  // -----------------------------------------------------
  // 3. INFORMACIÓN DEL REPORTE
  // -----------------------------------------------------
  const INFO_Y_START = 45 

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...CARD_TEXT)
  
  doc.text("GENERADO:", MARGIN_LEFT, INFO_Y_START)
  doc.text("TASA BCV:", MARGIN_LEFT, INFO_Y_START + LINE_HEIGHT)
  
  doc.setFont("helvetica", "normal")
  
  doc.text(`${new Date().toLocaleDateString("es-VE")}`, MARGIN_LEFT + 25, INFO_Y_START)
  doc.text(`Bs ${formatBs(safeRate)}`, MARGIN_LEFT + 25, INFO_Y_START + LINE_HEIGHT)
  
  const TABLE_START_Y = INFO_Y_START + LINE_HEIGHT * 2 + 5

  const tableData = products.map((p) => {
    // 1. Precio sin IVA (Precio Base/Neto)
    const priceUsdNoIva = calculateSalePrice(p)
    // 2. Precio con IVA (PVP)
    const priceUsdConIva = priceUsdNoIva * (1 + IVA_RATE)
    // 3. Precio con IVA en Bolívares (Precio Final al público)
    const priceBsConIva = priceUsdConIva * safeRate

    return [
      p.name,
      p.category,
      `${p.quantity}`,
      `$${p.costUsd.toFixed(2)}`,
      `$${priceUsdNoIva.toFixed(2)}`, 
      `$${priceUsdConIva.toFixed(2)}`,
      `Bs ${formatBs(priceBsConIva)}`, 
    ]
  })

  // -----------------------------------------------------
  // 4. TABLA DE INVENTARIO
  // -----------------------------------------------------

  autoTable(doc, {
    startY: TABLE_START_Y,
    head: [["Producto", "Categoría", "Cantidad", "Costo (USD)", "Precio USD (Sin IVA)", "Precio USD (Con IVA)", "Precio Bs (Con IVA)"]],
    body: tableData,
    styles: { fontSize: 9, cellPadding: 3, lineColor: 0, lineWidth: 0.1 },
    // Usa el mismo color HEADER_DARK para la tabla de encabezado que la factura
    headStyles: { fillColor: HEADER_DARK, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: LIGHT_ROW },
    margin: { left: MARGIN_LEFT, right: 14 },
    columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
    }
  })

  // -----------------------------------------------------
  // 5. PIE DE PÁGINA Y CONTACTO (Estética Factura)
  // -----------------------------------------------------
  const FOOTER_Y = 260 

  doc.setLineWidth(0.1)
  doc.setDrawColor(200)
  doc.line(MARGIN_LEFT, FOOTER_Y, 216 - MARGIN_LEFT, FOOTER_Y) 

  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...CARD_TEXT)

  const contactInfo = [
    { label: "Dirección:", value: businessInfo.fiscalAddress },
    { label: "Teléfono:", value: businessInfo.phoneNumber },
    { label: "Email:", value: businessInfo.email },
  ];
  
  contactInfo.forEach((item, index) => {
    const xPos = MARGIN_LEFT + index * 60; 
    
    doc.setFont("helvetica", "bold")
    doc.text(item.label, xPos, FOOTER_Y + 5)
    
    doc.setFont("helvetica", "normal")
    doc.text(item.value || "N/A", xPos, FOOTER_Y + 9)
  })

  // Nota de pie de página para aclarar que no es fiscal
  doc.setFontSize(7)
  doc.setFont("helvetica", "italic")
  doc.setTextColor(150)
  doc.text("Este es un reporte interno de inventario y no constituye un documento fiscal.", 216 - 14, FOOTER_Y + 9, { align: 'right' })


  doc.output('dataurlnewwindow');
}


// ==============================================
// 📗 2. FACTURA EN PDF (CARTA PROFESIONAL) - MANTENIDA
// ==============================================
export function generateInvoice(
  businessInfo: BusinessInfo, 
  sale: Sale, 
) {
  
  const safeRate = safeBCV(sale.bcvRate)
  const items: SaleItem[] = (sale as any).cart || (sale as any).items || [] 

  // 🔑 CORRECCIÓN: CALCULO INVERSO PARA DESGLOSAR EL IVA
  // sale.totalUsd es el Gran Total (con IVA)
  const grandTotalUsd = sale.totalUsd; 
  const grandTotalBs = sale.totalBs;
  
  // 1. Calcular la Base Imponible (Subtotal antes de impuestos)
  const preTaxSubtotalUsd = grandTotalUsd / (1 + IVA_RATE); 
  
  // 2. Calcular el Monto del Impuesto (IVA) por diferencia
  const ivaUsdCalculated = grandTotalUsd - preTaxSubtotalUsd;

  
  const doc = new jsPDF({ format: "letter", unit: "mm" })
  
  const invoiceDate = sale.createdAt && typeof sale.createdAt.toDate === 'function' 
    ? sale.createdAt.toDate() 
    : new Date(); 
  
  const dateStr = invoiceDate.toLocaleDateString("es-VE"); 
  
  const invoiceNumber = sale.id 
    ? sale.id.substring(0, 6).toUpperCase() 
    : "N/A"; 

  // Coordenadas base
  const MARGIN_LEFT = 14
  const MARGIN_TOP = 10
  const INVOICE_BLOCK_X = 135
  const INVOICE_BLOCK_WIDTH = 70
  const LINE_HEIGHT = 5

  // -----------------------------------------------------
  // 1. ENCABEZADO DE LA EMPRESA (IZQUIERDA)
  // -----------------------------------------------------

  // A. Logo 
  if (businessInfo.logoBase64) {
    try {
      doc.addImage(
        businessInfo.logoBase64,
        'PNG',
        MARGIN_LEFT,
        MARGIN_TOP,
        20,
        20
      );
    } catch (e) {
      console.error("Error al añadir la imagen del logo:", e);
    }
  }

  // B. Nombre del Negocio
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.setTextColor(...HEADER_DARK)
  doc.text((businessInfo.businessName || "").toUpperCase(), MARGIN_LEFT + 22, MARGIN_TOP + 5)
  
  // C. RIF
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`RIF: ${businessInfo.fiscalDocument || "N/A"}`, MARGIN_LEFT + 22, MARGIN_TOP + 10)


  // -----------------------------------------------------
  // 2. BLOQUE FACTURA (DERECHA)
  // -----------------------------------------------------
  doc.setFillColor(...HEADER_DARK)
  doc.rect(INVOICE_BLOCK_X - 10, 0, INVOICE_BLOCK_WIDTH + 10, 30, "F") 

  doc.setFont("helvetica", "bold")
  doc.setFontSize(24)
  doc.setTextColor(255) 
  doc.text("FACTURA", INVOICE_BLOCK_X + 10, MARGIN_TOP + 10)

  // -----------------------------------------------------
  // 3. INFORMACIÓN DE CLIENTE Y FACTURA
  // -----------------------------------------------------
  const INFO_Y_START = 45
  
  const clientInfo = sale.clientInfo || {}; 
  const clientName = clientInfo.name || "Consumidor Final";
  const clientDocument = clientInfo.document || "V-00000000";
  const clientAddress = clientInfo.address || "N/A";
  const clientPhone = clientInfo.phone || "N/A";
  
  // A. Destinatario 
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...CARD_TEXT)
  doc.text("Facturado a:", MARGIN_LEFT, INFO_Y_START)
  
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  
  doc.text(clientName, MARGIN_LEFT, INFO_Y_START + LINE_HEIGHT)
  doc.text(`Doc/RIF: ${clientDocument}`, MARGIN_LEFT, INFO_Y_START + LINE_HEIGHT * 2) 
  doc.text(`Dirección: ${clientAddress}`, MARGIN_LEFT, INFO_Y_START + LINE_HEIGHT * 3) 
  doc.text(`Teléfono: ${clientPhone}`, MARGIN_LEFT, INFO_Y_START + LINE_HEIGHT * 4) 

  // B. Datos de Factura
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...CARD_TEXT)
  doc.text("No. Factura:", INVOICE_BLOCK_X, INFO_Y_START)
  doc.text("Fecha:", INVOICE_BLOCK_X, INFO_Y_START + LINE_HEIGHT)
  doc.text("Tasa BCV:", INVOICE_BLOCK_X, INFO_Y_START + LINE_HEIGHT * 2)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text(`${invoiceNumber}`, INVOICE_BLOCK_X + 25, INFO_Y_START)
  doc.text(dateStr, INVOICE_BLOCK_X + 25, INFO_Y_START + LINE_HEIGHT)
  doc.text(`Bs ${formatBs(safeRate)}`, INVOICE_BLOCK_X + 25, INFO_Y_START + LINE_HEIGHT * 2) 


  // -----------------------------------------------------
  // 4. TABLA DE PRODUCTOS
  // -----------------------------------------------------
  const TABLE_START_Y = INFO_Y_START + LINE_HEIGHT * 6 

  const tableData = items.map((item, index) => { 
    const priceUsdFinal = item.priceUsd; 
    const totalLineUsd = item.quantity * priceUsdFinal; 

    return [
      (index + 1).toString(),
      item.name,
      `${item.quantity}`,
      `$${priceUsdFinal.toFixed(2)}`, 
      `$${totalLineUsd.toFixed(2)}`,
    ]
  })
  
  const headStyles = { 
    fillColor: HEADER_DARK, 
    textColor: 255, 
    fontStyle: "bold",
    halign: 'left', 
    cellPadding: 3, 
  }
  
  const columnStyles = {
    0: { cellWidth: 10, halign: 'center' },
    1: { cellWidth: 100, halign: 'left' },
    2: { cellWidth: 20, halign: 'center' },
    3: { cellWidth: 30, halign: 'right' },
    4: { cellWidth: 30, halign: 'right' },
  };


  autoTable(doc, {
    startY: TABLE_START_Y,
    head: [["No.", "Descripción del Ítem", "Cant.", "Precio USD", "Total USD"]],
    body: tableData,
    styles: { fontSize: 10, cellPadding: 3, lineColor: 0, lineWidth: 0.1 },
    headStyles: headStyles,
    alternateRowStyles: { fillColor: LIGHT_ROW },
    margin: { left: MARGIN_LEFT, right: 14 },
    columnStyles: columnStyles,
  })

  const finalY = (doc as any).lastAutoTable.finalY + 10
  let currentY = finalY;

  // -----------------------------------------------------
  // 5. TOTALES (ESQUINA INFERIOR DERECHA) - CORREGIDO
  // -----------------------------------------------------
  const TOTAL_BLOCK_X = 145; 
  const TOTAL_BLOCK_WIDTH = 60;
  const TOTAL_VALUE_X = (TOTAL_BLOCK_X - 10) + TOTAL_BLOCK_WIDTH; // 195
  const TOTAL_ROW_HEIGHT = 8;
  
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)

  // Subtotal USD (Base Imponible)
  doc.setFillColor(...LIGHT_ROW)
  doc.rect(TOTAL_BLOCK_X - 10, currentY, TOTAL_BLOCK_WIDTH, TOTAL_ROW_HEIGHT, "F")
  doc.setTextColor(...CARD_TEXT)
  doc.text("SUBTOTAL USD:", TOTAL_BLOCK_X, currentY + 4) 
  // Usar el Subtotal antes de IVA
  doc.text(`$${preTaxSubtotalUsd.toFixed(2)}`, TOTAL_VALUE_X, currentY + 4, { align: "right" })
  currentY += TOTAL_ROW_HEIGHT;

  // Impuestos (16%)
  doc.setFillColor(...LIGHT_ROW)
  doc.rect(TOTAL_BLOCK_X - 10, currentY, TOTAL_BLOCK_WIDTH, TOTAL_ROW_HEIGHT, "F")
  doc.setTextColor(...CARD_TEXT)
  doc.text(`IMPUESTO (${(IVA_RATE * 100).toFixed(0)}%):`, TOTAL_BLOCK_X, currentY + 4)
  // Usar el IVA calculado
  doc.text(`$${ivaUsdCalculated.toFixed(2)}`, TOTAL_VALUE_X, currentY + 4, { align: "right" })
  currentY += TOTAL_ROW_HEIGHT;

  // TOTAL USD (Gran Total)
  const TOTAL_USD_HEIGHT = TOTAL_ROW_HEIGHT * 1.2; 
  const TEXT_Y_TOTAL_USD = 5; 
  
  doc.setFillColor(...HEADER_DARK) 
  doc.rect(TOTAL_BLOCK_X - 10, currentY, TOTAL_BLOCK_WIDTH, TOTAL_USD_HEIGHT, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(255) 
  doc.text("TOTAL USD:", TOTAL_BLOCK_X, currentY + TEXT_Y_TOTAL_USD)
  // Usar el Gran Total original
  doc.text(`$${grandTotalUsd.toFixed(2)}`, TOTAL_VALUE_X, currentY + TEXT_Y_TOTAL_USD, { align: "right" })
  currentY += TOTAL_USD_HEIGHT;
  
  // Total BS (Gran Total)
  const BS_OFFSET_START = 5; 
  currentY += BS_OFFSET_START; 
  
  doc.setFontSize(14)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text("TOTAL BS:", TOTAL_BLOCK_X, currentY)
  
  currentY += 8; 
  
  doc.setFontSize(18)
  // Usar el Gran Total en Bolívares original
  doc.text(`Bs ${formatBs(grandTotalBs)}`, TOTAL_VALUE_X, currentY, { align: "right" }) 
  doc.setTextColor(0)
  
  
  // -----------------------------------------------------
  // 6. INFORMACIÓN DE PAGO (INFERIOR IZQUIERDA)
  // -----------------------------------------------------
  const PAYMENT_Y_START = finalY 
  
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...HEADER_DARK)
  doc.text("Información de Pago", MARGIN_LEFT, PAYMENT_Y_START)
  
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...CARD_TEXT)

  const accountInfo = [
    `Banco: ${businessInfo.bankName || 'No configurado'}`,
    `Titular: ${businessInfo.bankAccountOwner || 'No configurado'}`,
    `Cuenta: ${businessInfo.bankAccountNumber || 'No configurado'}`
  ]
  
  accountInfo.forEach((line, index) => {
    doc.text(line, MARGIN_LEFT, PAYMENT_Y_START + (index + 1) * LINE_HEIGHT)
  })


  // -----------------------------------------------------
  // 7. PIE DE PÁGINA Y CONTACTO
  // -----------------------------------------------------
  const FOOTER_Y = 260 

  doc.setLineWidth(0.1)
  doc.setDrawColor(200)
  doc.line(MARGIN_LEFT, FOOTER_Y, 216 - MARGIN_LEFT, FOOTER_Y) 

  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...CARD_TEXT)

  const contactInfo = [
    { label: "Dirección:", value: businessInfo.fiscalAddress },
    { label: "Teléfono:", value: businessInfo.phoneNumber },
    { label: "Email:", value: businessInfo.email },
  ];
  
  contactInfo.forEach((item, index) => {
    const xPos = MARGIN_LEFT + index * 60; 
    
    doc.setFont("helvetica", "bold")
    doc.text(item.label, xPos, FOOTER_Y + 5)
    
    doc.setFont("helvetica", "normal")
    doc.text(item.value || "N/A", xPos, FOOTER_Y + 9)
  })

  // Firma Autorizada
  doc.setFont("helvetica", "normal")
  doc.text("Firma Autorizada", 155, FOOTER_Y + 12, { align: 'center' })
  doc.setDrawColor(0)
  doc.line(130, FOOTER_Y + 11, 180, FOOTER_Y + 11) 

  doc.output('dataurlnewwindow');
}


// ==============================================
// 📘 3. ETIQUETAS DE PRODUCTOS (CARTA – LANDSCAPE) - MANTENIDA
// ==============================================
export function generateProductLabels(products: Product[], bcvRate: number) {
  const safeRate = safeBCV(bcvRate)
  const productsWithBarcode = products.filter(p => p.barcode);
    
  if (productsWithBarcode.length === 0) {
      alert("No hay productos con códigos de barras registrados para generar etiquetas.");
      return;
  }
    
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

  productsWithBarcode.forEach((p, i) => {
    
    const salePrice = calculateSalePrice(p)
    // 1. Calcular el precio final (con IVA incluido)
    // Precio Final = Precio Base * (1 + IVA_RATE)
    const finalPriceUsd = salePrice * (1 + IVA_RATE)
    const finalPriceBs = finalPriceUsd * safeRate


    const row = Math.floor(i / labelsPerRow) % labelsPerColumn
    const col = i % labelsPerRow

    const x = marginLeft + col * horizontalSpace
    const y = marginTop + row * verticalSpace

    // Marco exterior para el corte (BORDE NEGRO)
    doc.setDrawColor(0) 
    doc.setLineWidth(0.2)
    doc.rect(x, y, labelWidth, labelHeight)

    // --- SECCIÓN SUPERIOR: INFO y TASA ---
    
    doc.setFontSize(7)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...CARD_TEXT) 
    doc.text(`Venta: ${p.saleType.toUpperCase()} | Tasa: ${formatBs(safeRate)} Bs/$`, x + 3, y + 4) 
    
    // Línea de separación sutil con el color primario
    doc.setDrawColor(...PRIMARY_COLOR) 
    doc.setLineWidth(0.5)
    doc.line(x + 3, y + 5.5, x + labelWidth - 3, y + 5.5)

    // 2. Nombre del producto 
    doc.setFont("helvetica", "bold")
    let fontSize = 16 
    const maxWidth = labelWidth - 6 
    while (doc.getTextWidth(p.name.toUpperCase()) > maxWidth && fontSize > 10) {
      fontSize -= 0.5
      doc.setFontSize(fontSize)
    }
    doc.setTextColor(0) 
    doc.text(p.name.toUpperCase(), x + 3, y + 12) 

    // 3. Precio en Bs (con IVA)
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...CARD_TEXT) 
    
    doc.text(`PRECIO BS (IVA Incluido): ${formatBs(finalPriceBs)}`, x + 3, y + 17) 


    // --- SECCIÓN MEDIA: PRECIO USD (EL MÁS GRANDE Y CON COLOR) ---
    const USD_Y_START = 22; 
    
    doc.setFontSize(28) 
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...PRIMARY_COLOR) 
    
    // Precio Final en USD (con IVA)
    doc.text(`$${finalPriceUsd.toFixed(2)}`, x + labelWidth - 3, y + USD_Y_START + 8, { align: "right" })

    // Indicador de IVA Incluido
    doc.setFontSize(7) 
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...CARD_TEXT) 
    doc.text("IVA INCLUIDO", x + labelWidth - 3, y + USD_Y_START + 12, { align: "right" })


    // --- SECCIÓN INFERIOR: CÓDIGO DE BARRAS ---
    
    const BARCODE_HEIGHT_MM = 8; 
    const BARCODE_WIDTH_MM = labelWidth - 8; 
    
    const BARCODE_Y_START = y + labelHeight - BARCODE_HEIGHT_MM - 6; 
    const BARCODE_TEXT_Y = BARCODE_Y_START + BARCODE_HEIGHT_MM + 2.5; 

    if (p.barcode) {
        const barcodeDataURL = generateBarcodeDataURL(p.barcode, 400, 70); 
        
        if (barcodeDataURL) {
            doc.addImage(
                barcodeDataURL, 
                'PNG', 
                x + 4, 
                BARCODE_Y_START, 
                BARCODE_WIDTH_MM, 
                BARCODE_HEIGHT_MM 
            );
        }

        doc.setFontSize(6); 
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...CARD_TEXT); 
        doc.text(p.barcode, x + labelCenterX, BARCODE_TEXT_Y, { align: "center" });
    }

    if ((i + 1) % (labelsPerRow * labelsPerColumn) === 0 && i + 1 < productsWithBarcode.length) {
      doc.addPage()
    }
  })

  doc.output('dataurlnewwindow');
}