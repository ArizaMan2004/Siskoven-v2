"use client"

// 🚨 CORRECCIÓN: Se agrega 'useCallback'
import { useState, useEffect, type FormEvent, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Edit2, Trash2, X, Search } from "lucide-react"
import { getBCVRate } from "@/lib/bcv-service"
import { getCategories, addCategory } from "@/lib/categories-service"
import BCVWidget from "./bcv-widget"
import { motion } from "framer-motion" 

// 🧩 Interfaces y tipos
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

// Interfaz simplificada
interface FormData {
  name: string
  category: string
  costUsd: string
  quantity: string
  profit: string
  saleType: "unit" | "weight"
  barcode: string
}

// ===============================================
// 🎯 CONSTANTE DE IVA
// ===============================================
const IVA_RATE = 0.16; // 16% de IVA

// ===============================================
// 🎯 FUNCIÓN DE CÁLCULO 1: Precio Base (Sin IVA)
// ===============================================

const calculateBaseSalePrice = (product: Product): number => {
    // 1. Normalización del Porcentaje a decimal (ej: 20 -> 0.2)
    let profitDecimal = product.profit > 1 ? product.profit / 100 : product.profit;

    // 2. Manejo de errores/valores no deseados
    if (isNaN(profitDecimal) || profitDecimal < 0 || profitDecimal >= 1) {
        profitDecimal = 0; 
    }

    // 3. CÁLCULO DEL PRECIO DE VENTA BASE (Fórmula del Margen Bruto):
    // Precio de Venta Base = Costo / (1 - Margen en decimal)
    const baseSalePrice = product.costUsd / (1 - profitDecimal);

    // 4. Devolvemos el precio válido o 0 si el resultado es infinito/inválido.
    return Number.isFinite(baseSalePrice) ? baseSalePrice : 0;
}

// ===============================================
// 🎯 FUNCIÓN DE CÁLCULO 2: Precio Final (Con IVA)
// (Esta reemplaza a la función original)
// ===============================================

const calculateFinalSalePrice = (basePrice: number): number => {
    // Precio Final = Precio Base * (1 + IVA_RATE)
    const finalPrice = basePrice * (1 + IVA_RATE);

    // 4. Devolvemos el precio válido o 0.
    return Number.isFinite(finalPrice) ? finalPrice : 0;
}

// ===============================================

export default function ProductsView() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("")
  const [categories, setCategories] = useState<string[]>([])
  const [bcvRate, setBcvRate] = useState<number>(216.37)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [showMobileSearch, setShowMobileSearch] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    name: "",
    category: "",
    costUsd: "",
    quantity: "",
    profit: "",
    saleType: "unit",
    barcode: "",
  })

  // 🚀 Inicialización
  useEffect(() => {
    if (!user) return
    loadCategories()
    loadProducts()
    fetchBCV()
  }, [user])

  const fetchBCV = async () => {
    try {
      const bcvData = await getBCVRate()
      if (bcvData?.rate) setBcvRate(bcvData.rate)
    } catch (error) {
      console.error("Error loading BCV rate:", error)
    }
  }
  
  // Memoizar la función onRateChange con useCallback
  const handleBcvRateChange = useCallback((newRate: number) => {
    setBcvRate(newRate);
  }, []); 

  const loadCategories = async () => {
    if (!user) return
    try {
      const loadedCategories = await getCategories(user.uid)
      setCategories(loadedCategories)
    } catch (error) {
      console.error("Error loading categories:", error)
    }
  }

  const loadProducts = async () => {
    if (!user) return
    setLoading(true)
    try {
      const q = query(collection(db, "productos"), where("userId", "==", user.uid))
      const snapshot = await getDocs(q)
      const productsData = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Product[]
      setProducts(productsData)
    } catch (error) {
      console.error("Error loading products:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddCategory = async () => {
    if (!user || !newCategoryName.trim()) return
    try {
      await addCategory(user.uid, newCategoryName.trim())
      setNewCategoryName("")
      await loadCategories()
    } catch (error) {
      console.error("Error adding category:", error)
    }
  }

  // ----------------------------------------------------
  // LÓGICA: CÁLCULO DE PRECIOS PARA LA VISTA PREVIA DEL FORMULARIO
  // (ACTUALIZADA con Precio Base y Precio Final con IVA)
  // ----------------------------------------------------
  const currentCostUsd = Number.parseFloat(formData.costUsd || "0");
  const currentProfit = Number.parseFloat(formData.profit || "0");

  let profitDecimal = currentProfit > 1 ? currentProfit / 100 : currentProfit;
  if (isNaN(profitDecimal) || profitDecimal < 0 || profitDecimal >= 1) {
      profitDecimal = 0; 
  }

  // Paso 1: Precio de Venta Base (Sin IVA)
  const previewSalePriceBaseUsd = currentCostUsd / (1 - profitDecimal);
  const finalSalePriceBaseUsd = Number.isFinite(previewSalePriceBaseUsd) ? previewSalePriceBaseUsd : 0;
  
  // Paso 2: Precio de Venta Final (Con IVA)
  const finalSalePriceUsd = calculateFinalSalePrice(finalSalePriceBaseUsd);
  const finalSalePriceBs = finalSalePriceUsd * bcvRate;
  // ----------------------------------------------------


  // 💾 Guardar producto
  const handleAddProduct = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!user) return

    try {
      const costUsd = Number.parseFloat(formData.costUsd)
      const quantity = Number.parseInt(formData.quantity)

      const productData = {
        userId: user.uid,
        name: formData.name.trim(),
        category: formData.category,
        costUsd,
        quantity,
        profit: Number.parseFloat(formData.profit),
        saleType: formData.saleType,
        barcode: formData.barcode.trim(),
        createdAt: Timestamp.now(),
      }

      if (editingId) {
        await updateDoc(doc(db, "productos", editingId), productData)
      } else {
        await addDoc(collection(db, "productos"), productData)
      }

      resetForm()
      loadProducts()
    } catch (error) {
      console.error("Error saving product:", error)
    }
  }

  // Reset del formulario simplificado
  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData({
      name: "",
      category: "",
      costUsd: "",
      quantity: "",
      profit: "",
      saleType: "unit",
      barcode: "",
    })
  }

  // Edición simplificada
  const handleEditProduct = (product: Product) => {
    setFormData({
      name: product.name,
      category: product.category,
      costUsd: product.costUsd.toString(),
      quantity: product.quantity.toString(),
      profit: product.profit.toString(),
      saleType: product.saleType,
      barcode: product.barcode || "",
    })
    setEditingId(product.id)
    setShowForm(true)
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("¿Eliminar producto?")) return
    try {
      await deleteDoc(doc(db, "productos", id))
      loadProducts()
    } catch (error) {
      console.error("Error deleting product:", error)
    }
  }

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = !selectedCategory || p.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  // 🧱 Render
  return (
    // AJUSTE DE ANIMACIÓN: motion.div envuelve todo el contenido
    <motion.div
      initial={{ opacity: 0, y: 20 }} // Comienza invisible y 20px abajo
      animate={{ opacity: 1, y: 0 }}  // Termina visible y en su posición (subiendo)
      transition={{ duration: 0.5, ease: "easeOut" }} // Duración de 0.5 segundos
      className="space-y-6 px-4 md:px-0 pb-20 md:pb-0"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Productos</h2>
          <p className="text-sm sm:text-base text-muted-foreground">Gestiona tu inventario</p>
        </div>
        <Button
          onClick={() => {
            setEditingId(null)
            resetForm()
            setShowForm(!showForm)
          }}
          className="gap-2 bg-primary hover:bg-primary/90 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Agregar Producto
        </Button>
      </div>

      <BCVWidget onRateChange={handleBcvRateChange} />

      {/* Formulario */}
      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-lg sm:text-xl">{editingId ? "Editar Producto" : "Nuevo Producto"}</CardTitle>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  placeholder="Nombre del producto"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="h-10"
                />
                <Input
                  placeholder="Código de barras"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  className="h-10"
                />

                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="px-3 py-2 border border-input rounded-md bg-background h-10"
                  required
                >
                  <option value="">Selecciona categoría</option>
                  {categories.map((cat, i) => (
                    <option key={`${cat}-${i}`} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2 sm:col-span-1">
                  <Input
                    placeholder="Nueva categoría"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="h-10"
                  />
                  <Button
                    type="button"
                    onClick={handleAddCategory}
                    variant="outline"
                    className="whitespace-nowrap bg-transparent flex-shrink-0"
                  >
                    Agregar
                  </Button>
                </div>

                <Input
                  type="number"
                  placeholder="Costo unitario USD"
                  step="0.01"
                  value={formData.costUsd}
                  onChange={(e) => setFormData({ ...formData, costUsd: e.target.value })}
                  required
                  className="h-10"
                />

                <Input
                  type="number"
                  placeholder="Cantidad disponible (unidades)"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                  className="h-10"
                />

                <Input
                  type="number"
                  placeholder="Margen % (sobre la venta)"
                  step="0.01"
                  value={formData.profit}
                  max="99" 
                  onChange={(e) => {
                    let value = e.target.value
                    if (Number(value) > 99) {
                        value = "99"
                    }
                    setFormData({ ...formData, profit: value })
                  }}
                  required
                  className="h-10"
                />

                <select
                  value={formData.saleType}
                  onChange={(e) => setFormData({ ...formData, saleType: e.target.value as FormData["saleType"] })}
                  className="px-3 py-2 border border-input rounded-md bg-background h-10"
                >
                  <option value="unit">Por Unidad</option>
                  <option value="weight">Por Peso (Kg)</option>
                  {/* ELIMINADO: Por Área (m²) */}
                </select>
              </div>

              {/* ⭐️ SECCIÓN CORREGIDA: VISTA PREVIA DEL PRECIO FINAL (Apto para Dark Mode) */}
              {currentCostUsd > 0 && (
                <div className="
                  bg-blue-50/70 dark:bg-blue-900/30 
                  p-4 rounded-lg 
                  border border-blue-200 dark:border-blue-700 
                  space-y-2
                ">
                  <h4 className="font-semibold text-blue-800 dark:text-blue-300">Precios Calculados (Vista Previa)</h4>
                  
                  {/* Precio de Venta Base (Sin IVA) */}
                  <div className="flex justify-between">
                      <span className="text-sm text-foreground/70">Precio Venta Base USD (Sin IVA):</span>
                      <span className="font-bold text-base text-blue-800 dark:text-blue-300">${finalSalePriceBaseUsd.toFixed(2)}</span>
                  </div>
                  
                  {/* Precio de Venta Final (Con IVA) */}
                  <div className="flex justify-between">
                      <span className="text-sm text-foreground/70">Precio Venta FINAL USD (IVA 16%):</span>
                      <span className="font-bold text-base text-purple-600 dark:text-purple-400">${finalSalePriceUsd.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                      <span className="text-sm text-foreground/70">
                        Precio Venta FINAL Bs (Tasa: {bcvRate.toFixed(2)}):
                      </span>
                      <span className="font-bold text-base text-green-600 dark:text-green-400">Bs {finalSalePriceBs.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1 border-t mt-2">
                      Costo: ${currentCostUsd.toFixed(2)} / Margen: {currentProfit.toFixed(2)}%
                  </p>
                </div>
              )}
              {/* FIN DE LA SECCIÓN CORREGIDA */}

              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="submit" className="bg-primary hover:bg-primary/90 h-10">
                  {editingId ? "Actualizar" : "Guardar"}
                </Button>
                <Button type="button" onClick={resetForm} variant="outline" className="h-10 bg-transparent">
                  Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tabla - solo visible en desktop */}
      <Card className="hidden md:block">
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Buscar producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 h-10"
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background h-10 sm:w-48"
            >
              <option value="">Todas las categorías</option>
              {categories.map((cat, i) => (
                <option key={`${cat}-${i}`} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Cargando productos...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {products.length === 0 ? "No hay productos. Crea uno para comenzar." : "No se encontraron productos."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4">Producto</th>
                    <th className="text-left py-3 px-4">Categoría</th>
                    <th className="text-right py-3 px-4">Costo Unidad USD</th>
                    {/* NUEVO: Precio Venta Base (Sin IVA) */}
                    <th className="text-right py-3 px-4">Precio Venta USD (Sin IVA)</th>
                    {/* MODIFICADO: Precio Venta Final (Con IVA) */}
                    <th className="text-right py-3 px-4">Precio Venta USD (IVA 16%)</th>
                    <th className="text-right py-3 px-4">Precio Venta Bs (IVA 16%)</th>
                    <th className="text-right py-3 px-4">Unidades Disponibles</th>
                    <th className="text-left py-3 px-4">Tipo</th>
                    <th className="text-center py-3 px-4">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    // CÁLCULOS ACTUALIZADOS
                    const basePrice = calculateBaseSalePrice(product)
                    const finalSalePrice = calculateFinalSalePrice(basePrice)
                    const finalSalePriceBs = finalSalePrice * bcvRate
                    return (
                      <tr key={product.id} className="border-b border-border hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">{product.name}</td>
                        <td className="py-3 px-4">{product.category}</td>
                        <td className="text-right py-3 px-4">${product.costUsd.toFixed(2)}</td>
                        {/* NUEVO: Precio Venta Base (Sin IVA) */}
                        <td className="text-right py-3 px-4">${basePrice.toFixed(2)}</td>
                        {/* MODIFICADO: Precio Venta Final (Con IVA) */}
                        <td className="text-right py-3 px-4 font-semibold text-purple-600 dark:text-purple-400">${finalSalePrice.toFixed(2)}</td>
                        <td className="text-right py-3 px-4 font-semibold text-primary">Bs {finalSalePriceBs.toFixed(2)}</td>
                        <td className="text-right py-3 px-4">{product.quantity}</td>
                        <td className="py-3 px-4 capitalize">{product.saleType}</td>
                        <td className="py-3 px-4">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => handleEditProduct(product)} className="p-1 hover:bg-muted rounded">
                              <Edit2 className="w-4 h-4 text-primary" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              className="p-1 hover:bg-muted rounded"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vista móvil: Tarjetas */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="text-center py-8">Cargando productos...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {products.length === 0 ? "No hay productos. Crea uno para comenzar." : "No se encontraron productos."}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map((product) => {
              // CÁLCULOS ACTUALIZADOS
              const basePrice = calculateBaseSalePrice(product)
              const finalSalePrice = calculateFinalSalePrice(basePrice)
              const finalSalePriceBs = finalSalePrice * bcvRate
              return (
                <Card key={product.id} className="border-l-4 border-l-primary">
                  <CardContent className="pt-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-lg text-foreground">{product.name}</h3>
                      <p className="text-xs text-muted-foreground">{product.category}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Costo USD</p>
                        <p className="font-medium">${product.costUsd.toFixed(2)}</p>
                      </div>
                      
                      {/* NUEVO: Precio Base sin IVA */}
                      <div>
                        <p className="text-muted-foreground text-xs">Venta USD (Sin IVA)</p>
                        <p className="font-medium">${basePrice.toFixed(2)}</p>
                      </div>

                      {/* MODIFICADO: Precio Final con IVA */}
                      <div>
                        <p className="text-muted-foreground text-xs">Venta USD (IVA 16%)</p>
                        <p className="font-semibold text-purple-600 dark:text-purple-400">${finalSalePrice.toFixed(2)}</p>
                      </div>

                      {/* MODIFICADO: Precio Final en Bs */}
                      <div>
                        <p className="text-muted-foreground text-xs">Venta Bs (IVA 16%)</p>
                        <p className="font-semibold text-primary">Bs {finalSalePriceBs.toFixed(2)}</p>
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground text-xs">Disponibles</p>
                        <p className="font-medium">{product.quantity}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 text-xs">
                      <span className="px-2 py-1 bg-muted rounded capitalize">{product.saleType}</span>
                      {product.barcode && <span className="px-2 py-1 bg-muted rounded">{product.barcode}</span>}
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-border">
                      <button
                        onClick={() => handleEditProduct(product)}
                        className="flex-1 p-2 hover:bg-muted rounded flex items-center justify-center gap-2 text-primary"
                      >
                        <Edit2 className="w-4 h-4" />
                        <span className="text-sm">Editar</span>
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="flex-1 p-2 hover:bg-muted rounded flex items-center justify-center gap-2 text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-sm">Eliminar</span>
                      </button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <div className="md:hidden fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        {/* Modal de búsqueda expandido */}
        {showMobileSearch && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 bg-card border border-border rounded-lg shadow-lg p-4 w-80 max-w-[calc(100vw-2rem)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Buscar Producto</h3>
              <button
                onClick={() => setShowMobileSearch(false)}
                className="p-1 hover:bg-muted rounded transition-colors"
                aria-label="Cerrar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <Input
                placeholder="Buscar producto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10"
                autoFocus
                aria-label="Campo de búsqueda"
              />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background h-10"
                aria-label="Filtrar por categoría"
              >
                <option value="">Todas las categorías</option>
                {categories.map((cat, i) => (
                  <option key={`${cat}-${i}`} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Botón flotante circular con lupa */}
        <button
          onClick={() => setShowMobileSearch(!showMobileSearch)}
          className="relative w-14 h-14 rounded-full bg-primary hover:bg-primary/90 shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
          aria-label="Abrir búsqueda de productos"
          aria-expanded={showMobileSearch}
        >
          <Search className="h-6 w-6 text-primary-foreground" />

          {/* Indicador pulsante cuando hay filtros activos */}
          {(searchTerm || selectedCategory) && (
            <span className="absolute top-0 right-0 w-3 h-3 bg-accent rounded-full animate-pulse" />
          )}
        </button>
      </div>
    </motion.div>
  )
}