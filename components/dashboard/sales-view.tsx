"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash2, Plus, Minus, Scan } from "lucide-react"
import { initBarcodeScanner } from "@/lib/barcode-scanner"
import { getBCVRate } from "@/lib/bcv-service"

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

interface CartItem {
  productId: string
  name: string
  quantity: number
  priceUsd: number
  priceBs: number
  saleType: "unit" | "weight" | "area"
  widthCm?: number
  heightCm?: number
  kg?: number
}

const PRECIO_M2 = 15

export default function SalesView() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [bcvRate, setBcvRate] = useState(216.37)
  const [scannerActive, setScannerActive] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState("")
  const [loading, setLoading] = useState(true)

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
    if (mixedUsd && !isNaN(parseFloat(mixedUsd)) && document.activeElement?.id === "usd-input") {
      const usd = parseFloat(mixedUsd)
      const restanteBs = Math.max(totalEnBs - usd * bcvRate, 0)
      setMixedBs(restanteBs.toFixed(2))
    }

    // Si el usuario escribe en Bs, calculamos el resto en USD
    if (mixedBs && !isNaN(parseFloat(mixedBs)) && document.activeElement?.id === "bs-input") {
      const bs = parseFloat(mixedBs)
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

  // 🔥 FUNCIÓN CORREGIDA: Lógica estandarizada con products-view.tsx
  const calculateSalePrice = (product: Product) => {
    let profitDecimal = product.profit > 1 ? product.profit / 100 : product.profit
    if (isNaN(profitDecimal) || profitDecimal < 0) profitDecimal = 0

    switch (product.saleType) {
      case "unit":
      case "weight": {
        // Precio de venta = Costo Unitario (costUsd) * (1 + Ganancia %)
        const salePrice = product.costUsd * (1 + profitDecimal)
        return salePrice;
      }
      case "area": {
        // Precio de venta m² = Precio Base (PRECIO_M2) * (1 + Ganancia %)
        const salePrice = PRECIO_M2 * (1 + profitDecimal)
        return salePrice
      }
      default:
        return 0
    }
  }

  const openAddDialog = (product: Product) => {
    let quantity = 1
    let widthCm = undefined as number | undefined
    let heightCm = undefined as number | undefined
    let kg = undefined as number | undefined

    if (product.saleType === "weight") {
      const rawKg = prompt(`Ingresa cantidad de kg de ${product.name}:`, "1")
      if (!rawKg) return
      kg = parseFloat(rawKg)
      if (isNaN(kg) || kg <= 0) return alert("Kg inválidos")
      quantity = kg
    } else if (product.saleType === "area") {
      const rawW = prompt(`Ingresa ancho en cm de ${product.name}:`, "100")
      const rawH = prompt(`Ingresa alto en cm de ${product.name}:`, "100")
      if (!rawW || !rawH) return
      widthCm = parseFloat(rawW)
      heightCm = parseFloat(rawH)
      if (isNaN(widthCm) || isNaN(heightCm) || widthCm <= 0 || heightCm <= 0)
        return alert("Dimensiones inválidas")
      quantity = (widthCm / 100) * (heightCm / 100)
    }

    addToCart(product, quantity, widthCm, heightCm, kg)
  }

  const addToCart = (
    product: Product,
    quantity: number,
    widthCm?: number,
    heightCm?: number,
    kg?: number
  ) => {
    const salePriceUnit = calculateSalePrice(product) // Precio por unidad, kg, o m²
    const totalPriceUsd = salePriceUnit * quantity
    
    if (product.saleType !== "area" && quantity > product.quantity) {
      alert("No hay suficiente inventario")
      return
    }

    const keyMatches = (i: CartItem) =>
      i.productId === product.id &&
      i.saleType === product.saleType &&
      (product.saleType !== "area" || (i.widthCm === widthCm && i.heightCm === heightCm)) &&
      (product.saleType !== "weight" || i.kg === kg)

    const existingItem = cart.find(keyMatches)

    if (existingItem) {
      // Si el ítem ya existe, se suma la cantidad
      existingItem.quantity = Number(existingItem.quantity) + Number(quantity)
      // Se recalcula el precio Bs (Precio Unitario * Nueva Cantidad * Tasa BCV)
      existingItem.priceBs = salePriceUnit * existingItem.quantity * bcvRate 
      setCart([...cart])
    } else {
      const item: CartItem = {
        productId: product.id,
        name: product.name,
        quantity,
        priceUsd: salePriceUnit, // Almacenar el precio unitario (o por kg/m²)
        priceBs: totalPriceUsd * bcvRate, // Almacenar el total en Bs de la línea
        saleType: product.saleType,
      }
      if (product.saleType === "area") {
        item.widthCm = widthCm
        item.heightCm = heightCm
      }
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
      removeFromCart(item.productId)
      return
    }
    const product = products.find((p) => p.id === item.productId)
    if (!product) return
    if (product.saleType !== "area" && newQuantity > product.quantity) {
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
      const usd = parseFloat(mixedUsd || "0")
      const bs = parseFloat(mixedBs || "0")
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
        items: cart.map(item => ({
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
          pagoUsd: parseFloat(mixedUsd || "0"),
          pagoBs: parseFloat(mixedBs || "0"),
        }
      }

      await addDoc(collection(db, "ventas"), saleData)

      for (const item of cart) {
        const product = products.find((p) => p.id === item.productId)
        if (product && product.saleType !== "area") {
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

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold">Punto de Venta</h2>
          <Button onClick={() => setScannerActive(!scannerActive)} variant={scannerActive ? "default" : "outline"}>
            <Scan className="w-4 h-4" />
            {scannerActive ? "Escáner Activo" : "Activar Escáner"}
          </Button>
        </div>

        {scannerActive && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent>
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

        <div>
          <h3 className="text-lg font-semibold">Productos Disponibles</h3>
          <div className="grid grid-cols-2 gap-4">
            {products.map((product) => {
              const salePrice = calculateSalePrice(product) // 🔥 Usa la función CORREGIDA
              const salePriceBs = salePrice * bcvRate
              return (
                <Card key={product.id}>
                  <CardContent>
                    <h4 className="font-semibold">{product.name}</h4>
                    <p className="text-sm text-muted-foreground">{product.category}</p>
                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between text-sm">
                        <span>Precio USD:</span>
                        <span>${salePrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Precio Bs:</span>
                        <span>Bs {salePriceBs.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Stock:</span>
                        <span>{product.quantity}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Tipo:</span>
                        <span>{product.saleType}</span>
                      </div>
                    </div>
                    <Button onClick={() => openAddDialog(product)} className="w-full bg-primary hover:bg-primary/90">
                      Agregar al Carrito
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      <div className="col-span-1">
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle>Carrito de Ventas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Carrito vacío</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {cart.map((item) => (
                  <div key={`${item.productId}-${item.saleType}-${item.widthCm || 0}-${item.heightCm || 0}`} className="border border-border rounded-lg p-3">
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
                        onChange={(e) => updateQuantity(item, parseFloat(e.target.value))}
                        className="w-12 text-center"
                      />
                      <button
                        onClick={() => updateQuantity(item, Number(item.quantity) + 1)}
                        className="p-1 hover:bg-muted rounded"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      Bs {(item.priceBs).toFixed(2)}
                      {item.saleType === "area" && ` — ${item.widthCm}cm x ${item.heightCm}cm`}
                      {item.saleType === "weight" && ` — ${item.kg} kg`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-border pt-4 space-y-3">
              {discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Descuento (30 % efectivo USD):</span>
                  <span>- ${ (baseTotalUsd * 0.3).toFixed(2) }</span>
                </div>
              )}

              <div className="flex justify-between">
                <span>Total USD:</span>
                <span>${totalUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Bs:</span>
                <span>Bs {totalBs.toFixed(2)}</span>
              </div>

              <div>
                <label className="text-sm">Método de Pago</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background mt-2"
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
                    />
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground">
                    Se calcula automáticamente el monto restante según la tasa BCV.
                  </div>
                </div>
              )}

              <Button onClick={handleCheckout} disabled={cart.length === 0} className="w-full bg-accent hover:bg-accent/90">
                Confirmar Venta
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}