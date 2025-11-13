"use client"

import { useState, useEffect } from "react"
// ⭐️ NUEVO: Importación para animaciones
import { motion } from "framer-motion" 
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash2, Plus, Minus, Scan, ShoppingCart, Search } from "lucide-react"
import { initBarcodeScanner } from "@/lib/barcode-scanner"
import { getBCVRate } from "@/lib/bcv-service"

interface Product {
  id: string
  name: string
  category: string
  costUsd: number
  quantity: number
  profit: number
  saleType: "unit" | "weight" // 🚨 ACTUALIZADO: Eliminado "area"
  barcode?: string
}

interface CartItem {
  productId: string
  name: string
  quantity: number
  priceUsd: number
  priceBs: number
  saleType: "unit" | "weight" // 🚨 ACTUALIZADO: Eliminado "area"
  // 🚨 ELIMINADO: widthCm?: number
  // 🚨 ELIMINADO: heightCm?: number
  kg?: number // Usado para cantidad de peso (kg)
}

// 🚨 ELIMINADA: const PRECIO_M2 se ha eliminado.

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

  // Métodos de pago
  const [paymentMethod, setPaymentMethod] = useState<"debit" | "cash" | "transfer" | "mixed">("cash")
  const [mixedUsd, setMixedUsd] = useState<string>("")
  const [mixedBs, setMixedBs] = useState<string>("")

  useEffect(() => {
    if (!user) return
    loadProducts()
    const bcvData = getBCVRate()
    setBcvRate(bcvData.rate)
  }, [user])

  useEffect(() => {
    if (!scannerActive) return
    const unsubscribe = initBarcodeScanner(handleBarcodeScanned)
    return unsubscribe
  }, [scannerActive, products])

  // 🔁 Actualizar automáticamente los montos del pago mixto según lo que se ingrese
  useEffect(() => {
    if (paymentMethod !== "mixed") return

    const totalEnBs = totalUsd * bcvRate

    // Si el usuario escribe en USD, calculamos el resto en Bs
    if (mixedUsd && !isNaN(Number.parseFloat(mixedUsd)) && document.activeElement?.id === "usd-input") {
      const usd = Number.parseFloat(mixedUsd)
      const restanteBs = Math.max(totalEnBs - usd * bcvRate, 0)
      setMixedBs(restanteBs.toFixed(2))
    }

    // Si el usuario escribe en Bs, calculamos el resto en USD
    if (mixedBs && !isNaN(Number.parseFloat(mixedBs)) && document.activeElement?.id === "bs-input") {
      const bs = Number.parseFloat(mixedBs)
      const restanteUsd = Math.max((totalEnBs - bs) / bcvRate, 0)
      setMixedUsd(restanteUsd.toFixed(2))
    }
  }, [mixedUsd, mixedBs, paymentMethod, bcvRate])

  const loadProducts = async () => {
    if (!user) return
    setLoading(true)
    try {
      const q = query(collection(db, "productos"), where("userId", "==", user.uid))
      const snapshot = await getDocs(q)
      const productsData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Product[]
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

  // ⭐️ FUNCIÓN CORREGIDA: Usa la fórmula de Margen Bruto (unificada)
  const calculateSalePrice = (product: Product) => {
    let profitDecimal = product.profit > 1 ? product.profit / 100 : product.profit
    
    // Si el margen es inválido o 100% (causando división por cero), lo ponemos en 0.
    if (isNaN(profitDecimal) || profitDecimal < 0 || profitDecimal >= 1) {
        profitDecimal = 0;
    }

    // 💡 Margen Bruto: PV = Costo / (1 - Margen)
    const divisor = 1 - profitDecimal;
    
    // El cálculo es el mismo para unit/weight ya que costUsd es el costo por la unidad base.
    const salePrice = product.costUsd / divisor;
    
    return Number.isFinite(salePrice) ? salePrice : 0;
  }

  const openAddDialog = (product: Product) => {
    let quantity = 1
    let kg = undefined as number | undefined
    let quantityType = "unidad"

    if (product.saleType === "weight") {
      quantityType = "kg"
      const rawQuantity = prompt(`Ingresa cantidad de kg de ${product.name}:`, "1")
      if (!rawQuantity) return
      kg = Number.parseFloat(rawQuantity) 
      if (isNaN(kg) || kg <= 0) return alert("Kg inválidos")
      quantity = kg
    }
    
    // 🚨 SIMPLIFICADO: Eliminados widthCm/heightCm
    addToCart(product, quantity, undefined, undefined, kg) 
  }

  // 🚨 SIMPLIFICADO: Eliminados widthCm/heightCm de la definición de función
  const addToCart = (product: Product, quantity: number, widthCm?: number, heightCm?: number, kg?: number) => {
    const salePriceUnit = calculateSalePrice(product) // Precio por unidad, kg
    const totalPriceUsd = salePriceUnit * quantity

    // Inventario: Ambos tipos afectan el inventario
    if (quantity > product.quantity) { 
      alert("No hay suficiente inventario")
      return
    }

    // Key matching: Simplificado para tipos con cantidad (weight)
    const keyMatches = (i: CartItem) =>
      i.productId === product.id &&
      i.saleType === product.saleType &&
      // Coincide el valor 'kg' solo si el tipo es 'weight'
      (i.saleType === "weight" ? i.kg === kg : true)

    const existingItem = cart.find(keyMatches)

    if (existingItem) {
      // Si el ítem ya existe, se suma la cantidad
      existingItem.quantity = Number(existingItem.quantity) + Number(quantity)
      existingItem.priceBs = salePriceUnit * existingItem.quantity * bcvRate
      setCart([...cart])
    } else {
      const item: CartItem = {
        productId: product.id,
        name: product.name,
        quantity,
        priceUsd: salePriceUnit,
        priceBs: totalPriceUsd * bcvRate,
        saleType: product.saleType,
      }
      // Se establece kg solo para peso
      if (product.saleType === "weight") {
        item.kg = kg
      }
      setCart((c) => [...c, item])
    }
  }

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((i) => i.productId !== productId))
  }

  const updateQuantity = (item: CartItem, newQuantity: number) => {
    if (newQuantity <= 0) {
      // 🚨 CORREGIDO: Usar el ID del ítem, no el de producto si queremos eliminar
      setCart(cart.filter((i) => i.productId !== item.productId || (item.saleType === "weight" && i.kg === item.kg)))
      return
    }
    const product = products.find((p) => p.id === item.productId)
    if (!product) return
    // Inventario: Ambos tipos afectan el inventario
    if (newQuantity > product.quantity) {
      alert("Cantidad no disponible")
      return
    }
    // item.priceUsd contiene el precio unitario
    item.quantity = newQuantity
    // Se recalcula el precio Bs (Precio Unitario * Nueva Cantidad * Tasa BCV)
    item.priceBs = item.priceUsd * newQuantity * bcvRate
    setCart([...cart])
  }

  // Totales base (antes de descuento)
  // El precio Bs en el carrito (item.priceBs) ya es el TOTAL de la línea
  const baseTotalBs = cart.reduce((sum, i) => sum + i.priceBs, 0)
  const baseTotalUsd = baseTotalBs / bcvRate

  // Descuento si el pago es en efectivo (USD)
  const discount = paymentMethod === "cash" ? 0.3 : 0
  const totalUsd = baseTotalUsd * (1 - discount)
  const totalBs = totalUsd * bcvRate

  const handleCheckout = async () => {
    if (!user) return alert("Usuario no autenticado")
    if (cart.length === 0) return alert("El carrito está vacío")

    if (paymentMethod === "mixed") {
      const usd = Number.parseFloat(mixedUsd || "0")
      const bs = Number.parseFloat(mixedBs || "0")
      const combined = usd * bcvRate + bs
      const roundedTotal = Number(totalBs.toFixed(2))
      const sum = Number(combined.toFixed(2))
      if (isNaN(usd) || isNaN(bs)) return alert("Ingresa montos válidos para el pago mixto")
      if (sum !== roundedTotal)
        return alert(`En pago mixto, la suma ($${usd} + Bs ${bs}) debe equivaler al total Bs ${roundedTotal}`)
    }

    try {
      const saleData: any = {
        userId: user.uid,
        // Almacenar el total de la línea en USD para la base de datos
        items: cart.map((item) => ({
          ...item,
          // Guardar el total USD de la línea para evitar errores en la factura
          totalUsdLine: item.priceUsd * item.quantity,
          priceUsd: item.priceUsd, // El precio unitario sigue siendo priceUsd
        })),
        totalBs,
        totalUsd,
        bcvRate,
        paymentMethod,
        discountApplied: discount > 0 ? 30 : 0,
        createdAt: Timestamp.now(),
      }

      if (paymentMethod === "mixed") {
        saleData.paymentBreakdown = {
          pagoUsd: Number.parseFloat(mixedUsd || "0"),
          pagoBs: Number.parseFloat(mixedBs || "0"),
        }
      }

      await addDoc(collection(db, "ventas"), saleData)

      for (const item of cart) {
        const product = products.find((p) => p.id === item.productId)
        // 🚨 SIMPLIFICADO: Ambos tipos actualizan el stock
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

  return (
    // ⭐️ AJUSTE DE ANIMACIÓN: motion.div envuelve todo el contenido
    <motion.div
      initial={{ opacity: 0, y: 20 }} // Comienza invisible y 20px abajo
      animate={{ opacity: 1, y: 0 }}  // Termina visible y en su posición (subiendo)
      transition={{ duration: 0.5, ease: "easeOut" }} // Duración de 0.5 segundos
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
                const salePriceBs = salePrice * bcvRate
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
                      <div
                        key={`${item.productId}-${item.saleType}-${item.kg || 0}`}
                        className="border border-border rounded-lg p-3"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-sm">{item.name}</h4>
                          <button
                            onClick={() => removeFromCart(item.productId)}
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
                  {discount > 0 && (
                    <div className="flex justify-between text-green-600 text-sm">
                      <span>Descuento (30% efectivo USD):</span>
                      <span>- ${(baseTotalUsd * 0.3).toFixed(2)}</span>
                    </div>
                  )}

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
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="w-full px-3 py-2 border border-input rounded-md bg-background mt-2 text-sm"
                    >
                      <option value="debit">Débito</option>
                      <option value="cash">Efectivo (USD)</option>
                      <option value="transfer">Transferencia</option>
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
                    disabled={cart.length === 0}
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