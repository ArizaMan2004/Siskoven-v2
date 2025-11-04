// products-view.tsx
"use client"

import React, { useState, useEffect, FormEvent } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Edit2, Trash2, X } from "lucide-react"
import { getBCVRate } from "@/lib/bcv-service"
import { getCategories, addCategory } from "@/lib/categories-service"
import BCVWidget from "./bcv-widget"

// 🧩 Interfaces y tipos
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

// Interfaz simplificada: se eliminan los campos relacionados con "lote"
interface FormData {
  name: string
  category: string
  costUsd: string
  quantity: string
  profit: string
  saleType: "unit" | "weight" | "area"
  barcode: string
}

const PRECIO_M2 = 15

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

  // Estado inicial simplificado: se eliminan los campos relacionados con "lote"
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

  // 💾 Guardar producto
  const handleAddProduct = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!user) return

    try {
      // Se eliminó la lógica de cálculo por lote.
      // Se toma el Costo USD como costo unitario y Quantity como cantidad total.
      const costUsd = parseFloat(formData.costUsd)
      const quantity = parseInt(formData.quantity)

      const productData = {
        userId: user.uid,
        name: formData.name.trim(),
        category: formData.category,
        costUsd,
        quantity,
        profit: parseFloat(formData.profit),
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

  const calculateSalePrice = (product: Product): number => {
    let profitDecimal = product.profit > 1 ? product.profit / 100 : product.profit
    if (isNaN(profitDecimal) || profitDecimal < 0) profitDecimal = 0
    const salePrice = product.costUsd * (1 + profitDecimal)
    return Number.isFinite(salePrice) ? salePrice : 0
  }

  // 🧱 Render
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Productos</h2>
          <p className="text-muted-foreground">Gestiona tu inventario</p>
        </div>
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

      <BCVWidget onRateChange={(newRate) => setBcvRate(newRate)} />

      {/* Formulario */}
      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{editingId ? "Editar Producto" : "Nuevo Producto"}</CardTitle>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  placeholder="Nombre del producto"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
                <Input
                  placeholder="Código de barras"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                />

                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="px-3 py-2 border border-input rounded-md bg-background"
                  required
                >
                  <option value="">Selecciona categoría</option>
                  {categories.map((cat, i) => (
                    <option key={`${cat}-${i}`} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <Input
                    placeholder="Nueva categoría"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <Button
                    type="button"
                    onClick={handleAddCategory}
                    variant="outline"
                    className="whitespace-nowrap bg-transparent"
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
                />

                {/* Se muestra solo el campo de cantidad, ya no es condicional */}
                <Input
                  type="number"
                  placeholder="Cantidad disponible (unidades)"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                />
                
                <Input
                  type="number"
                  placeholder="Ganancia %"
                  step="0.01"
                  value={formData.profit}
                  onChange={(e) => setFormData({ ...formData, profit: e.target.value })}
                  required
                />

                <select
                  value={formData.saleType}
                  onChange={(e) =>
                    setFormData({ ...formData, saleType: e.target.value as FormData["saleType"] })
                  }
                  className="px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="unit">Por Unidad</option>
                  <option value="weight">Por Peso (Kg)</option>
                  <option value="area">Por Área (m²)</option>
                </select>
                
                {/* Se eliminaron: select de costType y campos condicionales de lote/unidad */}
              </div>

              <div className="flex gap-2">
                <Button type="submit" className="bg-primary hover:bg-primary/90">
                  {editingId ? "Actualizar" : "Guardar"}
                </Button>
                <Button type="button" onClick={resetForm} variant="outline">
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tabla */}
      <Card>
        <CardHeader>
          <div className="flex gap-2">
            <Input
              placeholder="Buscar producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background"
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
              {products.length === 0
                ? "No hay productos. Crea uno para comenzar."
                : "No se encontraron productos."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4">Producto</th>
                    <th className="text-left py-3 px-4">Categoría</th>
                    <th className="text-right py-3 px-4">Costo Unidad USD</th>
                    <th className="text-right py-3 px-4">Precio Venta USD</th>
                    <th className="text-right py-3 px-4">Precio Venta Bs</th>
                    <th className="text-right py-3 px-4">Unidades Disponibles</th>
                    <th className="text-left py-3 px-4">Tipo</th>
                    <th className="text-center py-3 px-4">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const salePrice = calculateSalePrice(product)
                    const salePriceBs = salePrice * bcvRate
                    return (
                      <tr key={product.id} className="border-b border-border hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">{product.name}</td>
                        <td className="py-3 px-4">{product.category}</td>
                        <td className="text-right py-3 px-4">${product.costUsd.toFixed(2)}</td>
                        <td className="text-right py-3 px-4">${salePrice.toFixed(2)}</td>
                        <td className="text-right py-3 px-4 font-semibold text-primary">
                          Bs {salePriceBs.toFixed(2)}
                        </td>
                        <td className="text-right py-3 px-4">{product.quantity}</td>
                        <td className="py-3 px-4 capitalize">{product.saleType}</td>
                        <td className="py-3 px-4">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleEditProduct(product)}
                              className="p-1 hover:bg-muted rounded"
                            >
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
    </div>
  )
}