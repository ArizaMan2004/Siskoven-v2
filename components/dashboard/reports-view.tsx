"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { generateInventoryReport, generateInvoice, generateProductLabels } from "@/lib/pdf-generator"
import { getBCVRate } from "@/lib/bcv-service"
import { FileText, Download } from "lucide-react"

interface Product {
  id: string
  name: string
  category: string
  costUsd: number
  quantity: number
  profit: number
  saleType: "unit" | "weight"
}

interface Sale {
  id: string
  items: Array<{
    productId: string
    name: string
    quantity: number
    priceUsd: number
    priceBs: number
  }>
  totalBs: number
  totalUsd: number
  paymentMethod: string
  bcvRate: number
  createdAt: any
}

export default function ReportsView() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [businessName, setBusinessName] = useState("Mi Comercio")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      loadData()
    }
  }, [user])

  const loadData = async () => {
    if (!user) return
    setLoading(true)
    try {
      const productsQuery = query(collection(db, "productos"), where("userId", "==", user.uid))
      const productsSnapshot = await getDocs(productsQuery)
      const productsData = productsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Product[]
      setProducts(productsData)

      const salesQuery = query(collection(db, "ventas"), where("userId", "==", user.uid))
      const salesSnapshot = await getDocs(salesQuery)
      const salesData = salesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Sale[]

      // 🔥 Ordenar ventas de la más reciente a la más antigua
      const sortedSales = salesData.sort(
        (a, b) => b.createdAt.toDate() - a.createdAt.toDate()
      )

      setSales(sortedSales)
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateInventoryReport = () => {
    const bcvData = getBCVRate()
    generateInventoryReport(products, businessName, bcvData.rate)
  }

  const handleGenerateLabels = () => {
    const bcvData = getBCVRate()
    generateProductLabels(products, bcvData.rate)
  }

  const handleGenerateInvoice = (sale: Sale) => {
    generateInvoice(sale.items, businessName, sale.totalBs, sale.totalUsd, sale.paymentMethod, sale.bcvRate)
  }

  if (loading) {
    return <div className="text-center py-8">Cargando reportes...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-4">Reportes</h2>
        <p className="text-muted-foreground">Genera reportes e invoices en PDF</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Reporte de Inventario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Descarga un reporte completo de tu inventario actual con precios en USD y Bs.
            </p>
            <Button onClick={handleGenerateInventoryReport} className="w-full gap-2 bg-primary hover:bg-primary/90">
              <Download className="w-4 h-4" />
              Descargar Reporte
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Etiquetas de Productos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Genera etiquetas imprimibles con los precios de tus productos.
            </p>
            <Button onClick={handleGenerateLabels} className="w-full gap-2 bg-accent hover:bg-accent/90">
              <Download className="w-4 h-4" />
              Generar Etiquetas
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de Ventas</CardTitle>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay ventas registradas</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4">Fecha</th>
                    <th className="text-right py-3 px-4">Total USD</th>
                    <th className="text-right py-3 px-4">Total Bs</th>
                    <th className="text-left py-3 px-4">Método de Pago</th>
                    <th className="text-center py-3 px-4">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4">{new Date(sale.createdAt.toDate()).toLocaleDateString("es-VE")}</td>
                      <td className="text-right py-3 px-4">${sale.totalUsd.toFixed(2)}</td>
                      <td className="text-right py-3 px-4 font-semibold text-primary">Bs {sale.totalBs.toFixed(2)}</td>
                      <td className="py-3 px-4">{sale.paymentMethod}</td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          onClick={() => handleGenerateInvoice(sale)}
                          size="sm"
                          variant="outline"
                          className="gap-1"
                        >
                          <Download className="w-3 h-3" />
                          Factura
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
 