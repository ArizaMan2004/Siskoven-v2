"use client"

import { useState, useEffect, type FormEvent } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import {
  type ProductWithCost,
  type SaleType,
  deleteProduct,
  esServicio,
  estadoStock,
  loadProductsWithCosts,
  resumirStock,
  saveProduct,
} from "@/lib/products-service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Edit2, Trash2, X, Search, FileSpreadsheet } from "lucide-react"
import { getCategories, addCategory } from "@/lib/categories-service"
import RateWidget from "./rate-widget"
import PricingSettingsCard from "./pricing-settings-card"
import TaxSettingsCard from "./tax-settings-card"
import ImportProductsDialog from "./import-products-dialog"
import StockAlertCard, { StockValueCard } from "./stock-alert-card"
import { AnimatePresence } from "framer-motion"
import { useRates } from "@/hooks/use-rates"
import { usePricingSettings } from "@/hooks/use-pricing-settings"
import { divisaPrice, formatBs, formatMoney, listPrice } from "@/lib/pricing"
import { reportFirestoreError, reportFirestoreSuccess } from "@/lib/sync-status"
import { m } from "framer-motion"

// 🔑 CONSTANTE DE PAGINACIÓN
const PRODUCTS_PER_PAGE = 10; 

// El producto y su costo viven en documentos separados; el servicio los junta
// cuando quien mira tiene permiso para ver costos. Ver lib/products-service.ts.
type Product = ProductWithCost

// Interfaz simplificada
interface FormData {
  name: string
  category: string
  costUsd: string
  quantity: string
  profit: string
  saleType: SaleType
  barcode: string
  stockMinimo: string
  salePriceUsdManual: string
}

// El cálculo de precios vive en @/lib/pricing y lo comparten todas las vistas.

export default function ProductsView() {
  const { user, allows, negocioId } = useAuth()
  // El cajero consulta el catálogo y el precio de venta, pero no ve a cuánto
  // compras ni puede tocar el inventario.
  //
  // Y aquí no solo se oculta: el costo vive en la colección productos_costos,
  // que las reglas de Firestore no le dejan leer. Comprobado en
  // tests/firestore-rules.test.mjs, incluida una prueba que lee el documento
  // público y verifica que `costUsd` no viene dentro.
  const canSeeCosts = allows("costs.view")
  const canEdit = allows("products.edit")
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("")
  const [categories, setCategories] = useState<string[]>([])
  // La tasa y los ajustes de precio son compartidos: ya no hay una copia por
  // vista (ni el 216.37 quemado que hacía cobrar a un cuarto de su valor).
  const { rate: bcvRate } = useRates()
  const { settings: pricing } = usePricingSettings()
  const [newCategoryName, setNewCategoryName] = useState("")
  const [showMobileSearch, setShowMobileSearch] = useState(false)
  const [showImport, setShowImport] = useState(false)
  // 🔑 ESTADO DE PAGINACIÓN
  const [currentPage, setCurrentPage] = useState(1) 
  const [formData, setFormData] = useState<FormData>({
    name: "",
    category: "",
    costUsd: "",
    quantity: "",
    profit: "",
    saleType: "unit",
    barcode: "",
    stockMinimo: "",
    salePriceUsdManual: "",
  })

  // 🚀 Inicialización
  useEffect(() => {
    if (!user) return
    loadCategories()
    loadProducts()
  }, [user, negocioId])

  const loadCategories = async () => {
    if (!user) return
    try {
      const loadedCategories = await getCategories(negocioId ?? user.uid)
      setCategories(loadedCategories)
    } catch (error) {
      console.error("Error loading categories:", error)
    }
  }

  const loadProducts = async () => {
    if (!user) return
    setLoading(true)
    try {
      setProducts(await loadProductsWithCosts(negocioId ?? user.uid))
    } catch (error) {
      console.error("Error loading products:", error)
      reportFirestoreError(error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddCategory = async () => {
    if (!user || !newCategoryName.trim()) return
    try {
      await addCategory(negocioId ?? user.uid, newCategoryName.trim())
      setNewCategoryName("")
      await loadCategories()
    } catch (error) {
      console.error("Error adding category:", error)
    }
  }

  // ----------------------------------------------------
  // VISTA PREVIA DEL PRECIO MIENTRAS SE LLENA EL FORMULARIO
  // Usa exactamente las mismas funciones que la tabla y el punto de venta.
  // ----------------------------------------------------
  const currentCostUsd = Number.parseFloat(formData.costUsd || "0") || 0
  const currentProfit = Number.parseFloat(formData.profit || "0") || 0
  const manualSalePrice = Number.parseFloat(formData.salePriceUsdManual)

  const draftProduct = {
    costUsd: currentCostUsd,
    profit: currentProfit,
    salePriceUsdManual:
      formData.salePriceUsdManual.trim() && Number.isFinite(manualSalePrice) && manualSalePrice > 0
        ? manualSalePrice
        : null,
  }

  // Alertas y valor del inventario, calculados de lo que ya está en memoria:
  // no cuesta ni una lectura extra.
  const resumenStock = resumirStock(products)

  const previewListPrice = listPrice(draftProduct)
  const previewFinalPrice = divisaPrice(draftProduct, pricing)
  // Los bolívares salen del MISMO precio que se cobra en divisa. Antes salían
  // del precio sin descuento, y las dos cifras no cuadraban entre sí.
  const previewPriceBs = bcvRate ? previewFinalPrice * bcvRate : null
  // ----------------------------------------------------

  // 💾 Guardar producto
  const handleAddProduct = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!user) return

    try {
      const costUsd = Number.parseFloat(formData.costUsd)
      const quantity = Number.parseInt(formData.quantity, 10)
      const profit = Number.parseFloat(formData.profit)

      if (!Number.isFinite(costUsd) || costUsd <= 0) {
        alert("El costo debe ser un número mayor que cero.")
        return
      }
      // Un servicio no tiene existencias, así que no se le pide cantidad.
      if (formData.saleType !== "service" && (!Number.isFinite(quantity) || quantity < 0)) {
        alert("La cantidad debe ser un número igual o mayor que cero.")
        return
      }

      const manualPrice = Number.parseFloat(formData.salePriceUsdManual)
      // El precio manual se guarda tal cual: el redondeo es una decisión de
      // cobro (configurable), no algo que deba deformar el dato guardado.
      const hasManualPrice =
        formData.salePriceUsdManual.trim().length > 0 && Number.isFinite(manualPrice) && manualPrice > 0

      // El servicio escribe los dos documentos en un lote: el producto público
      // (con el precio ya calculado) y el costo, que el cajero no puede leer.
      await saveProduct({
        negocioId: negocioId ?? user.uid,
        productId: editingId,
        pricing,
        input: {
          name: formData.name.trim(),
          category: formData.category,
          quantity: Number.isFinite(quantity) ? quantity : 0,
          saleType: formData.saleType,
          barcode: formData.barcode.trim(),
          stockMinimo: Number.parseInt(formData.stockMinimo, 10) || 0,
          costUsd,
          profit: Number.isFinite(profit) ? profit : 0,
          // Firestore rechaza `undefined`: se manda null, nunca sin valor.
          salePriceUsdManual: hasManualPrice ? manualPrice : null,
        },
      })

      reportFirestoreSuccess()
      resetForm()
      loadProducts()
    } catch (error) {
      console.error("Error saving product:", error)
      reportFirestoreError(error)
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
      stockMinimo: "",
      salePriceUsdManual: "",
    })
  }

  // Edición simplificada
  const handleEditProduct = (product: Product) => {
    setFormData({
      name: product.name,
      category: product.category,
      // Un cajero no llega aquí (no puede editar), pero si llegara no tendría
      // el costo: se deja vacío en vez de reventar.
      costUsd: product.costUsd?.toString() ?? "",
      quantity: product.quantity.toString(),
      profit: product.profit?.toString() ?? "",
      saleType: product.saleType,
      barcode: product.barcode || "",
      stockMinimo: product.stockMinimo ? String(product.stockMinimo) : "",
      // 🟢 NUEVO: Cargar el precio manual al editar
      salePriceUsdManual: product.salePriceUsdManual?.toString() || "", 
    })
    setEditingId(product.id)
    setShowForm(true)
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("¿Eliminar producto?")) return
    try {
      // Borra el producto y su costo a la vez: dejar el costo huérfano
      // ensuciaría los reportes de reposición.
      await deleteProduct(id)
      loadProducts()
    } catch (error) {
      console.error("Error deleting product:", error)
      reportFirestoreError(error)
    }
  }

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = !selectedCategory || p.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  // 🔑 Lógica de PAGINACIÓN
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
  
  // 🔑 EFECTO para resetear la página a 1 cuando cambian los filtros/búsqueda
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory]);

  // 🔑 EFECTO para asegurar que la página actual sea válida si los productos filtrados disminuyen
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    } else if (totalPages === 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);


  // 🧱 Render
  return (
    // AJUSTE DE ANIMACIÓN: motion.div envuelve todo el contenido
    <m.div
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
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {/* Cargar una hoja completa es lo primero que hace alguien que
              empieza: teclear trescientos productos a mano no lo hace nadie. */}
          {canEdit && (
            <Button variant="outline" onClick={() => setShowImport(true)} className="gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              Cargar desde Excel
            </Button>
          )}

          <Button
            onClick={() => {
              setEditingId(null)
              resetForm()
              setShowForm(!showForm)
            }}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Agregar Producto
          </Button>
        </div>
      </div>

      {/* Lo que reclama atención va antes que los ajustes. */}
      {!loading && canSeeCosts && (
        <div className="grid gap-4 lg:grid-cols-2">
          <StockAlertCard
            resumen={resumenStock}
            totalProductos={products.length}
            onVerProducto={handleEditProduct}
          />
          {products.length > 0 && <StockValueCard resumen={resumenStock} />}
        </div>
      )}

      {/* Los ajustes de cobro solo los ve quien puede cambiarlos. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RateWidget />
        {allows("pricing.settings") && <PricingSettingsCard />}
        {allows("business.settings") && <TaxSettingsCard />}
      </div>

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

                {/* Un servicio no tiene existencias: reparar un teléfono no
                    se "agota". Ocultar el campo evita que alguien ponga un 1
                    y se pregunte por qué no puede vender el segundo. */}
                {formData.saleType !== "service" && (
                  <Input
                    type="number"
                    placeholder="Cantidad disponible"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    required
                    className="h-10"
                  />
                )}

                {formData.saleType !== "service" && (
                  <Input
                    type="number"
                    min="0"
                    placeholder="Avisarme cuando queden (opcional)"
                    value={formData.stockMinimo}
                    onChange={(e) => setFormData({ ...formData, stockMinimo: e.target.value })}
                    className="h-10"
                  />
                )}

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
                  <option value="unit">Por unidad</option>
                  <option value="weight">Por peso (Kg)</option>
                  <option value="service">Es un servicio (sin inventario)</option>
                </select>
                
                {/* 🟢 NUEVO CAMPO: Precio de Venta Manual en Divisas */}
                <Input
                  type="number"
                  placeholder="Precio de venta fijo (opcional)"
                  step="0.01"
                  value={formData.salePriceUsdManual}
                  onChange={(e) => setFormData({ ...formData, salePriceUsdManual: e.target.value })}
                  className="h-10 sm:col-span-2"
                />
                
              </div>

              {/* Vista previa: divisa y bolívares salen siempre del mismo precio */}
              {currentCostUsd > 0 && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
                  <h4 className="font-semibold">Vista previa del precio</h4>

                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Precio de lista:</span>
                    <span className="text-base font-semibold tabular-nums">{formatMoney(previewListPrice)}</span>
                  </div>

                  {previewFinalPrice !== previewListPrice && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Precio al pagar en divisa:</span>
                      <span className="text-base font-semibold tabular-nums text-primary">
                        {formatMoney(previewFinalPrice)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Precio en bolívares:</span>
                    <span className="text-base font-semibold tabular-nums text-primary">
                      {previewPriceBs !== null ? formatBs(previewPriceBs) : "falta la tasa"}
                    </span>
                  </div>

                  <p className="mt-2 border-t pt-1 text-xs text-muted-foreground">
                    Costo: {formatMoney(currentCostUsd)} · Margen: {currentProfit.toFixed(2)}%
                    {draftProduct.salePriceUsdManual ? " · precio fijado a mano" : ""}
                  </p>
                </div>
              )}

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

      {/* Bloque de Búsqueda, Filtro y PAGINACIÓN */}
      <Card>
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
        <CardContent className="pt-2">
          {/* 🔑 CONTROLES DE PAGINACIÓN */}
          {filteredProducts.length > 0 && (
            <p className="text-sm text-gray-600 mb-4">{filteredProducts.length} producto(s) encontrado(s)</p>
          )}

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

          {/* Tabla - solo visible en desktop */}
          <div className="hidden md:block mt-4">
            {loading ? (
              <div className="text-center py-8">Cargando productos...</div>
            ) : paginatedProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {filteredProducts.length === 0 ? "No se encontraron productos con el filtro actual." : "No hay productos en esta página."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4">Producto</th>
                      <th className="text-left py-3 px-4">Categoría</th>
                      {canSeeCosts && <th className="text-right py-3 px-4">Costo</th>}
                      
                      {/* 🟢 NUEVA COLUMNA: Precio Base Calculado (sin redondeo) */}
                      <th className="text-right py-3 px-4">Precio de lista</th> 
                      
                      {/* 🟢 MODIFICADO: Ahora muestra el precio de venta aplicado (redondeado) */}
                      <th className="text-right py-3 px-4">Venta en divisa</th> 
                      
                      <th className="text-right py-3 px-4">Venta en Bs</th>
                      <th className="text-right py-3 px-4">Unidades Disponibles</th>
                      <th className="text-left py-3 px-4">Tipo</th>
                      <th className="text-center py-3 px-4">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 🔑 Usando paginatedProducts */}
                    {paginatedProducts.map((product) => {
                      const basePrice = listPrice(product)
                      const finalSalePriceUsd = divisaPrice(product, pricing)
                      // Los bolívares se calculan del precio que realmente se cobra.
                      const finalSalePriceBs = bcvRate ? finalSalePriceUsd * bcvRate : null

                      return (
                        <tr key={product.id} className="border-b border-border hover:bg-muted/50">
                          <td className="py-3 px-4 font-medium">{product.name}</td>
                          <td className="py-3 px-4">{product.category}</td>
                          {canSeeCosts && (
                            <td className="text-right py-3 px-4 tabular-nums">
                              {formatMoney(product.costUsd ?? 0)}
                            </td>
                          )}

                          <td className="text-right py-3 px-4 text-muted-foreground tabular-nums">
                            {formatMoney(basePrice)}
                          </td>

                          <td className="text-right py-3 px-4 font-semibold tabular-nums text-primary">
                            {formatMoney(finalSalePriceUsd)}
                          </td>

                          <td className="text-right py-3 px-4 font-semibold tabular-nums">
                            {finalSalePriceBs !== null ? formatBs(finalSalePriceBs) : "—"}
                          </td>
                          <td className="text-right py-3 px-4">
                            {esServicio(product) ? (
                              <span className="text-muted-foreground text-xs">servicio</span>
                            ) : (
                              <span
                                className={
                                  estadoStock(product) === "agotado"
                                    ? "text-destructive font-semibold"
                                    : estadoStock(product) === "bajo"
                                      ? "text-warning-foreground dark:text-warning font-semibold"
                                      : ""
                                }
                              >
                                {product.quantity}
                                {estadoStock(product) === "bajo" && product.stockMinimo
                                  ? ` / ${product.stockMinimo}`
                                  : ""}
                              </span>
                            )}
                          </td>
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
          </div>
        </CardContent>
      </Card>

      {/* Vista móvil: Tarjetas */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="text-center py-8">Cargando productos...</div>
        ) : paginatedProducts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {filteredProducts.length === 0 ? "No se encontraron productos con el filtro actual." : "No hay productos en esta página."}
          </div>
        ) : (
          <div className="space-y-3">
            {/* 🔑 Usando paginatedProducts */}
            {paginatedProducts.map((product) => {
              const basePrice = listPrice(product)
              const finalSalePriceUsd = divisaPrice(product, pricing)
              const finalSalePriceBs = bcvRate ? finalSalePriceUsd * bcvRate : null

              return (
                <Card key={product.id} className="border-l-4 border-l-primary">
                  <CardContent className="pt-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-lg text-foreground">{product.name}</h3>
                      <p className="text-xs text-muted-foreground">{product.category}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {canSeeCosts && (
                        <div>
                          <p className="text-muted-foreground text-xs">Costo</p>
                          <p className="font-medium tabular-nums">{formatMoney(product.costUsd ?? 0)}</p>
                        </div>
                      )}

                      <div>
                        <p className="text-muted-foreground text-xs">Precio de lista</p>
                        <p className="font-medium tabular-nums text-muted-foreground">{formatMoney(basePrice)}</p>
                      </div>

                      <div>
                        <p className="text-muted-foreground text-xs">Venta en divisa</p>
                        <p className="font-semibold tabular-nums text-primary">{formatMoney(finalSalePriceUsd)}</p>
                      </div>

                      <div>
                        <p className="text-muted-foreground text-xs">Venta en Bs</p>
                        <p className="font-semibold tabular-nums">
                          {finalSalePriceBs !== null ? formatBs(finalSalePriceBs) : "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-muted-foreground text-xs">Disponibles</p>
                        <p
                          className={`font-medium ${
                            estadoStock(product) === "agotado"
                              ? "text-destructive"
                              : estadoStock(product) === "bajo"
                                ? "text-warning-foreground dark:text-warning"
                                : ""
                          }`}
                        >
                          {esServicio(product) ? "Servicio" : product.quantity}
                        </p>
                      </div>
                    </div>

                    {product.salePriceUsdManual && product.salePriceUsdManual > 0 && (
                      <p className="text-xs text-muted-foreground">Precio fijado a mano.</p>
                    )}


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

      <AnimatePresence>
        {showImport && (
          <ImportProductsDialog onClose={() => setShowImport(false)} onImported={loadProducts} />
        )}
      </AnimatePresence>
    </m.div>
  )
}