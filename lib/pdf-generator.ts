// pdf-generator.ts

"use client"

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import JsBarcode from 'jsbarcode'; 

// ==============================================
// 🎨 CONFIGURACIÓN GENERAL (COLORES Y ESTILOS)
// ==============================================
type RGB = [number, number, number]

const PRIMARY_COLOR: RGB = [79, 53, 248]
const LIGHT_ROW: RGB = [245, 245, 250]
const CARD_TEXT: RGB = [50, 50, 50]
const HEADER_DARK: RGB = [44, 52, 60]
const PRECIO_M2 = 15 
// Tasa de IVA establecida al 16% (Mantenida por si se usa en otro lugar, pero ignorada en este script)
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
  /** Precio unitario. `priceUsd` es el nombre histórico del campo. */
  priceUsd?: number
  priceUsdUnit?: number
  totalUsdLine?: number
}

// Interfaz Sale (ajustada para el DB)
export interface Sale { 
    id: string; 
    cart: SaleItem[]; 
    totalBs: number;
    totalUsd: number; // Este valor es el TOTAL NETO (después de descuento, sin IVA)
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
    subtotalUsd?: number; // Total antes de descuento (Base Neta)
    ivaUsd?: number; // Mantenido por compatibilidad, aunque ya no se usa.
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
// 🧮 CALCULAR PRECIO DE VENTA (Base)
// ==============================================
function calculateSalePrice(product: Product): number {
  const costUsd = Number(product.costUsd) || 0
  let profitDecimal = product.profit > 1 ? product.profit / 100 : product.profit

  if (!Number.isFinite(profitDecimal) || profitDecimal < 0 || profitDecimal >= 1) {
    profitDecimal = 0 
  }

  const divisor = 1 - profitDecimal

  let calculatedPrice: number;

  if (product.saleType === "area") {
    calculatedPrice = PRECIO_M2 / divisor
  } else if (costUsd <= 0) {
    calculatedPrice = 0
  } else {
    calculatedPrice = costUsd / divisor
  }

  // >>> ÚNICA LÓGICA DE REDONDEO AGREGADA PARA PRECIOS EN USD <<<
  // Math.ceil() redondea al entero superior, cumpliendo con la necesidad de manejar billetes.
  return Math.ceil(calculatedPrice);
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
// 📘 1. REPORTE DE INVENTARIO (CARTA) - SIN IVA
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
  // 1. ENCABEZADO DE LA EMPRESA (IZQUIERDA)
  // -----------------------------------------------------

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
  doc.text((businessInfo.businessName || "N/A").toUpperCase(), MARGIN_LEFT + 22, MARGIN_TOP + 5)
  
  // C. RIF y Contacto
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`RIF: ${businessInfo.fiscalDocument || "N/A"}`, MARGIN_LEFT + 22, MARGIN_TOP + 10)
  doc.text(`Dirección: ${businessInfo.fiscalAddress || "N/A"}`, MARGIN_LEFT + 22, MARGIN_TOP + 15)
  doc.text(`Teléfono: ${businessInfo.phoneNumber || "N/A"}`, MARGIN_LEFT + 22, MARGIN_TOP + 20)
  
  // -----------------------------------------------------
  // 2. BLOQUE REPORTE (DERECHA)
  // -----------------------------------------------------
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
    // 1. Precio de Venta (Neto y Redondeado)
    const salePriceUsd = calculateSalePrice(p)
    // 2. Precio de Venta en Bolívares (Neto, basado en el precio USD redondeado)
    const salePriceBs = salePriceUsd * safeRate

    return [
      p.name,
      p.category,
      `${p.quantity}`,
      `$${p.costUsd.toFixed(2)}`,
      `$${salePriceUsd.toFixed(2)}`, 
      `Bs ${formatBs(salePriceBs)}`, 
    ]
  })

  // -----------------------------------------------------
  // 4. TABLA DE INVENTARIO - HEADER Y COLUMNAS AJUSTADAS
  // -----------------------------------------------------

  autoTable(doc, {
    startY: TABLE_START_Y,
    // Header simplificado
    head: [["Producto", "Categoría", "Cantidad", "Costo (USD)", "Precio USD", "Precio Bs"]],
    body: tableData,
    styles: { fontSize: 9, cellPadding: 3, lineColor: 0, lineWidth: 0.1 },
    headStyles: { fillColor: HEADER_DARK, textColor: 255, fontStyle: "bold" as const },
    alternateRowStyles: { fillColor: LIGHT_ROW },
    margin: { left: MARGIN_LEFT, right: 14 },
    columnStyles: {
        2: { halign: 'center' as const },
        3: { halign: 'right' as const },
        4: { halign: 'right' as const },
        5: { halign: 'right' as const },
    }
  })

  // -----------------------------------------------------
  // 5. PIE DE PÁGINA Y CONTACTO
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
// 📗 2. NOTA DE ENTREGA EN PDF (SIN IVA)
// ==============================================
export function generateInvoice(
  businessInfo: BusinessInfo, 
  sale: Sale, 
) {
  
  const safeRate = safeBCV(sale.bcvRate)
  const items: SaleItem[] = (sale as any).cart || (sale as any).items || [] 

  // Asumimos que sale.totalUsd y sale.totalBs son los TOTALES NETOS (sin IVA)
  const finalTotalUsd = sale.totalUsd; 
  const finalTotalBs = sale.totalBs;
  
  const doc = new jsPDF({ format: "letter", unit: "mm" })
  
  const invoiceDate = sale.createdAt && typeof sale.createdAt.toDate === 'function' 
    ? sale.createdAt.toDate() 
    : new Date(); 
  
  const dateStr = invoiceDate.toLocaleDateString("es-VE"); 
  
  // El número correlativo real. Antes se usaban los primeros 6 caracteres del
  // ID de Firestore: aleatorio, con saltos y sin forma de demostrar que no
  // falta ninguno. Las ventas viejas y las guardadas sin conexión no lo tienen.
  const invoiceNumber =
    (sale as any).numeroDocumento ??
    ((sale as any).pendienteDeNumerar ? "PENDIENTE DE NUMERAR" : sale.id?.substring(0, 6).toUpperCase() ?? "N/A")

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
  
  // C. RIF, Dirección y Contacto (RESTITUIDOS)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`RIF: ${businessInfo.fiscalDocument || "N/A"}`, MARGIN_LEFT + 22, MARGIN_TOP + 10)
  doc.text(`Dirección: ${businessInfo.fiscalAddress || "N/A"}`, MARGIN_LEFT + 22, MARGIN_TOP + 15)
  doc.text(`Teléfono: ${businessInfo.phoneNumber || "N/A"}`, MARGIN_LEFT + 22, MARGIN_TOP + 20)


  // -----------------------------------------------------
  // 2. BLOQUE NOTA DE ENTREGA (DERECHA) - CENTRADO
  // -----------------------------------------------------
  doc.setFillColor(...HEADER_DARK)
  doc.rect(INVOICE_BLOCK_X - 10, 0, INVOICE_BLOCK_WIDTH + 10, 30, "F") 

  // Calcular el centro del bloque
  const INVOICE_BLOCK_CENTER_X = INVOICE_BLOCK_X - 10 + (INVOICE_BLOCK_WIDTH + 10) / 2

  doc.setFont("helvetica", "bold")
  doc.setFontSize(20) 
  doc.setTextColor(255) 
  // CENTRADO APLICADO
  doc.text("NOTA DE ENTREGA", INVOICE_BLOCK_CENTER_X, MARGIN_TOP + 10, { align: 'center' })

  // -----------------------------------------------------
  // 3. INFORMACIÓN DE CLIENTE Y FACTURA
  // -----------------------------------------------------
  const INFO_Y_START = 45
  
  const clientInfo = sale.clientInfo ?? { name: "", document: "", address: "", phone: "" }
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
  doc.text("No. Nota:", INVOICE_BLOCK_X, INFO_Y_START)
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
    // Las ventas viejas guardan `priceUsd`; las nuevas, `priceUsdUnit`.
    const priceUsdFinal = Number(item.priceUsdUnit ?? item.priceUsd ?? 0)
    const totalLineUsd = Number(item.totalUsdLine ?? item.quantity * priceUsdFinal)

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
    fontStyle: "bold" as const,
    halign: 'left' as const, 
    cellPadding: 3, 
  }
  
  const columnStyles = {
    0: { cellWidth: 10, halign: 'center' as const },
    1: { cellWidth: 100, halign: 'left' as const },
    2: { cellWidth: 20, halign: 'center' as const },
    3: { cellWidth: 30, halign: 'right' as const },
    4: { cellWidth: 30, halign: 'right' as const },
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
  // 5. TOTALES (ESQUINA INFERIOR DERECHA) - IVA ELIMINADO
  // -----------------------------------------------------
  const TOTAL_BLOCK_X = 145; 
  const TOTAL_BLOCK_WIDTH = 60;
  const TOTAL_VALUE_X = (TOTAL_BLOCK_X - 10) + TOTAL_BLOCK_WIDTH; // 195
  const TOTAL_ROW_HEIGHT = 8;
  
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)

  // Subtotal USD (Base) - Monto de las líneas antes de descuento
  doc.setFillColor(...LIGHT_ROW)
  doc.rect(TOTAL_BLOCK_X - 10, currentY, TOTAL_BLOCK_WIDTH, TOTAL_ROW_HEIGHT, "F")
  doc.setTextColor(...CARD_TEXT)
  doc.text("SUBTOTAL:", TOTAL_BLOCK_X, currentY + 4) 
  // Usamos subtotalUsd pasado (total de lineas)
  doc.text(`$${(sale.subtotalUsd || 0).toFixed(2)}`, TOTAL_VALUE_X, currentY + 4, { align: "right" })
  currentY += TOTAL_ROW_HEIGHT;

  // Descuento USD
  doc.setFillColor(...LIGHT_ROW)
  doc.rect(TOTAL_BLOCK_X - 10, currentY, TOTAL_BLOCK_WIDTH, TOTAL_ROW_HEIGHT, "F")
  doc.setTextColor(255, 0, 0) // Color rojo para el descuento
  doc.text("DESCUENTO:", TOTAL_BLOCK_X, currentY + 4)
  // Usamos discountUsd pasado
  doc.text(`-$${(sale.discountUsd || 0).toFixed(2)}`, TOTAL_VALUE_X, currentY + 4, { align: "right" })
  currentY += TOTAL_ROW_HEIGHT;

  // TOTAL USD (Gran Total NETO)
  const TOTAL_USD_HEIGHT = TOTAL_ROW_HEIGHT * 1.2; 
  const TEXT_Y_TOTAL_USD = 5; 
  
  doc.setFillColor(...HEADER_DARK) 
  doc.rect(TOTAL_BLOCK_X - 10, currentY, TOTAL_BLOCK_WIDTH, TOTAL_USD_HEIGHT, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(255) 
  doc.text("TOTAL USD:", TOTAL_BLOCK_X, currentY + TEXT_Y_TOTAL_USD)
  // Usamos totalUsd pasado (neto)
  doc.text(`$${finalTotalUsd.toFixed(2)}`, TOTAL_VALUE_X, currentY + TEXT_Y_TOTAL_USD, { align: "right" })
  currentY += TOTAL_USD_HEIGHT;
  
  // Total BS (Gran Total NETO)
  const BS_OFFSET_START = 5; 
  currentY += BS_OFFSET_START; 
  
  doc.setFontSize(14)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text("TOTAL BS:", TOTAL_BLOCK_X, currentY)
  
  currentY += 8; 
  
  doc.setFontSize(18)
  // Usamos totalBs pasado (neto)
  doc.text(`Bs ${formatBs(finalTotalBs)}`, TOTAL_VALUE_X, currentY, { align: "right" }) 
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
  // 7. PIE DE PÁGINA Y FIRMA
  // -----------------------------------------------------
  
  // Nueva posición fija para la firma (aprox 250mm)
  const SIGNATURE_LINE_Y = 250; 
  const SIGNATURE_TEXT_Y = SIGNATURE_LINE_Y + 4; // 4mm debajo de la línea
  const SIGNATURE_X_CENTER = 155; // Centrado en la derecha
  
  // 1. Línea de firma
  doc.setDrawColor(0)
  doc.line(130, SIGNATURE_LINE_Y, 180, SIGNATURE_LINE_Y) 
  
  // 2. Texto de firma
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(0)
  doc.text("Firma Autorizada", SIGNATURE_X_CENTER, SIGNATURE_TEXT_Y, { align: 'center' })

  // 3. Línea divisoria de pie de página (260mm)
  const FOOTER_Y = 260 

  doc.setLineWidth(0.1)
  doc.setDrawColor(200)
  doc.line(MARGIN_LEFT, FOOTER_Y, 216 - MARGIN_LEFT, FOOTER_Y) 

  // 4. DOCUMENTO NO FISCAL (Mantener cerca del borde inferior)
  doc.setFontSize(7)
  doc.setFont("helvetica", "italic")
  doc.setTextColor(150)
  doc.text("DOCUMENTO NO FISCAL", 216 - 14, FOOTER_Y + 12, { align: 'right' })

  doc.output('dataurlnewwindow');
}


// ==============================================
// 📘 3. ETIQUETAS DE PRODUCTOS (CARTA – LANDSCAPE) - AJUSTE DE TAMAÑO DE FUENTE
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
    
    // El precio de venta ahora es directamente el precio neto (sin IVA)
    const salePriceUsd = calculateSalePrice(p)
    const salePriceBs = salePriceUsd * safeRate


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

    // -----------------------------------------------------------------
    // 2. Nombre del producto (MÁS GRANDE) - IZQUIERDA
    // -----------------------------------------------------------------
    doc.setFont("helvetica", "bold")
    let fontSize = 24 
    const maxWidth = labelWidth - 6 
    
    // Reducir font size hasta que quepa en el ancho disponible
    while (doc.getTextWidth(p.name.toUpperCase()) > maxWidth && fontSize > 14) {
      fontSize -= 0.5
      doc.setFontSize(fontSize)
    }
    
    doc.setTextColor(0) 
    // POSICIÓN AJUSTADA: Movemos ligeramente hacia abajo.
    doc.text(p.name.toUpperCase(), x + 3, y + 15) 

    // -----------------------------------------------------------------
    // 3. Precio en Bs (Mediano) - IZQUIERDA, debajo del nombre
    // -----------------------------------------------------------------
    doc.setFontSize(10) 
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...CARD_TEXT) 
    
    // POSICIÓN AJUSTADA: Movemos debajo del nombre.
    doc.text(`PRECIO BS: ${formatBs(salePriceBs)}`, x + 3, y + 22) 

    // -----------------------------------------------------------------
    // 4. Precio en USD (EL MÁS GRANDE Y CON COLOR) - DERECHA
    // -----------------------------------------------------------------
    
    doc.setFontSize(28) 
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...PRIMARY_COLOR) 
    
    // Precio en USD (Neto), posicionado a la DERECHA
    // POSICIÓN AJUSTADA: Movemos ligeramente hacia abajo para compensar los textos superiores.
    doc.text(`$${salePriceUsd.toFixed(2)}`, x + labelWidth - 3, y + 35, { align: "right" })

    // --- SECCIÓN INFERIOR: CÓDIGO DE BARRAS ---
    
    const BARCODE_HEIGHT_MM = 8; 
    const BARCODE_WIDTH_MM = labelWidth - 8; 
    
    const BARCODE_Y_START = y + labelHeight - BARCODE_HEIGHT_MM - 6; // Y + 36
    const BARCODE_TEXT_Y = BARCODE_Y_START + BARCODE_HEIGHT_MM + 2.5; // Y + 46.5

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