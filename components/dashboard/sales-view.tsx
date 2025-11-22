"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion" 
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash2, Plus, Minus, Scan, ShoppingCart, Search, UserSearch } from "lucide-react"
import { initBarcodeScanner } from "@/lib/barcode-scanner"
import { getBCVRate } from "@/lib/bcv-service" 

// 🔑 IMPORTACIONES DEL GENERADOR DE PDF
import { generateInvoice, Sale, BusinessInfo } from "@/lib/pdf-generator" 

// ==============================================
// 📦 CONSTANTES PARA PREFIJOS
// ==============================================
const DOCUMENT_PREFIXES = ["V", "E", "P", "R", "J", "G"];
const PHONE_PREFIXES = ["0412", "0422", "0414", "0424", "0416", "0426"];

// 🟢 Métodos de pago que aplican el precio en Divisas (Ajustado/Manual)
const USD_PAYMENT_METHODS: PaymentMethod[] = ["cash", "zelle", "binance"];

// ==============================================
// 📦 INTERFACES
// ==============================================
interface Product {
  id: string
  name: string
  category: string
  costUsd: number
  quantity: number
  profit: number
  saleType: "unit" | "weight" 
  barcode?: string
  salePriceUsdManual?: number 
}

interface CartItem {
  productId: string
  name: string
  quantity: number
  priceUsd: number 
  priceBs: number 
  saleType: "unit" | "weight" 
  kg?: number 
}

type PaymentMethod = "debit" | "cash" | "transfer" | "mixed" | "pagoMovil" | "zelle" | "binance" | "biopago" // AGREGADO: biopago

// ==============================================
// 🛑 Componente Principal
// ==============================================

export default function SalesView() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [bcvRate, setBcvRate] = useState(216.37)
  const [scannerActive, setScannerActive] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [showCart, setShowCart] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [mixedUsd, setMixedUsd] = useState<string>("")
  const [discountPercentage, setDiscountPercentage] = useState(0)
  
  // 🔑 ESTADOS PARA DATOS DEL CLIENTE
  const [clientDocumentPrefix, setClientDocumentPrefix] = useState<string>("V")
  const [clientDocumentNumber, setClientDocumentNumber] = useState("") 
  const [clientName, setClientName] = useState("")
  const [clientPhonePrefix, setClientPhonePrefix] = useState<string>("0412")
  const [clientPhoneNumber, setClientPhoneNumber] = useState("") 
  const [clientAddress, setClientAddress] = useState("")
  const [clientId, setClientId] = useState<string | null>(null) 
  const [isClientSearching, setIsClientSearching] = useState(false)

  // 🔑 ESTADOS PARA INFORMACIÓN DEL NEGOCIO (MOCK UP para el PDF)
  const [businessName] = useState("Mi Negocio - Example C.A.")
  const [businessInfo] = useState<BusinessInfo>({ 
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
      const q = query(collection(db, "productos"), where("userId", "==", user.uid))
      const querySnapshot = await getDocs(q)
      const productsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(), 
      })) as Product[]
      setProducts(productsData)
    } catch (error) {
      console.error("Error loading products:", error)
    } finally {
      setLoading(false)
    }
  }, [user])
  
  useEffect(() => {
    if (!user) return
    loadProducts()
    
    const fetchBcvRate = async () => {
      try {
        const bcvData = getBCVRate() 
        const rate = Number(bcvData.rate)
        if (Number.isFinite(rate) && rate > 0) {
          setBcvRate(rate)
        }
      } catch (error) {
        console.warn("Error fetching BCV rate, using default value.", error)
      }
    }
    fetchBcvRate()
    
    const stopScanner = initBarcodeScanner((code) => {
        setBarcodeInput(code);
        handleBarcodeScanned(code);
    });
    
    return () => {
        if (typeof stopScanner === 'function') {
            stopScanner();
        }
    };
  }, [user, loadProducts])

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
        where("userId", "==", user.uid)
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
  // 💡 FUNCIÓN PARA CALCULAR EL PRECIO BASE (SIN AJUSTES)
  // ==============================================
  const calculateFullBasePrice = (product: Product): number => {
    const costUsd = Number(product.costUsd);
    if (!Number.isFinite(costUsd) || costUsd <= 0) return 0; 

    let profitDecimal = product.profit > 1 ? product.profit / 100 : product.profit;
    if (!Number.isFinite(profitDecimal) || profitDecimal < 0 || profitDecimal >= 1) profitDecimal = 0;

    const divisor = 1 - profitDecimal;
    const fullPrice = costUsd / divisor; 
    return Number.isFinite(fullPrice) ? fullPrice : 0;
  }
  
  // 💡 FUNCIÓN PARA CALCULAR EL PRECIO AJUSTADO (Manual o con 30% de descuento)
  const calculateAdjustedPrice = (product: Product): number => {
    const fullPrice = calculateFullBasePrice(product);
    let finalSalePriceUsd = fullPrice;
    
    if (product.salePriceUsdManual && product.salePriceUsdManual > 0) {
      finalSalePriceUsd = product.salePriceUsdManual;
    } else if (finalSalePriceUsd > 0) {
      finalSalePriceUsd = finalSalePriceUsd * (1 - 0.3);
    }

    return finalSalePriceUsd; 
  }

  // 🟢 FUNCIÓN PARA OBTENER EL PRECIO A MOSTRAR EN LA LISTA DE PRODUCTOS
  const getDisplayPrice = (product: Product): { usd: number, bs: number } => {
    const fullPrice = calculateFullBasePrice(product);
    const adjustedPrice = calculateAdjustedPrice(product);
    const safeBcvRate = bcvRate > 0 ? bcvRate : 1;
    
    // Si el método de pago está en la lista de USD (cash, zelle, binance), usa el precio ajustado.
    // Si no está (débito, transferencia, pago móvil, mixto, biopago), usa el precio completo.
    const isUsingUsdPrice = USD_PAYMENT_METHODS.includes(paymentMethod);
    
    const priceUsdToUse = isUsingUsdPrice ? adjustedPrice : fullPrice;

    return { 
        usd: priceUsdToUse, 
        bs: priceUsdToUse * safeBcvRate 
    };
  };

  // ==============================================
  // 🧮 BLOQUE DE CÁLCULO DE TOTALES (DINÁMICO SEGÚN PAGO)
  // ==============================================
  const safeBcvRate = bcvRate > 0 ? bcvRate : 1 
  
  // 1. Determine la base del precio a usar (ajustado o completo)
  const isPayingInUsd = USD_PAYMENT_METHODS.includes(paymentMethod);
  
  // 2. Calcular el Total Base, usando el precio correcto por unidad
  const baseTotalUsd = cart.reduce((sum, itemInCart) => {
      const product = products.find(p => p.id === itemInCart.productId);
      if (!product) return sum;

      let unitPriceToUse: number;

      if (isPayingInUsd) {
          // Si paga en USD: usa el precio ajustado (almacenado en itemInCart.priceUsd)
          unitPriceToUse = itemInCart.priceUsd; 
      } else {
          // Si paga en Bs (incluyendo Biopago): usa el precio completo sin descuento
          unitPriceToUse = calculateFullBasePrice(product);
      }
      
      return sum + (unitPriceToUse * itemInCart.quantity);
  }, 0);
  
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
  
  const discountText = discountRate > 0 
    ? `Descuento Aplicado (${safeDiscount.toFixed(0)}%):` 
    : 'Descuento:'
    
  // 🔑 LÓGICA DE PAGO MIXTO Y CÁLCULO DE RESTANTE BS
  const mixedUsdValue = Number.parseFloat(mixedUsd || "0");
  const usdPortionInBs = mixedUsdValue * safeBcvRate;
  const remainingBsToPay = totalBs - usdPortionInBs;
  const safeRemainingBs = Math.max(0, remainingBsToPay); // El monto nunca es negativo

  // Valor que se usará para el registro final de pago Bs (calculado)
  const mixedBsCheckoutValue = safeRemainingBs;
  // ==============================================
  
  // ==============================================
  // 💡 FUNCIONES AUXILIARES DE VENTA
  // ==============================================
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
    // Almacena siempre el precio ajustado en el carrito (el precio que se aplica si se paga en USD).
    const salePriceUnitAdjusted = calculateAdjustedPrice(product) 
    
    if (salePriceUnitAdjusted === 0) {
        alert("No se pudo calcular el precio de venta. Revise costo y margen del producto.");
        return;
    }
    if (quantity > product.quantity) { 
      alert("No hay suficiente inventario")
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
      const existingItem = cart[existingItemIndex]
      const newQuantity = Number(existingItem.quantity) + Number(quantity)
      
      if (newQuantity > product.quantity) {
          alert("Cantidad no disponible")
          return
      }

      existingItem.quantity = newQuantity
      existingItem.priceBs = linePriceBs 
      setCart([...cart])
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
    
    const updatedCart = [...cart]
    const itemToUpdate = updatedCart[existingItemIndex]

    itemToUpdate.quantity = newQuantity
    itemToUpdate.priceBs = itemToUpdate.priceUsd * newQuantity * safeBcvRate 
    setCart(updatedCart)
  }
  
  // ==============================================
  // 🛒 Lógica de Checkout FINAL
  // ==============================================
  const handleCheckout = async () => {
    if (!user) return alert("Usuario no autenticado")
    if (cart.length === 0) return alert("El carrito está vacío")

    if (!Number.isFinite(totalUsd) || !Number.isFinite(totalBs)) {
        return alert("Error en el cálculo del total. Por favor, revise los precios y la tasa BCV.");
    }
    
    const currentDocument = fullClientDocument;
    const currentPhone = fullClientPhone;
    const isClientDataEntered = currentDocument.length >= 6 && clientName.trim().length > 0;

    if (paymentMethod === "mixed") {
        const usd = Number.parseFloat(mixedUsd || "0")
        const bs = mixedBsCheckoutValue; // Usamos el valor CALCUADO
        
        if (isNaN(usd) || usd < 0) return alert("Ingresa un monto USD válido para el pago mixto");
        
        // Verificación de que el total cubierto es correcto
        const combined = usd * safeBcvRate + bs;
        const roundedTotal = Number(totalBs.toFixed(2));
        const sum = Number(combined.toFixed(2));

        if (Math.abs(sum - roundedTotal) > 0.02)
            return alert(`Error en el cálculo del pago mixto. La suma de los pagos no cubre el total Bs ${roundedTotal.toFixed(2)}.`);
    }

    const confirmation = window.confirm(
      `¿Estás seguro de confirmar la venta?\n\nTotal a Pagar:\nUSD: $${totalUsd.toFixed(2)}\nBs: Bs ${totalBs.toFixed(2)}`
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
          where("userId", "==", user.uid)
        );
        const clientSnapshot = await getDocs(clientQuery);

        if (!clientSnapshot.empty) {
          currentClientId = clientSnapshot.docs[0].id;
        } else {
          // Registrar nuevo cliente
          const newClientData = {
            userId: user.uid,
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
      
      // OBTENER EL PRECIO FINAL REAL POR UNIDAD PARA LA DB/FACTURA
      const itemsForSale = cart.map((item) => {
          const product = products.find(p => p.id === item.productId);
          if (!product) {
              return { ...item, totalUsdLine: item.priceUsd * item.quantity, priceUsdUnit: item.priceUsd };
          }
          
          let finalUnitUsd: number;
          if (isPayingInUsd) {
              // PAGO EN USD: usa el precio ajustado/manual que está en item.priceUsd
              finalUnitUsd = item.priceUsd; 
          } else {
              // PAGO EN BS (incluyendo Biopago): usa el precio completo/base
              finalUnitUsd = calculateFullBasePrice(product);
          }

          return {
              ...item,
              totalUsdLine: finalUnitUsd * item.quantity,
              priceUsdUnit: finalUnitUsd,
          };
      });

      const saleData: any = {
        userId: user.uid,
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
        discountApplied: safeDiscount,
        discountUsd: discountAmountUsd, 
        createdAt: Timestamp.now(),
      }

      if (paymentMethod === "mixed") {
        saleData.paymentBreakdown = {
          pagoUsd: Number.parseFloat(mixedUsd || "0"),
          pagoBs: mixedBsCheckoutValue, // Usamos el valor calculado
        }
      }

      const newSaleRef = await addDoc(collection(db, "ventas"), saleData) 

      // 🔑 3. GENERAR PDF DE FACTURA
      // COMENTADO: Desactivar la generación automática de PDF
      /*
      const saleForPdf: Sale = {
          id: newSaleRef.id,
          createdAt: { toDate: () => new Date() }, 
          clientName: clientName || "CONSUMIDOR FINAL",
          clientDocument: currentDocument || "N/A",
          clientAddress: clientAddress || "N/A",
          clientPhone: currentPhone || "N/A",
          cart: itemsForSale.map(item => ({ 
              productId: item.productId,
              name: item.name,
              quantity: item.quantity,
              priceUsd: item.priceUsdUnit, 
          })),
          subtotalUsd: subtotalUsd, 
          discountUsd: discountAmountUsd, 
          ivaUsd: 0, 
          totalUsd: totalUsd,
          totalBs: totalBs,
          bcvRate: safeBcvRate,
          paymentMethod: paymentMethod,
      }

      generateInvoice(businessName, saleForPdf, businessInfo) 
      */

      // 4. Actualizar Inventario 
      for (const item of cart) {
        const product = products.find((p) => p.id === item.productId)
        if (product) {
          await updateDoc(doc(db, "productos", product.id), {
            quantity: product.quantity - item.quantity,
          })
        }
      }

      alert("Venta registrada exitosamente")
      // Limpiar estados
      setCart([])
      setMixedUsd("")
      setDiscountPercentage(0)
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
      alert("Error al procesar la venta")
    }
  }

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  // ==============================================
  // 🖥️ JSX (RENDERIZADO)
  // ==============================================
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">
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
          
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar productos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {searchTerm && (
              <p className="text-sm text-gray-600 mt-2">{filteredProducts.length} producto(s) encontrado(s)</p>
            )}
          </div>

          <div>
            <h3 className="text-base lg:text-lg font-semibold mb-3">Productos Disponibles</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
              {filteredProducts.map((product) => {
                // Uso de la nueva función para determinar el precio a mostrar
                const displayPrices = getDisplayPrice(product);
                const salePrice = displayPrices.usd;
                const salePriceBs = displayPrices.bs;

                // Marcador visual para saber qué precio se está usando
                const isFullPrice = !USD_PAYMENT_METHODS.includes(paymentMethod);
                const priceLabel = isFullPrice ? "PRECIO BASE (Bs)" : "PRECIO USD (Dscto)";
                const priceColor = isFullPrice ? "text-red-500" : "text-green-500";

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
                            <span className="font-semibold">${salePrice.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Bs:</span>
                          <span className="font-semibold">Bs {salePriceBs.toFixed(2)}</span>
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
            </div>
          </div>
        </div>

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
            <Card className="w-full max-w-lg lg:max-w-none lg:sticky lg:top-6 max-h-[90vh] lg:max-h-[calc(100vh-3rem)] flex flex-col">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg lg:text-xl">Carrito de Ventas</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowCart(false)} className="lg:hidden">
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 overflow-hidden flex flex-col">
                {cart.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Carrito vacío</p>
                ) : (
                  <div className="space-y-3 overflow-y-auto flex-1 pr-2">
                    {cart.map((item) => {
                      const product = products.find(p => p.id === item.productId);
                      if (!product) return null;

                      // LÓGICA DE VISUALIZACIÓN DINÁMICA
                      const unitPriceFull = calculateFullBasePrice(product);
                      // Precio unitario a mostrar en el carrito (coincide con el precio del producto si no es USD)
                      const unitPriceToDisplay = isPayingInUsd ? item.priceUsd : unitPriceFull;
                      const lineTotalBs = unitPriceToDisplay * item.quantity * safeBcvRate;

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
                            <span className={`font-semibold ${isPayingInUsd ? 'text-purple-600' : 'text-foreground'}`}>
                                ${unitPriceToDisplay.toFixed(2)} USD
                            </span>
                            x {item.quantity} ud/kg
                            {item.saleType === "weight" && ` — ${item.kg} kg`}
                          </div>
                          <div className="text-base font-semibold text-primary">
                            Total: Bs {lineTotalBs.toFixed(2)}
                          </div>
                          {!isPayingInUsd && (
                              <p className="text-xs text-muted-foreground mt-1">
                                  Usando precio completo (${unitPriceFull.toFixed(2)})
                              </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

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
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="w-full px-3 py-2 border border-input rounded-md bg-background mt-2 text-sm"
                    >
                      <option value="cash">Efectivo (USD)</option>
                      <option value="zelle">Zelle</option>
                      <option value="binance">Binance</option>
                      <option value="debit">Débito</option>
                      <option value="transfer">Transferencia Bancaria</option>
                      <option value="pagoMovil">Pago Móvil</option>
                      <option value="biopago">Biopago</option> {/* AGREGADO */}
                      <option value="mixed">Mixto</option>
                    </select>
                  </div>

                  {/* Componente React de Pago Mixto con cálculo de restante Bs */}
                  {paymentMethod === "mixed" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Efectivo (USD) Entregado</label>
                        <Input
                          id="usd-input"
                          value={mixedUsd}
                          onChange={(e) => setMixedUsd(e.target.value)}
                          placeholder="0.00"
                          type="number"
                          step="0.01"
                          className="text-sm h-9"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-primary">Restante en Bs a Pagar</label>
                        <Input
                          id="bs-input-calculated"
                          value={safeRemainingBs.toFixed(2)} 
                          readOnly 
                          placeholder="0.00"
                          className="text-sm h-9 font-bold bg-primary/10 border-primary"
                        />
                      </div>
                      <div className="col-span-2 text-xs text-muted-foreground">
                        {remainingBsToPay > 0 
                            ? `El cliente debe pagar ${safeRemainingBs.toFixed(2)} Bs adicionales.` 
                            : "El monto USD cubre el total o hay un excedente."
                        }
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={handleCheckout}
                    disabled={cart.length === 0 || !Number.isFinite(totalUsd) || !Number.isFinite(totalBs) || isClientSearching}
                    className="w-full bg-accent hover:bg-accent/90"
                  >
                    Confirmar Venta
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </motion.div>
  )
}