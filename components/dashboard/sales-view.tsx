"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion" 
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash2, Plus, Minus, Scan, ShoppingCart, Search } from "lucide-react"
// Asumiendo que estas funciones existen y son funcionales
import { initBarcodeScanner } from "@/lib/barcode-scanner"
// Importa getBCVRate. Asegúrate de que esta función exista y retorne { rate: number }
import { getBCVRate } from "@/lib/bcv-service" 

interface Product {
  id: string
  name: string
  category: string
  costUsd: number
  quantity: number
  profit: number
  saleType: "unit" | "weight" 
  barcode?: string
}

interface CartItem {
  productId: string
  name: string
  quantity: number
  priceUsd: number // Precio unitario de venta (USD)
  priceBs: number // Precio total de la línea (Bs)
  saleType: "unit" | "weight" 
  kg?: number 
}

type PaymentMethod = "debit" | "cash" | "transfer" | "mixed" | "pagoMovil" | "zelle" | "binance"

// ----------------------------------------------------
// 🛑 Componente Principal
// ----------------------------------------------------

export default function SalesView() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [bcvRate, setBcvRate] = useState(216.37) // Valor inicial de respaldo
  const [scannerActive, setScannerActive] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [showCart, setShowCart] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [mixedUsd, setMixedUsd] = useState<string>("")
  const [mixedBs, setMixedBs] = useState<string>("")
  const [discountPercentage, setDiscountPercentage] = useState(0) // 👈 NUEVO: Estado para % de descuento
  
  // ----------------------------------------------------
  // 💡 Carga Inicial: Productos y Tasa BCV
  // ----------------------------------------------------
  useEffect(() => {
    if (!user) return
    loadProducts()
    
    const fetchBcvRate = async () => {
      try {
        // Asume que getBCVRate() es síncrono si no usas await o es una simulación
        const bcvData = getBCVRate() 
        const rate = Number(bcvData.rate)
        // ✅ CORRECCIÓN CLAVE: Asegurar que la tasa es un número finito y positivo.
        if (Number.isFinite(rate) && rate > 0) {
          setBcvRate(rate)
        }
      } catch (error) {
        console.warn("Error fetching BCV rate, using default value.", error)
      }
    }
    fetchBcvRate()
  }, [user])
  
  // ----------------------------------------------------
  // 💡 BLOQUE DE CÁLCULO DE TOTALES (ROBUSTO)
  // ----------------------------------------------------
  // Totales base (antes de descuento)
  const baseTotalBs = cart.reduce((sum, i) => sum + i.priceBs, 0)
  const safeBcvRate = bcvRate > 0 ? bcvRate : 1 // 🚨 Seguridad: Tasa mínima 1 para evitar división por cero
  const baseTotalUsd = baseTotalBs / safeBcvRate

  // Lógica de Descuento Dinámico
  const safeDiscount = Math.max(0, Math.min(100, Number(discountPercentage) || 0)); // Limita el input entre 0 y 100
  const discountRate = safeDiscount / 100; // Tasa de descuento como decimal (0 a 1)
  
  // DEFINICIÓN DE TOTALUSD Y TOTALBS (Aplicando el descuento)
  const totalUsd = baseTotalUsd * (1 - discountRate) // Fórmula: Precio * (1 - Tasa)
  const totalBs = totalUsd * safeBcvRate
  
  // Texto de descuento actualizado
  const discountText = discountRate > 0 
    ? `Descuento Aplicado (${safeDiscount.toFixed(0)}%):` 
    : 'Descuento:'
  // ----------------------------------------------------

  useEffect(() => {
    if (!scannerActive) return
    const unsubscribe = initBarcodeScanner(handleBarcodeScanned)
    return unsubscribe
  }, [scannerActive, products])

  // 🔁 Actualizar automáticamente los montos del pago mixto según lo que se ingrese
  useEffect(() => {
    if (paymentMethod !== "mixed" || !Number.isFinite(totalUsd)) return

    const totalEnBs = totalUsd * safeBcvRate 

    // Si el usuario escribe en USD, calculamos el resto en Bs
    if (mixedUsd && !isNaN(Number.parseFloat(mixedUsd)) && document.activeElement?.id === "usd-input") {
      const usd = Number.parseFloat(mixedUsd)
      const restanteBs = Math.max(totalEnBs - usd * safeBcvRate, 0)
      setMixedBs(restanteBs.toFixed(2))
    }

    // Si el usuario escribe en Bs, calculamos el resto en USD
    if (mixedBs && !isNaN(Number.parseFloat(mixedBs)) && document.activeElement?.id === "bs-input") {
      const bs = Number.parseFloat(mixedBs)
      const restanteUsd = Math.max((totalEnBs - bs) / safeBcvRate, 0)
      setMixedUsd(restanteUsd.toFixed(2))
    }
  }, [mixedUsd, mixedBs, paymentMethod, safeBcvRate, totalUsd]) 

  const loadProducts = async () => {
    if (!user) return
    setLoading(true)
    try {
      const q = query(collection(db, "productos"), where("userId", "==", user.uid))
      const snapshot = await getDocs(q)
      const productsData = snapshot.docs.map((doc) => {
          const data = doc.data()
          return ({ 
              id: doc.id, 
              ...data,
              // ⭐️ CORRECCIÓN CLAVE: Forzar la conversión a número para evitar NaN
              costUsd: Number(data.costUsd) || 0,
              quantity: Number(data.quantity) || 0,
              profit: Number(data.profit) || 0,
          }) 
      }) as Product[]
      setProducts(productsData)
    } catch (error) {
      console.error("Error loading products:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleBarcodeScanned = (code: string) => {
    const product = products.find((p) => p.barcode === code)
    if (product) openAddDialog(product)
    else alert(`Producto con código ${code} no encontrado`)
  }

  // ⭐️ FUNCIÓN REVISADA: Implementación robusta de PV = Costo / (1 - Margen)
  const calculateSalePrice = (product: Product) => {
    const costUsd = Number(product.costUsd)
    
    // 1. Validar Costo
    if (!Number.isFinite(costUsd) || costUsd <= 0) {
        return 0; 
    }

    // Convertir porcentaje a decimal si es necesario
    let profitDecimal = product.profit > 1 ? product.profit / 100 : product.profit
    
    // 2. Validar Margen (Evitar 100% o inválido)
    if (!Number.isFinite(profitDecimal) || profitDecimal < 0 || profitDecimal >= 1) {
        profitDecimal = 0; // Margen 0 para evitar división por cero o negativo
    }

    // 3. Cálculo de Margen Bruto: PV = Costo / (1 - Margen)
    const divisor = 1 - profitDecimal;
    const salePrice = costUsd / divisor;
    
    // 4. Resultado final (debe ser finito)
    return Number.isFinite(salePrice) ? salePrice : 0;
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
    
    addToCart(product, quantity, undefined, undefined, kg) 
  }

  const addToCart = (product: Product, quantity: number, widthCm?: number, heightCm?: number, kg?: number) => {
    const salePriceUnit = calculateSalePrice(product) // Precio por unidad o por kg (USD)
    
    if (salePriceUnit === 0) {
        alert("No se pudo calcular el precio de venta. Revise costo y margen del producto.");
        return;
    }

    // Inventario: Ambos tipos afectan el inventario
    if (quantity > product.quantity) { 
      alert("No hay suficiente inventario")
      return
    }

    // Key matching: Usa una clave única para ítems de peso
    const itemKey = product.saleType === "weight" 
        ? `${product.id}-${kg}` 
        : product.id
        
    const existingItemIndex = cart.findIndex(i => 
      (i.saleType === "weight" ? `${i.productId}-${i.kg}` : i.productId) === itemKey
    )

    if (existingItemIndex !== -1) {
      const existingItem = cart[existingItemIndex]
      const newQuantity = Number(existingItem.quantity) + Number(quantity)
      
      // Chequeo de inventario con nueva cantidad
      if (newQuantity > product.quantity) {
          alert("Cantidad no disponible")
          return
      }

      existingItem.quantity = newQuantity
      // Se recalcula el total de la línea
      existingItem.priceBs = existingItem.priceUsd * newQuantity * safeBcvRate
      setCart([...cart])
    } else {
      const item: CartItem = {
        productId: product.id,
        name: product.name,
        quantity,
        priceUsd: salePriceUnit, // Precio unitario (USD)
        priceBs: salePriceUnit * quantity * safeBcvRate, // Total de la línea (Bs)
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
      // Usa la misma lógica de clave que addToCart
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
    // Asegurar que la cantidad es un número válido
    const newQuantity = Number.parseFloat(newQuantityInput.toFixed(2))

    if (newQuantity <= 0 || !Number.isFinite(newQuantity)) {
      removeFromCart(item)
      return
    }
    
    const product = products.find((p) => p.id === item.productId)
    if (!product) return

    // Inventario: Ambos tipos afectan el inventario
    if (newQuantity > product.quantity) {
      alert("Cantidad no disponible")
      return
    }
    
    // Encontrar el índice del ítem para mutar el array de forma segura
    const itemKey = item.saleType === "weight" 
        ? `${item.productId}-${item.kg}` 
        : item.productId

    const existingItemIndex = cart.findIndex(i => 
      (i.saleType === "weight" ? `${i.productId}-${i.kg}` : i.productId) === itemKey
    )
    
    if (existingItemIndex === -1) return;
    
    const updatedCart = [...cart]
    const itemToUpdate = updatedCart[existingItemIndex]

    // item.priceUsd contiene el precio unitario
    itemToUpdate.quantity = newQuantity
    // Se recalcula el precio Bs (Precio Unitario * Nueva Cantidad * Tasa BCV)
    itemToUpdate.priceBs = itemToUpdate.priceUsd * newQuantity * safeBcvRate
    setCart(updatedCart)
  }

  const handleCheckout = async () => {
    if (!user) return alert("Usuario no autenticado")
    if (cart.length === 0) return alert("El carrito está vacío")

    // 🚨 Chequeo Final de NaN antes de Checkout
    if (!Number.isFinite(totalUsd) || !Number.isFinite(totalBs)) {
        return alert("Error en el cálculo del total. Por favor, revise los precios y la tasa BCV.");
    }

    if (paymentMethod === "mixed") {
      const usd = Number.parseFloat(mixedUsd || "0")
      const bs = Number.parseFloat(mixedBs || "0")
      const combined = usd * safeBcvRate + bs
      const roundedTotal = Number(totalBs.toFixed(2))
      const sum = Number(combined.toFixed(2))

      if (isNaN(usd) || isNaN(bs)) return alert("Ingresa montos válidos para el pago mixto")
      if (Math.abs(sum - roundedTotal) > 0.02) // Tolerancia pequeña por errores de redondeo
        return alert(`En pago mixto, la suma ($${usd} + Bs ${bs}) debe equivaler al total Bs ${roundedTotal}`)
    }

    // ⭐️ NUEVO: Confirmación antes de procesar la venta
    const confirmation = window.confirm(
      `¿Estás seguro de confirmar la venta?\n\nTotal a Pagar:\nUSD: $${totalUsd.toFixed(2)}\nBs: Bs ${totalBs.toFixed(2)}`
    );

    if (!confirmation) {
      return; // Detiene el proceso si el usuario presiona 'Cancelar'
    }
    // ----------------------------------------------------
    
    try {
      const saleData: any = {
        userId: user.uid,
        items: cart.map((item) => ({
          ...item,
          // Guardar el total USD de la línea
          totalUsdLine: item.priceUsd * item.quantity,
          priceUsdUnit: item.priceUsd, // Claridad: Precio Unitario (USD)
        })),
        totalBs,
        totalUsd,
        bcvRate: safeBcvRate,
        paymentMethod,
        discountApplied: safeDiscount, // Guardamos el porcentaje dinámico (0-100)
        createdAt: Timestamp.now(),
      }

      if (paymentMethod === "mixed") {
        saleData.paymentBreakdown = {
          pagoUsd: Number.parseFloat(mixedUsd || "0"),
          pagoBs: Number.parseFloat(mixedBs || "0"),
        }
      }

      await addDoc(collection(db, "ventas"), saleData)

      // Actualización de inventario
      for (const item of cart) {
        const product = products.find((p) => p.id === item.productId)
        if (product) {
          await updateDoc(doc(db, "productos", product.id), {
            quantity: product.quantity - item.quantity,
          })
        }
      }

      alert("Venta registrada exitosamente")
      setCart([])
      setMixedUsd("")
      setMixedBs("")
      setDiscountPercentage(0) // Reiniciar descuento
      loadProducts() // Recargar productos para actualizar stock
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
                const salePrice = calculateSalePrice(product)
                const salePriceBs = salePrice * safeBcvRate
                return (
                  <Card key={product.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-4">
                      <div className="mb-3">
                        <h4 className="font-semibold text-base">{product.name}</h4>
                        <p className="text-xs text-muted-foreground">{product.category}</p>
                      </div>
                      <div className="space-y-1 mb-3 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">USD:</span>
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
                    {cart.map((item) => (
                      // Usar una clave más robusta para peso: productId-saleType-kg
                      <div
                        key={`${item.productId}-${item.saleType}-${item.kg || 0}`} 
                        className="border border-border rounded-lg p-3"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-sm">{item.name}</h4>
                          <button
                            onClick={() => removeFromCart(item)} // Cambiado a pasar el item completo
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
                          Bs {item.priceBs.toFixed(2)}
                          {item.saleType === "weight" && ` — ${item.kg} kg`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-border pt-4 space-y-3 flex-shrink-0">
                  
                  {/* 👇 INPUT PARA DESCUENTO DINÁMICO 👇 */}
                  <div className="pt-2">
                    <label htmlFor="discount-input" className="text-sm font-medium flex justify-between items-center">
                        <span>Porcentaje de Descuento (%)</span>
                        {/* Muestra el monto del descuento aplicado */}
                        {discountRate > 0 && (
                            <span className="text-sm text-green-600 font-semibold">
                                - ${(baseTotalUsd * discountRate).toFixed(2)} USD
                            </span>
                        )}
                    </label>
                    <Input
                      id="discount-input"
                      type="number"
                      value={discountPercentage === 0 ? "" : discountPercentage} // Muestra vacío si es 0
                      onChange={(e) => {
                          const value = Number.parseInt(e.target.value)
                          // Establece el valor, si no es un número válido, lo pone en 0
                          setDiscountPercentage(Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0)
                      }}
                      placeholder="0"
                      min="0"
                      max="100"
                      className="w-full text-center text-lg h-10 border-dashed border-2 mt-1"
                    />
                  </div>
                  {/* 👆 INPUT PARA DESCUENTO DINÁMICO 👆 */}
                  
                  {/* Totales Actualizados */}
                  <div className="flex justify-between font-semibold">
                    <span>Total USD:</span>
                    <span>${totalUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
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
                      <option value="mixed">Mixto</option>
                    </select>
                  </div>

                  {paymentMethod === "mixed" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Efectivo (USD)</label>
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
                        <label className="text-xs text-muted-foreground">Transferencia (Bs)</label>
                        <Input
                          id="bs-input"
                          value={mixedBs}
                          onChange={(e) => setMixedBs(e.target.value)}
                          placeholder="0.00"
                          type="number"
                          step="0.01"
                          className="text-sm h-9"
                        />
                      </div>
                      <div className="col-span-2 text-xs text-muted-foreground">
                        Se calcula automáticamente el monto restante según la tasa BCV.
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={handleCheckout}
                    disabled={cart.length === 0 || !Number.isFinite(totalUsd) || !Number.isFinite(totalBs)}
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