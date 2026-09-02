"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { m } from "framer-motion" 
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs, addDoc, doc, increment, writeBatch, Timestamp } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash2, Plus, Minus, Printer, Scan, ShoppingCart, Search, UserSearch, X } from "lucide-react"
import { initBarcodeScanner } from "@/lib/barcode-scanner"
import { useRates } from "@/hooks/use-rates"
import { getTurnoAbierto } from "@/lib/cash-service"
import { type SaleType, loadProducts as fetchCatalogo, esServicio } from "@/lib/products-service"
import { type Cliente, listarClientes, puedeFiar, registrarDeuda } from "@/lib/customers"
import { reportFirestoreError, reportFirestoreSuccess } from "@/lib/sync-status"
import { type ReceiptData, printReceipt } from "@/lib/thermal-receipt"
import { createNumberedDocument, isOfflineError, unnumbered } from "@/lib/document-numbers"
import { usePricingSettings } from "@/hooks/use-pricing-settings"
import { divisaPrice, formatBs, formatMoney, listPrice } from "@/lib/pricing"

// 🔑 IMPORTACIONES DEL GENERADOR DE PDF
import { generateInvoice, Sale, BusinessInfo } from "@/lib/pdf-generator" 

// ==============================================
// 📦 CONSTANTES PARA PREFIJOS Y PAGINACIÓN
// ==============================================
const DOCUMENT_PREFIXES = ["V", "E", "P", "R", "J", "G"];
const PHONE_PREFIXES = ["0412", "0422", "0414", "0424", "0416", "0426"];

// Métodos que se cobran en divisa. Sirve para saber en qué moneda entra el
// pago; el ajuste de precio en divisa lo decide la configuración del comercio.
const USD_PAYMENT_METHODS: PaymentMethod[] = ["cash", "zelle", "binance"];

// 🔑 CONSTANTE DE PAGINACIÓN
const PRODUCTS_PER_PAGE = 10; 

// ==============================================
// 📦 INTERFACES
// ==============================================
interface Product {
  id: string
  name: string
  category: string
  quantity: number
  saleType: SaleType
  barcode?: string
  /** Precio de lista, ya calculado al guardar el producto. */
  precioUsd?: number | null
  /** Precio en divisa con el ajuste del comercio aplicado. */
  precioDivisaUsd?: number | null
}

interface CartItem {
  productId: string
  name: string
  quantity: number
  priceUsd: number 
  priceBs: number 
  saleType: SaleType
  kg?: number 
}

type SinglePaymentMethod = "cash" | "zelle" | "binance" | "debit" | "transfer" | "pagoMovil" | "biopago";
/**
 * `credit` es el fiado: no es una forma de cobrar sino de NO cobrar todavía. Va
 * en el mismo campo porque es donde se decide qué hacer con el dinero, y así
 * una venta fiada queda registrada como venta completa —descuenta inventario,
 * cuenta para el día y numera su documento— con la única diferencia de que en
 * vez de un movimiento de caja crea una deuda.
 */
type PaymentMethod = SinglePaymentMethod | "mixed" | "credit"

// 🔑 NUEVAS INTERFACES PARA DESGLOSE DE PAGO MIXTO
interface PaymentLine {
    id: number;
    method: SinglePaymentMethod; // e.g., 'cash', 'biopago'
    currency: 'USD' | 'BS';
    amount: number; // Monto en la moneda del pago (USD o BS)
    amountBsEquivalent: number; // Monto convertido a Bs (para el cálculo de cobertura)
}
type BreakdownMethod = SinglePaymentMethod; // Alias para claridad

// ==============================================
// 🛑 Componente Principal
// ==============================================

export default function SalesView() {
  const { user, negocioId, allows } = useAuth()
  // Turno de caja activo. La venta queda atada a él para poder cuadrar al
  // cierre; si no hay turno abierto se guarda null y la venta no entra en
  // ningún cuadre (el aviso se muestra arriba del carrito).
  const [turnoId, setTurnoId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  // Tasa y ajustes de precio compartidos con el resto del sistema.
  const { rate: bcvRate } = useRates()
  const { settings: pricing } = usePricingSettings()
  const [scannerActive, setScannerActive] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [showCart, setShowCart] = useState(false)
  
  // 🔑 ESTADOS DE BÚSQUEDA Y FILTRO
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all") 
  
  // 🔑 ESTADO DE PAGINACIÓN
  const [currentPage, setCurrentPage] = useState(1) 

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [discountPercentage, setDiscountPercentage] = useState(0)
  // Con cuánto paga el cliente, para calcular el vuelto. Es el cálculo que el
  // cajero hace hoy con el teléfono en la mano cincuenta veces al día.
  const [pagaCon, setPagaCon] = useState("")
  // Último recibo emitido, para poder reimprimirlo si la impresora se atascó o
  // el cliente lo pide otra vez. Se pierde al recargar, y está bien: para eso
  // están los reportes.
  const [ultimoRecibo, setUltimoRecibo] = useState<ReceiptData | null>(null)
  
  // 🔑 ESTADOS PARA DESGLOSE DE PAGOS MIXTOS (UNIFICADO)
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentLine[]>([])
  const [newPaymentMethod, setNewPaymentMethod] = useState<BreakdownMethod>("cash")
  const [newPaymentAmount, setNewPaymentAmount] = useState("")

  // 🔑 ESTADOS PARA DATOS DEL CLIENTE
  const [clientDocumentPrefix, setClientDocumentPrefix] = useState<string>("V")
  const [clientDocumentNumber, setClientDocumentNumber] = useState("") 
  const [clientName, setClientName] = useState("")
  /** Clientes con su deuda al día, para poder avisar antes de fiar otra vez. */
  const [clientesConSaldo, setClientesConSaldo] = useState<Cliente[]>([])
  /** Días de plazo del fiado. Cero es "sin fecha": no todo el fiado tiene plazo. */
  const [diasPlazo, setDiasPlazo] = useState(15)
  const [clientPhonePrefix, setClientPhonePrefix] = useState<string>("0412")
  const [clientPhoneNumber, setClientPhoneNumber] = useState("") 
  const [clientAddress, setClientAddress] = useState("")
  const [clientId, setClientId] = useState<string | null>(null) 
  const [isClientSearching, setIsClientSearching] = useState(false)

  // 🔑 ESTADOS PARA INFORMACIÓN DEL NEGOCIO (MOCK UP para el PDF)
  const [businessName] = useState("Mi Negocio - Example C.A.")
  const [businessInfo] = useState<BusinessInfo>({ 
    businessName: "Mi Negocio - Example C.A.",
    logoBase64: "", // Imagen Base64
    fiscalAddress: "Av. Principal Sector Industrial, Local #45",
    fiscalDocument: "J-12345678-0",
    phoneNumber: "0212-1234567",
    email: "ventas@minegocio.com",
    bankName: "Banco Universal",
    bankAccountOwner: "Mi Negocio, C.A.",
    bankAccountNumber: "01020000000000000000",
  })
  
  // 🔑 VALORES DERIVADOS LIMPIOS
  const cleanClientDocumentNumber = clientDocumentNumber.replace(/[^0-9]/g, '')
  const fullClientDocument = `${clientDocumentPrefix}${cleanClientDocumentNumber}`.trim()
  const cleanClientPhoneNumber = clientPhoneNumber.replace(/[^0-9]/g, '')
  const fullClientPhone = `${clientPhonePrefix}${cleanClientPhoneNumber}`.trim()
  
  // ==============================================
  // 💡 Carga Inicial: Productos y Tasa BCV
  // ==============================================
  const loadProducts = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      // Catálogo público: nombre, existencias y precio ya calculado. El costo
      // vive en otra colección que el cajero no puede leer.
      setProducts((await fetchCatalogo(negocioId ?? user.uid)) as unknown as Product[])
    } catch (error) {
      console.error("Error loading products:", error)
    } finally {
      setLoading(false)
    }
  }, [user, negocioId])
  
  useEffect(() => {
    if (!user) return
    loadProducts()
  }, [user, loadProducts])

  useEffect(() => {
    if (!user || !negocioId) return
    let cancelled = false

    getTurnoAbierto(negocioId, user.uid)
      .then((turno) => {
        if (!cancelled) setTurnoId(turno?.id ?? null)
      })
      .catch((error) => console.error("Error consultando el turno de caja:", error))

    return () => {
      cancelled = true
    }
  }, [user, negocioId])

  // El escáner se registra una sola vez, pero llama SIEMPRE al handler actual.
  // Antes capturaba el `products` del primer render (vacío), así que todo
  // código escaneado respondía "producto no encontrado".
  const barcodeHandlerRef = useRef<(code: string) => void>(() => {})

  useEffect(() => {
    const stopScanner = initBarcodeScanner((code) => {
      setBarcodeInput(code)
      barcodeHandlerRef.current(code)
    })

    return () => {
      if (typeof stopScanner === "function") stopScanner()
    }
  }, [])

  // ==============================================
  // 💡 FUNCIÓN DE BÚSQUEDA DE CLIENTE POR CÉDULA/RIF
  // ==============================================
  const handleClientSearch = async () => {
    if (!user) return;

    if (cleanClientDocumentNumber.length < 5) {
        alert("Ingrese un número de Cédula/RIF válido (mínimo 5 dígitos).");
        return;
    }
    
    const documentToSearch = fullClientDocument;

    setIsClientSearching(true);
    // Limpiar campos relacionados con la búsqueda anterior
    setClientId(null); 
    setClientName("");
    setClientPhoneNumber("");
    setClientAddress("");

    try {
      // Búsqueda en la colección 'clientes'
      const q = query(
        collection(db, "clientes"), 
        where("document", "==", documentToSearch), 
        where("negocioId", "==", negocioId ?? user.uid)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const clientData = snapshot.docs[0].data();
        setClientId(snapshot.docs[0].id);
        
        // 1. Rellenar Nombre/Dirección
        setClientName(clientData.name || "");
        setClientAddress(clientData.address || "");
        
        // 2. Descomponer y rellenar Documento (para mantener el selector)
        const docInDb = clientData.document as string;
        if (docInDb && docInDb.length > 1) {
            const prefix = docInDb.substring(0, 1);
            if (DOCUMENT_PREFIXES.includes(prefix)) {
                setClientDocumentPrefix(prefix);
                setClientDocumentNumber(docInDb.substring(1));
            } else {
                setClientDocumentNumber(docInDb); // Si el prefijo no es uno de los estándar, dejarlo como número completo
            }
        }

        // 3. Descomponer y rellenar Teléfono
        const phoneInDb = clientData.phone as string;
        if (phoneInDb) {
            let foundPrefix = PHONE_PREFIXES.find(p => phoneInDb.startsWith(p)) || PHONE_PREFIXES[0];
            let foundNumber = phoneInDb.replace(foundPrefix, '');
            setClientPhonePrefix(foundPrefix);
            setClientPhoneNumber(foundNumber);
        }

        alert(`Cliente encontrado: ${clientData.name}`);
      } else {
        setClientId(null);
        alert(`Cliente con documento ${documentToSearch} no encontrado. Por favor, ingrese el Nombre para registrarlo en la compra.`);
      }
    } catch (error) {
      console.error("Error searching client:", error);
      alert("Error al buscar cliente.");
    } finally {
      setIsClientSearching(false);
    }
  };


  // ==============================================
  // 💰 PRECIOS
  // El cálculo vive en @/lib/pricing: la misma función que usa el inventario,
  // así que lo que ves en Productos es exactamente lo que cobra la caja.
  // ==============================================

  /** ¿Este pago entra en divisa? Decide si aplica el ajuste configurado. */
  const isPayingInDivisa =
    paymentMethod !== "mixed" && pricing.divisaPaymentMethods.includes(paymentMethod)

  const unitPriceFor = useCallback(
    (product: Product): number =>
      isPayingInDivisa ? divisaPrice(product, pricing) : listPrice(product),
    [isPayingInDivisa, pricing],
  )

  const getDisplayPrice = (product: Product): { usd: number; bs: number | null } => {
    const usd = unitPriceFor(product)
    return { usd, bs: bcvRate ? usd * bcvRate : null }
  }

  // 🔑 CÁLCULO DE CATEGORÍAS ÚNICAS
  const uniqueCategories = Array.from(new Set(products.map(p => p.category))).sort()

  // 💡 LÓGICA DE FILTRADO (Incorporando el filtro de categoría)
  const filteredProducts = products.filter(
    (product) => {
        const matchesSearchTerm = 
            product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            product.category.toLowerCase().includes(searchTerm.toLowerCase())
        
        const matchesCategory = selectedCategory === "all" || product.category === selectedCategory
        
        return matchesSearchTerm && matchesCategory
    }
  )
  
  // 🔑 EFECTO PARA RESETEAR PÁGINA CUANDO CAMBIA EL FILTRO/BÚSQUEDA
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory]);


  // 🔑 LÓGICA DE PAGINACIÓN APLICADA A LOS PRODUCTOS FILTRADOS
  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const indexOfLastProduct = currentPage * PRODUCTS_PER_PAGE;
  const indexOfFirstProduct = indexOfLastProduct - PRODUCTS_PER_PAGE;
  const paginatedProducts = filteredProducts.slice(indexOfFirstProduct, indexOfLastProduct);

  // 💡 MANEJADORES DE PAGINACIÓN
  const goToPage = (pageNumber: number) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
  };

  // Asegurar que la página actual sea válida si los productos filtrados cambian
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    } else if (totalPages === 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // ==============================================
  // 🧮 TOTALES
  // ==============================================
  // Sin tasa no se puede convertir a bolívares. Se usa 0 para que el importe
  // salga en 0 y la caja no deje cobrar, en vez de inventarse un 1 (que hacía
  // que Bs y divisa mostraran el mismo número).
  const safeBcvRate = bcvRate ?? 0

  /**
   * Líneas del carrito con su precio recalculado en cada render. El precio ya
   * no se congela al añadir: si cambias el método de pago, la línea se ajusta.
   */
  const cartLines = cart.map((item) => {
    const product = products.find((p) => p.id === item.productId)
    const unitUsd = product ? unitPriceFor(product) : item.priceUsd
    const lineUsd = unitUsd * item.quantity

    return {
      ...item,
      product,
      unitUsd,
      lineUsd,
      lineBs: lineUsd * safeBcvRate,
    }
  })

  const baseTotalUsd = cartLines.reduce((sum, line) => sum + line.lineUsd, 0)
  const baseTotalBs = baseTotalUsd * safeBcvRate

  // 3. Aplicar Descuento Adicional (si existe)
  const safeDiscount = Math.max(0, Math.min(100, Number(discountPercentage) || 0));
  const discountRate = safeDiscount / 100;
  const discountAmountUsd = baseTotalUsd * discountRate; 
  const subtotalUsd = baseTotalUsd - discountAmountUsd 
  
  const ivaAmountUsd = 0 // IVA es 0
  
  // 4. Total Final 
  const totalUsd = subtotalUsd 
  const totalBs = totalUsd * safeBcvRate 
  
  // ------------------------------------------------------------------
  // VUELTO
  // El cliente paga en divisa y el vuelto se entrega en bolívares, que es como
  // funciona de verdad un mostrador en Venezuela: nadie tiene monedas de a
  // dólar para devolver 1,60.
  // ------------------------------------------------------------------
  const pagaConUsd = Number.parseFloat(pagaCon)
  const hayPago = pagaCon.trim().length > 0 && Number.isFinite(pagaConUsd) && pagaConUsd > 0
  const vueltoUsd = hayPago ? pagaConUsd - totalUsd : 0
  const faltaUsd = hayPago && vueltoUsd < -0.001 ? Math.abs(vueltoUsd) : 0
  const vueltoBs = vueltoUsd > 0 && bcvRate ? vueltoUsd * bcvRate : 0

  const discountText = discountRate > 0 
    ? `Descuento Aplicado (${safeDiscount.toFixed(0)}%):` 
    : 'Descuento:'
    
  // 🔑 LÓGICA DE PAGO MIXTO (UNIFICADO)
  
  // Calcular la suma de todos los pagos cubiertos en Bs
  const totalCoveredBs = paymentBreakdown.reduce((sum, line) => {
      return sum + line.amountBsEquivalent;
  }, 0);

  // Calcular el restante Bs que falta pagar
  const remainingBsToPay = totalBs - totalCoveredBs;
  const safeRemainingBs = Math.max(0, remainingBsToPay); // El monto nunca es negativo
  
  // ==============================================
  
  // ==============================================
  // 💡 FUNCIONES AUXILIARES DE VENTA Y PAGO MIXTO
  // ==============================================
  
  // Mapeo para nombres de métodos de pago en la UI (Usado en handleCheckout)
  const getMethodDisplayName = (method: BreakdownMethod) => {
    switch (method) {
        case 'cash': return 'Efectivo USD';
        case 'zelle': return 'Zelle USD';
        case 'binance': return 'Binance USD';
        case 'debit': return 'Débito Bs';
        case 'transfer': return 'Transferencia Bs';
        case 'pagoMovil': return 'Pago Móvil Bs';
        case 'biopago': return 'Biopago Bs';
        default: return method;
    }
  };

  /**
   * 🔑 NUEVA FUNCIÓN: Genera la descripción del método de pago para el registro (Mixto(pago1, pago2...))
   */
  const getPaymentMethodDescription = (method: PaymentMethod, breakdown: PaymentLine[]): string => {
      if (method !== "mixed") {
          return getMethodDisplayName(method as SinglePaymentMethod);
      }

      if (breakdown.length === 0) {
          return "Mixto (Sin pagos detallados)";
      }
      
      // Obtener una lista de métodos únicos (sin duplicar si pagan dos veces con Efectivo)
      const uniqueMethods = Array.from(new Set(breakdown.map(p => p.method)));
      
      // Mapear los métodos únicos a sus nombres de visualización
      const methodNames = uniqueMethods.map(getMethodDisplayName);
      
      return `Mixto (${methodNames.join(', ')})`;
  };
  
  const handleBarcodeScanned = (code: string) => {
    const product = products.find((p) => p.barcode === code)
    if (product) openAddDialog(product)
    else alert(`Producto con código ${code} no encontrado`)
  }

  const openAddDialog = (product: Product) => {
    let quantity = 1
    let kg = undefined as number | undefined
    
    if (product.saleType === "weight") {
      const rawQuantity = prompt(`Ingresa cantidad de kg de ${product.name}:`, "1")
      if (!rawQuantity) return
      kg = Number.parseFloat(rawQuantity) 
      if (!Number.isFinite(kg) || kg <= 0) return alert("Kg inválidos")
      quantity = kg
    }
    
    addToCart(product, quantity, kg) 
  }
  
  const addToCart = (product: Product, quantity: number, kg?: number) => {
    const salePriceUnitAdjusted = unitPriceFor(product)

    if (salePriceUnitAdjusted <= 0) {
        alert("No se pudo calcular el precio de venta. Revise costo y margen del producto.");
        return;
    }

    // Un servicio no se agota: reparar diez teléfonos no consume existencias.
    // Saltarse la comprobación aquí es lo que permite venderlo sin inventario.
    const alreadyInCart = cart
      .filter((i) => i.productId === product.id)
      .reduce((sum, i) => sum + Number(i.quantity), 0)

    if (!esServicio(product) && alreadyInCart + quantity > product.quantity) {
      alert(
        `No hay suficiente inventario. Disponible: ${product.quantity}` +
          (alreadyInCart > 0 ? `, ya en el carrito: ${alreadyInCart}` : ""),
      )
      return
    }

    const itemKey = product.saleType === "weight" 
        ? `${product.id}-${kg}` 
        : product.id
        
    const existingItemIndex = cart.findIndex(i => 
      (i.saleType === "weight" ? `${i.productId}-${i.kg}` : i.productId) === itemKey
    )

    const linePriceBs = salePriceUnitAdjusted * quantity * safeBcvRate; 

    if (existingItemIndex !== -1) {
      const newQuantity = Number(cart[existingItemIndex].quantity) + Number(quantity)

      // Se crea un array nuevo en vez de mutar el objeto que ya está en el
      // estado: mutarlo hacía que React no viera siempre el cambio.
      setCart((current) =>
        current.map((item, index) =>
          index === existingItemIndex
            ? { ...item, quantity: newQuantity, priceUsd: salePriceUnitAdjusted, priceBs: linePriceBs }
            : item,
        ),
      )
    } else {
      const item: CartItem = {
        productId: product.id,
        name: product.name,
        quantity,
        priceUsd: salePriceUnitAdjusted, // Almacena el precio AJUSTADO/MANUAL
        priceBs: linePriceBs, 
        saleType: product.saleType,
      }
      if (product.saleType === "weight") {
        item.kg = kg
      }
      setCart((c) => [...c, item])
    }
  }

  const removeFromCart = (itemToRemove: CartItem) => {
    setCart(cart.filter((i) => {
      const itemKey = i.saleType === "weight" 
        ? `${i.productId}-${i.kg}` 
        : i.productId
      const itemToRemoveKey = itemToRemove.saleType === "weight" 
        ? `${itemToRemove.productId}-${itemToRemove.kg}` 
        : itemToRemove.productId
      
      return itemKey !== itemToRemoveKey
    }))
  }

  const updateQuantity = (item: CartItem, newQuantityInput: number) => {
    const newQuantity = Number.parseFloat(newQuantityInput.toFixed(2))

    if (newQuantity <= 0 || !Number.isFinite(newQuantity)) {
      removeFromCart(item)
      return
    }
    
    const product = products.find((p) => p.id === item.productId)
    if (!product) return

    if (newQuantity > product.quantity) {
      alert("Cantidad no disponible")
      return
    }
    
    const itemKey = item.saleType === "weight" 
        ? `${item.productId}-${item.kg}` 
        : item.productId

    const existingItemIndex = cart.findIndex(i => 
      (i.saleType === "weight" ? `${i.productId}-${i.kg}` : i.productId) === itemKey
    )
    
    if (existingItemIndex === -1) return;

    setCart((current) =>
      current.map((cartItem, index) =>
        index === existingItemIndex
          ? {
              ...cartItem,
              quantity: newQuantity,
              priceBs: cartItem.priceUsd * newQuantity * safeBcvRate,
            }
          : cartItem,
      ),
    )
  }

  const addPaymentLine = () => {
    const rawAmount = Number.parseFloat(newPaymentAmount || "0");
    if (rawAmount <= 0 || !Number.isFinite(rawAmount)) {
        alert("Ingrese un monto válido.");
        return;
    }
    
    const isUsdPayment = USD_PAYMENT_METHODS.includes(newPaymentMethod);
    const currency = isUsdPayment ? 'USD' : 'BS';
    
    let amountBsEquivalent: number;
    let amount: number;

    if (isUsdPayment) {
        amount = rawAmount; // Monto en USD
        amountBsEquivalent = rawAmount * safeBcvRate;
    } else {
        amount = rawAmount; // Monto en BS
        amountBsEquivalent = rawAmount;
    }
    
    // VALIDACIÓN: Limitar para que no se exceda mucho el total pendiente
    const totalRemaining = totalBs - totalCoveredBs;
    if (amountBsEquivalent > totalRemaining && amountBsEquivalent > totalRemaining + 0.02) { 
        alert(`Este pago (Bs ${amountBsEquivalent.toFixed(2)}) excede el monto restante a pagar (Bs ${totalRemaining.toFixed(2)}).`);
        return;
    }

    const newPayment: PaymentLine = {
        id: Date.now(),
        method: newPaymentMethod,
        currency: currency,
        amount: amount, 
        amountBsEquivalent: amountBsEquivalent,
    };

    setPaymentBreakdown(prev => [...prev, newPayment]);
    setNewPaymentMethod("cash"); // Resetear a cash o el método más usado
    setNewPaymentAmount("");
  };

  const removePaymentLine = (id: number) => {
      setPaymentBreakdown(prev => prev.filter(p => p.id !== id));
  };
  
  // ==============================================
  // 🛒 Lógica de Checkout FINAL
  // ==============================================
  // Los clientes se cargan una vez y se quedan: hacen falta para saber cuánto
  // debe alguien ANTES de fiarle, no después.
  useEffect(() => {
    if (!negocioId || !allows("sales.credit")) return
    let cancelado = false

    listarClientes(negocioId)
      .then((lista) => {
        if (!cancelado) setClientesConSaldo(lista)
      })
      .catch(() => {
        // Sin la lista se puede seguir vendiendo al contado; solo se pierde el
        // aviso de tope. No es motivo para romper el punto de venta.
      })

    return () => {
      cancelado = true
    }
  }, [negocioId, allows])

  const esFiado = paymentMethod === "credit"
  const clienteDelFiado = clientesConSaldo.find((c) => c.id === clientId) ?? null
  const avisoFiado =
    esFiado && clienteDelFiado ? puedeFiar(clienteDelFiado, totalUsd) : { permitido: true }

  const handleCheckout = async () => {
    if (!user) return alert("Usuario no autenticado")
    if (cart.length === 0) return alert("El carrito está vacío")

    if (!Number.isFinite(totalUsd) || !Number.isFinite(totalBs)) {
        return alert("Error en el cálculo del total. Por favor, revise los precios y la tasa.");
    }

    // Sin tasa el total en bolívares saldría en 0 y se registraría una venta
    // falsa. Mejor parar aquí y pedir que se actualice la tasa.
    if (!bcvRate || bcvRate <= 0) {
      return alert("No hay tasa de cambio cargada. Actualízala antes de cobrar.")
    }
    
    const currentDocument = fullClientDocument;
    const currentPhone = fullClientPhone;
    const isClientDataEntered = currentDocument.length >= 6 && clientName.trim().length > 0;
    // Fiar exige saber A QUIÉN. Una deuda sin cliente identificado es un
    // apunte que no se puede cobrar: no hay a quién llamar ni contra qué saldo
    // aplicarla.
    if (esFiado) {
      if (!clientId && !isClientDataEntered) {
        return alert(
          "Para fiar hace falta identificar al cliente.\n\nBúscalo por su cédula, o escribe su nombre y su documento para registrarlo.",
        )
      }

      if (!avisoFiado.permitido) {
        return alert(`No se le puede fiar a este cliente.\n\n${avisoFiado.motivo}`)
      }
    }

    if (paymentMethod === "mixed") {
        
        if (paymentBreakdown.length === 0) {
            return alert("Debe añadir al menos un método de pago mixto.");
        }
        
        // Nueva validación: La suma de todos los pagos debe cubrir el total
        const combined = totalCoveredBs; 
        const roundedTotal = Number(totalBs.toFixed(2));
        const sum = Number(combined.toFixed(2));

        // Permite una pequeña tolerancia por errores de redondeo (0.02 Bs)
        if (sum < roundedTotal && Math.abs(sum - roundedTotal) > 0.02)
            return alert(`Error en el cálculo del pago mixto. La suma de los pagos (${sum.toFixed(2)} Bs) no cubre el total (${roundedTotal.toFixed(2)} Bs).\nFaltan por cubrir: Bs ${(totalBs - totalCoveredBs).toFixed(2)}`);
    }

    // El fiado se confirma con otras palabras a propósito: "confirmar la venta"
    // suena a que entró el dinero, y aquí no entra nada.
    const confirmation = window.confirm(
      esFiado
        ? `Vas a ENTREGAR SIN COBRAR por ${totalUsd.toFixed(2)} $.\n\nQueda como deuda de ${clientName || "el cliente"}${
            diasPlazo > 0 ? `, con ${diasPlazo} días de plazo` : ", sin fecha de pago"
          }.\n\n¿Seguimos?`
        : `¿Estás seguro de confirmar la venta?\n\nTotal a Pagar:\nUSD: $${totalUsd.toFixed(2)}\nBs: Bs ${totalBs.toFixed(2)}`
    );

    if (!confirmation) {
      return; 
    }
    
    try {
      let currentClientId = clientId;

      // 🔑 1. REGISTRO/ACTUALIZACIÓN DE CLIENTE (Lógica Restituida)
      if (!currentClientId && isClientDataEntered) {
        
        // Intentar una última búsqueda (prevenir duplicados)
        const clientQuery = query(
          collection(db, "clientes"), 
          where("document", "==", currentDocument), 
          where("negocioId", "==", negocioId ?? user.uid)
        );
        const clientSnapshot = await getDocs(clientQuery);

        if (!clientSnapshot.empty) {
          currentClientId = clientSnapshot.docs[0].id;
        } else {
          // Registrar nuevo cliente
          const newClientData = {
            userId: user.uid,
            negocioId: negocioId ?? user.uid,
            name: clientName.trim(),
            document: currentDocument, // Documento limpio con prefijo
            phone: currentPhone || 'N/A', // Teléfono limpio con prefijo
            address: clientAddress.trim() || 'N/A',
            createdAt: Timestamp.now(),
          };
          const newClientRef = await addDoc(collection(db, "clientes"), newClientData);
          currentClientId = newClientRef.id;
          alert(`Nuevo cliente "${clientName}" registrado.`);
        }
      }

      // 🔑 2. REGISTRO DE VENTA
      
      // Las líneas ya vienen con el precio correcto para este método de pago.
      // El costo NO va aquí: viaja en ventas_costos, que el cajero escribe
      // pero no puede leer.
      const itemsForSale = cartLines.map(({ product, ...line }) => ({
          productId: line.productId,
          name: line.name,
          quantity: line.quantity,
          saleType: line.saleType,
          ...(line.kg !== undefined ? { kg: line.kg } : {}),
          priceUsdUnit: line.unitUsd,
          // Se conserva el nombre histórico para que el PDF de ventas
          // anteriores y las nuevas se lean con el mismo código.
          priceUsd: line.unitUsd,
          totalUsdLine: line.lineUsd,
          priceBs: line.lineBs,
      }));

      const saleData: any = {
        userId: user.uid,
        negocioId: negocioId ?? user.uid,
        // Quién cobró y en qué turno. Es lo que permite cuadrar la caja y saber
        // de quién es un faltante.
        cajeroUid: user.uid,
        turnoId: turnoId ?? null,
        anulada: false,
        items: itemsForSale, // Usar los items con el precio final correcto
        clientId: currentClientId, 
        clientInfo: { 
            name: clientName || "CLIENTE FINAL",
            document: currentDocument || "N/A", 
            phone: currentPhone || "N/A", 
            address: clientAddress || "N/A",
        },
        subtotalUsd: subtotalUsd, 
        totalBs,
        totalUsd, 
        bcvRate: safeBcvRate,
        paymentMethod,
        // 🔑 AÑADIDA DESCRIPCIÓN EXTENDIDA DEL MÉTODO DE PAGO
        paymentMethodDescription: getPaymentMethodDescription(paymentMethod, paymentBreakdown),
        discountApplied: safeDiscount,
        discountUsd: discountAmountUsd, 
        createdAt: Timestamp.now(),
      }

      if (paymentMethod === "mixed") {
        const totalPagadoUsd = paymentBreakdown
            .filter(p => p.currency === 'USD')
            .reduce((sum, p) => sum + p.amount, 0);
        
        const totalPagadoBs = paymentBreakdown
            .filter(p => p.currency === 'BS')
            .reduce((sum, p) => sum + p.amount, 0);
            
        saleData.paymentBreakdown = {
          totalPagadoUsd: totalPagadoUsd,
          totalPagadoBs: totalPagadoBs, 
          detallePagos: paymentBreakdown.map(p => ({
              method: p.method,
              currency: p.currency,
              amount: p.amount, 
              amountBsEquivalent: p.amountBsEquivalent,
          })),
        }
      }

      // 🔑 NUMERACIÓN CORRELATIVA
      //
      // El número y la venta se escriben en la MISMA transacción: o salen los
      // dos o no sale ninguno. Por eso la serie no deja huecos aunque falle el
      // guardado a mitad.
      //
      // Si no hay servidor (sin luz, sin internet, cuota agotada) la venta se
      // guarda igual pero sin número, marcada como pendiente. Nunca se inventa
      // un número provisional: uno que después cambia es peor que ninguno.
      let numeroAsignado: string | null = null
      let ventaCreadaId: string | null = null

      // Costo de la mercancía en el momento de la venta, para poder calcular
      // después la utilidad y la reposición. Va en su propio documento porque
      // el cajero puede leer sus propias ventas, y si el costo estuviera
      // dentro le llegaría en la respuesta.
      const costoVenta = (ventaId: string) => [
        {
          coleccion: "ventas_costos",
          id: ventaId,
          data: {
            negocioId: negocioId ?? user.uid,
            ventaId,
            createdAt: Timestamp.now(),
            items: cartLines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              // El costo se toma del catálogo con costos si quien vende puede
              // verlo; si es un cajero, queda en 0 y lo completa el encargado.
              costUsdUnit: Number((line.product as { costUsd?: number } | undefined)?.costUsd) || 0,
              priceUsdUnit: line.unitUsd,
            })),
          },
        },
      ]

      try {
        const creada = await createNumberedDocument({
          negocioId: negocioId ?? user.uid,
          tipo: "nota_entrega",
          coleccion: "ventas",
          buildData: (numeracion) => ({ ...saleData, ...numeracion }),
          extraDocs: costoVenta,
        })
        numeroAsignado = creada.numeroDocumento
        ventaCreadaId = creada.id
      } catch (error) {
        if (!isOfflineError(error)) throw error

        // Sin servidor: se guarda por la vía normal, que sí funciona sin
        // conexión porque Firestore la encola en el disco del navegador.
        await addDoc(collection(db, "ventas"), {
          ...saleData,
          ...unnumbered("nota_entrega"),
        })
        reportFirestoreError(error)
      }

      // Fiado: la venta ya está registrada, ahora se anota la deuda.
      //
      // Va DESPUÉS y no dentro de la transacción de la venta porque la deuda
      // toca el saldo del cliente, y meter ese documento en la transacción del
      // correlativo obligaría a leerlo dentro de ella. Si esto fallara quedaría
      // una venta cobrada como fiada sin su deuda, así que se avisa en voz
      // alta: es lo único de todo el cobro que el cajero tendría que arreglar
      // a mano.
      if (esFiado && currentClientId) {
        try {
          const vence = new Date()
          vence.setDate(vence.getDate() + diasPlazo)

          await registrarDeuda({
            negocioId: negocioId ?? user.uid,
            clienteId: currentClientId,
            clienteNombre: clientName || "Cliente",
            ventaId: ventaCreadaId ?? undefined,
            numeroDocumento: numeroAsignado ?? undefined,
            montoUsd: totalUsd,
            venceEn: diasPlazo > 0 ? vence : null,
            creadoPor: user.uid,
          })
        } catch (error) {
          reportFirestoreError(error)
          alert(
            `LA VENTA SE GUARDÓ, PERO LA DEUDA NO.\n\nAnótala a mano en Clientes: ${clientName} debe ${totalUsd.toFixed(2)} $.`,
          )
        }
      }

      // 3. Descontar el inventario.
      //
      // Antes se recorría el carrito escribiendo `quantity: product.quantity - item.quantity`
      // línea por línea. Eso tenía dos fallos: si un producto aparecía en varias
      // líneas (típico en venta por peso) solo se descontaba la última, porque
      // todas partían de la misma cantidad leída al cargar la vista; y si dos
      // cajas vendían a la vez, la segunda pisaba a la primera.
      //
      // Ahora se suman las unidades por producto y se usa increment(), que hace
      // la resta en el servidor sobre el valor real del momento.
      const quantityByProduct = new Map<string, number>()
      for (const item of cart) {
        // Los servicios no tienen existencias que descontar.
        if (item.saleType === "service") continue
        const previous = quantityByProduct.get(item.productId) ?? 0
        quantityByProduct.set(item.productId, previous + Number(item.quantity))
      }

      const batch = writeBatch(db)
      for (const [productId, quantity] of quantityByProduct) {
        batch.update(doc(db, "productos", productId), { quantity: increment(-quantity) })
      }
      await batch.commit()

      if (numeroAsignado) reportFirestoreSuccess()

      // El recibo se arma con lo que se acaba de cobrar, antes de vaciar el
      // carrito. Se imprime igual sin conexión: es papel, no depende del
      // servidor. Si la venta quedó sin numerar, el recibo lo dice.
      const recibo: ReceiptData = {
        negocio: {
          nombre: businessInfo.businessName || businessName,
          rif: businessInfo.fiscalDocument,
          direccion: businessInfo.fiscalAddress,
          telefono: businessInfo.phoneNumber,
        },
        numeroDocumento: numeroAsignado,
        tipoDocumento: "Nota de entrega",
        fecha: new Date(),
        cajero: user.email,
        cliente: clientName ? { nombre: clientName, documento: currentDocument } : null,
        items: cartLines.map((line) => ({
          nombre: line.name,
          cantidad: line.quantity,
          precioUnitario: line.unitUsd,
          total: line.lineUsd,
        })),
        totales: {
          subtotal: baseTotalUsd,
          descuento: discountAmountUsd,
          total: totalUsd,
          totalBs,
          tasa: bcvRate,
        },
        metodoPago: getPaymentMethodDescription(paymentMethod, paymentBreakdown),
        vueltoBs: vueltoBs > 0 ? vueltoBs : null,
      }

      setUltimoRecibo(recibo)
      if (pricing.autoPrint) printReceipt(recibo, pricing.paperWidth)

      alert(
        numeroAsignado
          ? `Venta registrada · ${numeroAsignado}`
          : "Venta guardada en este dispositivo. Recibirá su número cuando vuelva la conexión.",
      )
      // Limpiar estados
      setCart([])
      setPaymentBreakdown([]) // Limpiar el desglose
      setDiscountPercentage(0)
      setPagaCon("")
      setClientId(null)
      setClientDocumentPrefix("V")
      setClientDocumentNumber("")
      setClientName("") 
      setClientPhonePrefix("0412")
      setClientPhoneNumber("")
      setClientAddress("")
      loadProducts()
    } catch (error) {
      console.error("Error registrando venta:", error)

      // Sin conexión o con la cuota agotada, Firestore guarda la venta en la
      // cola local y la sube sola: no hay que asustar al cajero ni pedirle que
      // vuelva a cobrar, porque cobraría dos veces.
      const estado = reportFirestoreError(error)
      alert(
        estado === "offline" || estado === "quota"
          ? "La venta quedó guardada en este dispositivo y se subirá sola. No la registres de nuevo."
          : "Error al procesar la venta.",
      )
    }
  }

  
  // Determinar si el nuevo monto excede el restante para deshabilitar el botón
  const isNewAmountInvalid = (() => {
      const amount = Number.parseFloat(newPaymentAmount || "0");
      if (amount <= 0 || !Number.isFinite(amount)) return true;
      
      const isUsdPayment = USD_PAYMENT_METHODS.includes(newPaymentMethod);
      const amountBsEquivalent = isUsdPayment ? amount * safeBcvRate : amount;

      const totalRemaining = totalBs - totalCoveredBs;
      // Deshabilita si el pago excede el restante por más de 0.02 Bs (tolerancia de redondeo)
      return amountBsEquivalent > totalRemaining + 0.02;
  })();

  // ==============================================
  // 🖥️ JSX (RENDERIZADO)
  // ==============================================
  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* COLUMNA IZQUIERDA: Búsqueda y Productos */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">
          {/* Sin turno abierto la venta se registra igual, pero no entra en
              ningún cuadre de caja. Vale la pena avisarlo antes de cobrar. */}
          {turnoId === null && (
            <div className="bg-warning/15 text-warning-foreground dark:text-warning flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
              <span aria-hidden>⚠</span>
              <span>
                No tienes la caja abierta. Puedes vender, pero estas ventas no entrarán en el cuadre
                del turno.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-2xl lg:text-3xl font-bold">Punto de Venta</h2>
            <Button
              onClick={() => setScannerActive(!scannerActive)}
              variant={scannerActive ? "default" : "outline"}
              size="sm"
              className="lg:size-default"
            >
              <Scan className="w-4 h-4 lg:mr-2" />
              <span className="hidden lg:inline">{scannerActive ? "Escáner Activo" : "Activar Escáner"}</span>
            </Button>
          </div>

          {scannerActive && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="pt-4">
                <Input
                  autoFocus
                  placeholder="Escanea código..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  className="bg-background"
                />
              </CardContent>
            </Card>
          )}
          
          {/* 🔑 SECCIÓN DE DATOS DEL CLIENTE con PREFIJOS y BÚSQUEDA (Restituida) */}
          <Card>
              <CardHeader>
                  <CardTitle className="text-xl font-semibold flex items-center justify-between">
                      <span>
                          Datos del Cliente
                          {clientId && <span className="text-xs text-green-600 ml-2">(REGISTRADO)</span>}
                      </span>
                  </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  {/* Campo de búsqueda por Cédula/RIF */}
                  <div className="relative col-span-1 sm:col-span-2 flex gap-1 items-center">
                    
                    <select
                        value={clientDocumentPrefix}
                        onChange={(e) => setClientDocumentPrefix(e.target.value)}
                        className="px-2 py-2 border border-input rounded-md bg-background text-sm h-10 w-[70px] flex-shrink-0"
                        disabled={isClientSearching}
                    >
                        {DOCUMENT_PREFIXES.map(p => <option key={p} value={p}>{p}-</option>)}
                    </select>

                    <Input 
                        placeholder="Número de Cédula o RIF" 
                        value={clientDocumentNumber} 
                        onChange={(e) => setClientDocumentNumber(e.target.value.replace(/[^0-9]/g, ''))}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleClientSearch();
                        }}
                        disabled={isClientSearching}
                        className="flex-grow"
                    />
                    <Button
                        onClick={handleClientSearch} 
                        variant="ghost"
                        size="sm"
                        className="p-1 h-10 w-10 flex-shrink-0"
                        disabled={isClientSearching || cleanClientDocumentNumber.length < 5}
                    >
                        {isClientSearching ? '...' : <UserSearch className="w-5 h-5" />}
                    </Button>
                  </div>
                  
                  {/* Nombre y Apellido */}
                  <Input 
                      placeholder="Nombre y Apellido / Razón Social" 
                      value={clientName} 
                      onChange={(e) => setClientName(e.target.value)}
                      disabled={isClientSearching}
                  />
                  
                  {/* Teléfono con Prefijo */}
                  <div className="flex gap-1">
                    <select
                        value={clientPhonePrefix}
                        onChange={(e) => setClientPhonePrefix(e.target.value)}
                        className="px-2 py-2 border border-input rounded-md bg-background text-sm h-10 w-[90px] flex-shrink-0"
                        disabled={isClientSearching}
                    >
                        {PHONE_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <Input 
                        placeholder="Número (Ej: 1234567)" 
                        value={clientPhoneNumber} 
                        onChange={(e) => setClientPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))} 
                        disabled={isClientSearching}
                        className="flex-grow"
                    />
                  </div>

                  <Input 
                      placeholder="Dirección (Opcional)" 
                      value={clientAddress} 
                      onChange={(e) => setClientAddress(e.target.value)} 
                      className="col-span-1 sm:col-span-2"
                      disabled={isClientSearching}
                  />
              </CardContent>
          </Card>
          
          {/* 🔑 Bloque de BÚSQUEDA Y FILTRO POR CATEGORÍA Y PAGINACIÓN */}
          <div className="mb-6 space-y-3">
            {/* Controles de Búsqueda y Filtro */}
            <div className="flex gap-4">
                <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Buscar productos por nombre o categoría..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
                <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                >
                    <option value="all">Todas las Categorías</option>
                    {uniqueCategories.map(category => (
                        <option key={category} value={category}>{category}</option>
                    ))}
                </select>
            </div>
            
            {/* Mensaje de resultados */}
            {filteredProducts.length > 0 && (
              <p className="text-sm text-gray-600 mt-2">{filteredProducts.length} producto(s) encontrado(s)</p>
            )}

            {/* 🔑 CONTROLES DE PAGINACIÓN */}
            {totalPages > 1 && (
                <div className="flex justify-between items-center pt-3 border-t border-dashed">
                    <Button 
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        variant="outline"
                        size="sm"
                    >
                        Página Anterior
                    </Button>
                    <span className="text-sm font-medium">
                        Página {currentPage} de {totalPages}
                    </span>
                    <Button 
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        variant="outline"
                        size="sm"
                    >
                        Página Siguiente
                    </Button>
                </div>
            )}
            
          </div>

          <div>
            <h3 className="text-base lg:text-lg font-semibold mb-3">Productos Disponibles</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
              {/* 🔑 USANDO paginatedProducts EN LUGAR DE filteredProducts */}
              {paginatedProducts.map((product) => {
                // Uso de la nueva función para determinar el precio a mostrar
                const displayPrices = getDisplayPrice(product);
                const salePrice = displayPrices.usd;
                const salePriceBs = displayPrices.bs;

                // Marcador visual para saber qué precio se está usando
                const isPriceDiscounted = isPayingInDivisa;
                const priceLabel = isPriceDiscounted ? "PRECIO USD (Dscto)" : "PRECIO BASE (Bs)";
                const priceColor = isPriceDiscounted ? "text-green-500" : "text-red-500";

                return (
                  <Card key={product.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-4">
                      <div className="mb-3">
                        <h4 className="font-semibold text-base">{product.name}</h4>
                        <p className="text-xs text-muted-foreground">{product.category}</p>
                      </div>
                      <div className="space-y-1 mb-3 text-sm">
                        
                        <div className="flex justify-between items-center">
                            <span className={`text-xs font-bold ${priceColor}`}>{priceLabel}:</span>
                            <span className="font-semibold tabular-nums">{formatMoney(salePrice)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Bs:</span>
                          <span className="font-semibold tabular-nums">
                            {salePriceBs !== null ? formatBs(salePriceBs) : "sin tasa"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs pt-1 border-t">
                          <span className="text-muted-foreground">
                            Stock: <span className="font-medium text-foreground">{product.quantity}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Tipo: <span className="font-medium text-foreground">{product.saleType}</span>
                          </span>
                        </div>
                      </div>
                      <Button
                        onClick={() => openAddDialog(product)}
                        className="w-full bg-primary hover:bg-primary/90"
                        size="sm"
                      >
                        Agregar
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
              
              {/* Mensaje si no hay productos en la página actual */}
              {paginatedProducts.length === 0 && filteredProducts.length > 0 && (
                <p className="text-center text-muted-foreground col-span-2 py-8">
                    No hay productos en esta página. Vuelve a la página anterior.
                </p>
              )}
               {filteredProducts.length === 0 && (
                <p className="text-center text-muted-foreground col-span-2 py-8">
                    No se encontraron productos con el filtro o término de búsqueda actual.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: Carrito y Pago */}
        <button
          onClick={() => setShowCart(true)}
          className="lg:hidden fixed bottom-6 right-6 z-50 bg-primary text-primary-foreground rounded-full p-4 shadow-lg hover:bg-primary/90 transition-all"
        >
          <ShoppingCart className="w-6 h-6" />
          {cart.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-semibold">
              {cart.length}
            </span>
          )}
        </button>

        <div
          className={`
          lg:col-span-1
          fixed lg:static
          inset-0 lg:inset-auto
          z-50 lg:z-auto
          bg-black/50 lg:bg-transparent
          ${showCart ? "block" : "hidden"} lg:block
        `}
        >
          <div className="h-full lg:h-auto flex items-end lg:items-start justify-center lg:justify-start p-4 lg:p-0">
            {/* 🔑 AJUSTE DE ALTURA FIJA Y STICKY PARA EL SCROLL INTERNO */}
            <Card className="w-full max-w-lg lg:max-w-none lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] flex flex-col">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg lg:text-xl">Carrito de Ventas</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowCart(false)} className="lg:hidden">
                    ✕
                  </Button>
                </div>
              </CardHeader>
              {/* 🔑 CONTENIDO DEL CARRITO CON SCROLLBAR */}
              <CardContent className="space-y-4 flex-1 overflow-y-auto flex flex-col">
                {cart.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Carrito vacío</p>
                ) : (
                  <div className="space-y-3 overflow-y-auto flex-1 pr-2">
                    {cartLines.map((line) => {
                      const item = line
                      const unitPriceToDisplay = line.unitUsd
                      const lineTotalBs = line.lineBs

                      return (
                        <div
                          key={`${item.productId}-${item.saleType}-${item.kg || 0}`} 
                          className="border border-border rounded-lg p-3"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-semibold text-sm">{item.name}</h4>
                            <button
                              onClick={() => removeFromCart(item)}
                              className="text-destructive hover:bg-destructive/10 p-1 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex items-center gap-2 mb-2">
                            <button
                              onClick={() => updateQuantity(item, Number(item.quantity) - 1)}
                              className="p-1 hover:bg-muted rounded"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item, Number.parseFloat(e.target.value))}
                              className="w-16 text-center text-sm h-8"
                            />
                            <button
                              onClick={() => updateQuantity(item, Number(item.quantity) + 1)}
                              className="p-1 hover:bg-muted rounded"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="text-sm text-muted-foreground">
                            <span className={`font-semibold ${isPayingInDivisa ? 'text-purple-600' : 'text-foreground'}`}>
                                {formatMoney(unitPriceToDisplay)}
                            </span>
                            x {item.quantity} ud/kg
                            {item.saleType === "weight" && ` — ${item.kg} kg`}
                          </div>
                          <div className="text-base font-semibold text-primary">
                            Total: {bcvRate ? formatBs(lineTotalBs) : formatMoney(line.lineUsd)}
                          </div>
                          {!isPayingInDivisa && (
                              <p className="text-xs text-muted-foreground mt-1">
                                  Precio de lista (sin ajuste por pago en divisa)
                              </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                
                {/* 🔑 BLOQUE DE TOTALES Y PAGOS SIN SCROLL (siempre visible) */}
                <div className="border-t border-border pt-4 space-y-3 flex-shrink-0">
                  
                  <div className="pt-2">
                    <label htmlFor="discount-input" className="text-sm font-medium flex justify-between items-center">
                        <span>Porcentaje de Descuento (%)</span>
                        {discountRate > 0 && (
                            <span className="text-sm text-green-600 font-semibold">
                                - ${(baseTotalUsd * discountRate).toFixed(2)} USD
                            </span>
                        )}
                    </label>
                    <Input
                      id="discount-input"
                      value={discountPercentage === 0 ? "" : discountPercentage}
                      onChange={(e) => {
                          const value = Number.parseInt(e.target.value)
                          setDiscountPercentage(Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0)
                      }}
                      placeholder="0"
                      min="0"
                      max="100"
                      className="w-full text-center text-lg h-10 border-dashed border-2 mt-1"
                    />
                  </div>
                  
                  {/* Totales */}
                  <div className="flex justify-between font-medium text-sm">
                      <span>Subtotal (Base):</span>
                      <span>${baseTotalUsd.toFixed(2)}</span>
                  </div>
                   <div className="flex justify-between font-medium text-sm text-red-600 dark:text-red-400">
                      <span>{discountText}</span>
                      <span>- ${discountAmountUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg border-t pt-2">
                    <span>Total USD:</span>
                    <span>${totalUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-xl text-primary">
                    <span>Total Bs:</span>
                    <span>Bs {totalBs.toFixed(2)}</span>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Método de Pago</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => {
                          setPaymentMethod(e.target.value as PaymentMethod);
                          // Limpiar el desglose si se cambia a un método simple
                          if (e.target.value !== "mixed") {
                              setPaymentBreakdown([]);
                          }
                      }}
                      className="w-full px-3 py-2 border border-input rounded-md bg-background mt-2 text-sm"
                    >
                      <option value="cash">Efectivo (USD)</option>
                      <option value="zelle">Zelle</option>
                      <option value="binance">Binance</option>
                      <option value="debit">Débito</option>
                      <option value="transfer">Transferencia Bancaria</option>
                      <option value="pagoMovil">Pago Móvil</option>
                      <option value="biopago">Biopago</option> 
                      <option value="mixed">Mixto (Múltiples Pagos)</option>
                      {/* Fiar es dar mercancía sin cobrar, así que va detrás de
                          su propio permiso y separado del resto de la lista. */}
                      {allows("sales.credit") && <option value="credit">Fiado (queda a deber)</option>}
                    </select>
                  </div>

                  {esFiado && (
                    <div className="border-warning/40 bg-warning/5 space-y-3 rounded-md border p-3">
                      <p className="text-sm font-medium">
                        No entra dinero: queda como deuda del cliente.
                      </p>

                      <div>
                        <label className="text-sm font-medium" htmlFor="plazo-fiado">
                          Plazo para pagar
                        </label>
                        <select
                          id="plazo-fiado"
                          value={diasPlazo}
                          onChange={(e) => setDiasPlazo(Number(e.target.value))}
                          className="border-input bg-background mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value={7}>Una semana</option>
                          <option value={15}>Quince días</option>
                          <option value={30}>Un mes</option>
                          <option value={0}>Sin fecha</option>
                        </select>
                      </div>

                      {/* El saldo actual del cliente, antes de fiarle más. Es
                          el dato que decide si esta venta se hace o no. */}
                      {clienteDelFiado ? (
                        <p className="text-muted-foreground text-xs">
                          {clienteDelFiado.saldoDeudaUsd > 0
                            ? `Ya te debe ${formatMoney(clienteDelFiado.saldoDeudaUsd)}. Con esta venta pasaría a ${formatMoney(clienteDelFiado.saldoDeudaUsd + totalUsd)}.`
                            : "Este cliente no te debe nada ahora mismo."}
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          Busca al cliente por su cédula para ver cuánto debe ya.
                        </p>
                      )}

                      {!avisoFiado.permitido && (
                        <p className="text-destructive text-xs font-medium">{avisoFiado.motivo}</p>
                      )}
                    </div>
                  )}

                  {/* 🔑 Bloque Unificado de Pago Mixto (AQUÍ ESTÁ LA CORRECCIÓN DEL BOTÓN) */}
                  {paymentMethod === "mixed" && (
                    <div className="space-y-3 p-3 border rounded-md bg-muted/20">
                      <h4 className="font-semibold text-sm">Desglose de Pagos para Cubrir Bs {totalBs.toFixed(2)}</h4>
                        
                      {/* Lista de Pagos Añadidos - CON SCROLL BAR FIJO */}
                      {paymentBreakdown.length > 0 && (
                          <div className="space-y-2 max-h-32 overflow-y-auto pr-2"> 
                            <h5 className="text-xs font-semibold text-muted-foreground">Métodos Utilizados:</h5>
                            {paymentBreakdown.map((p) => (
                              <div key={p.id} className="flex justify-between items-center text-sm p-2 bg-background rounded-md border">
                                <span className="font-medium text-primary">
                                    {getMethodDisplayName(p.method)}:
                                </span>
                                
                                <span className="font-bold text-foreground">
                                    {p.currency === 'USD' ? `$${p.amount.toFixed(2)}` : `Bs ${p.amount.toFixed(2)}`}
                                </span>
                                
                                <span className="text-xs text-muted-foreground ml-2">
                                    (Equiv. Bs {p.amountBsEquivalent.toFixed(2)})
                                </span>
                                
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removePaymentLine(p.id)}
                                  className="h-6 w-6 flex-shrink-0"
                                >
                                  <X className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            ))}
                          </div>
                      )}


                      {/* Formulario para Añadir Nuevo Pago CON BOTÓN "Añadir Restante" */}
                      <div className="pt-2 border-t mt-3">
                          <div className="flex justify-between items-center mb-1">
                              <label className="text-sm font-medium">Añadir Nuevo Pago</label>
                              {/* 🔑 BOTÓN AÑADIR RESTANTE: Se muestra si el restante es positivo */}
                              {safeRemainingBs > 0 && (
                                  <Button
                                      onClick={() => {
                                          const isUsdPayment = USD_PAYMENT_METHODS.includes(newPaymentMethod);
                                          let amountToAdd: number;

                                          if (isUsdPayment) {
                                              // Convertir el restante en Bs a USD, redondeando a 2 decimales
                                              amountToAdd = Math.round((safeRemainingBs / safeBcvRate) * 100) / 100;
                                          } else {
                                              // El monto en Bs es el restante, redondeando a 2 decimales
                                              amountToAdd = Math.round(safeRemainingBs * 100) / 100;
                                          }
                                          setNewPaymentAmount(amountToAdd.toString());
                                      }}
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs px-2 py-0 border-dashed hover:bg-primary/5"
                                  >
                                      Añadir Restante ({USD_PAYMENT_METHODS.includes(newPaymentMethod) ? 'USD' : 'Bs'})
                                  </Button>
                              )}
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <select
                                value={newPaymentMethod}
                                onChange={(e) => setNewPaymentMethod(e.target.value as BreakdownMethod)}
                                className="px-2 py-1 border border-input rounded-md bg-background text-sm h-9 col-span-1"
                            >
                                <option value="cash">Efectivo USD</option>
                                <option value="zelle">Zelle USD</option>
                                <option value="binance">Binance USD</option>
                                <option value="debit">Débito Bs</option>
                                <option value="transfer">Transferencia Bs</option>
                                <option value="pagoMovil">Pago Móvil Bs</option>
                                <option value="biopago">Biopago Bs</option>
                            </select>
                            <Input
                                value={newPaymentAmount}
                                onChange={(e) => setNewPaymentAmount(e.target.value)}
                                placeholder="Monto (USD/Bs)"
                                type="number"
                                step="0.01"
                                className="text-sm h-9 col-span-1"
                            />
                            <Button 
                              onClick={addPaymentLine} 
                              size="sm" 
                              className="h-9 col-span-1"
                              disabled={isNewAmountInvalid}
                            >
                              Añadir Pago
                            </Button>
                          </div>
                           {isNewAmountInvalid && (
                              <p className="text-xs text-red-500 mt-1">El monto debe ser válido y no puede exceder el restante por pagar.</p>
                          )}
                      </div>
                        
                      {/* Resumen y Restante */}
                      <div className="pt-2 border-t space-y-1">
                          <div className="flex justify-between text-sm font-medium">
                              <span>Total Pagado (Equiv. Bs):</span>
                              <span className={safeRemainingBs > 0 ? "text-orange-500" : "text-green-600"}>Bs {totalCoveredBs.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-base">
                              <span className="text-primary">Restante por Cubrir:</span>
                              <span className="text-red-600">Bs {safeRemainingBs.toFixed(2)}</span>
                          </div>
                      </div>
                    </div>
                  )}

                  {/* Vuelto: solo cuando se cobra con un método en divisa y
                      hay algo en el carrito. En pago mixto no aplica, porque
                      ahí el desglose ya cuadra el total exacto. */}
                  {cart.length > 0 && isPayingInDivisa && (
                    <div className="space-y-2 rounded-lg border p-3">
                      <label htmlFor="paga-con" className="text-sm font-medium">
                        ¿Con cuánto paga?
                      </label>
                      <Input
                        id="paga-con"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder={`Total: ${formatMoney(totalUsd)}`}
                        value={pagaCon}
                        onChange={(e) => setPagaCon(e.target.value)}
                        className="h-11 text-lg tabular-nums"
                      />

                      {hayPago && faltaUsd > 0 && (
                        <p className="text-destructive text-sm font-medium">
                          Faltan {formatMoney(faltaUsd)}
                        </p>
                      )}

                      {hayPago && faltaUsd === 0 && (
                        <div className="bg-primary/10 rounded-md p-3">
                          <p className="text-muted-foreground text-xs">Vuelto</p>
                          {/* La cifra en bolívares es la protagonista: es la que
                              el cajero tiene que sacar de la gaveta. */}
                          <p className="text-primary text-2xl font-bold tabular-nums">
                            {bcvRate ? formatBs(vueltoBs) : "falta la tasa"}
                          </p>
                          <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                            equivale a {formatMoney(vueltoUsd)}
                            {bcvRate ? ` · tasa ${bcvRate.toLocaleString("es-VE", { maximumFractionDigits: 2 })}` : ""}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={handleCheckout}
                    // Deshabilitar si es pago mixto y aún queda un restante significativo
                    disabled={cart.length === 0 || !Number.isFinite(totalUsd) || !Number.isFinite(totalBs) || isClientSearching || (paymentMethod === "mixed" && safeRemainingBs > 0.02) || (esFiado && !avisoFiado.permitido)}
                    className="w-full bg-accent hover:bg-accent/90"
                  >
                    Confirmar Venta
                  </Button>

                  {/* Reimprimir la última: la impresora térmica se atasca, se
                      queda sin papel, o el cliente pide otra copia. */}
                  {ultimoRecibo && (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => printReceipt(ultimoRecibo, pricing.paperWidth)}
                    >
                      <Printer className="w-4 h-4" />
                      Imprimir recibo{ultimoRecibo.numeroDocumento ? ` ${ultimoRecibo.numeroDocumento}` : ""}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </m.div>
  )
}