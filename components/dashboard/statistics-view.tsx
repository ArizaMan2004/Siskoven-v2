"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs } from "firebase/firestore"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"

interface Sale {
  id: string
  items: Array<{
    productId: string
    name: string
    quantity: number
    priceUsd: number
    priceBs: number
  }>
  totalBs: any
  totalUsd: any
  paymentMethod: string
  bcvRate: number
  createdAt: any
}

export default function StatisticsView() {
  const { user } = useAuth()
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  // Función de utilidad para conversión segura
  const safeFloat = (value: any): number => {
    return Number.parseFloat(String(value)) || 0
  }

  useEffect(() => {
    if (user) {
      loadSales()
    }
  }, [user])

  const loadSales = async () => {
    if (!user) return
    setLoading(true)
    try {
      const q = query(collection(db, "ventas"), where("userId", "==", user.uid))
      const snapshot = await getDocs(q)
      const salesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Sale[]
      setSales(salesData)
    } catch (error) {
      console.error("Error loading sales:", error)
    } finally {
      setLoading(false)
    }
  }

  // 🔥 CORRECCIÓN: Se añade .sort() después del .filter()
  const filteredSales = sales
    .filter((sale) => {
      // Asegurarse de que createdAt es válido
      if (!sale.createdAt || !sale.createdAt.toDate) return false

      const saleDate = new Date(sale.createdAt.toDate())
      const from = dateFrom ? new Date(dateFrom) : null
      const to = dateTo ? new Date(dateTo) : null

      // Ajusta la fecha 'Hasta' al último milisegundo del día
      if (to) {
        to.setHours(23, 59, 59, 999)
      }

      if (from && saleDate < from) return false
      if (to && saleDate > to) return false
      return true
    })
    .sort((a, b) => {
      // Ordenar DESCENDENTE (más reciente arriba)
      // b.createdAt.toDate().getTime() > a.createdAt.toDate().getTime()
      const dateA = a.createdAt.toDate().getTime()
      const dateB = b.createdAt.toDate().getTime()
      return dateB - dateA
    })

  // Aplicar safeFloat en todos los cálculos de suma
  const totalSales = filteredSales.length
  const totalRevenueBs = filteredSales.reduce((sum, sale) => sum + safeFloat(sale.totalBs), 0)
  const totalRevenueUsd = filteredSales.reduce((sum, sale) => sum + safeFloat(sale.totalUsd), 0)
  const averageSaleBs = totalSales > 0 ? totalRevenueBs / totalSales : 0

  const paymentMethodData = filteredSales.reduce(
    (acc, sale) => {
      const saleTotalBs = safeFloat(sale.totalBs)

      const existing = acc.find((item) => item.name === sale.paymentMethod)
      if (existing) {
        existing.value += saleTotalBs
      } else {
        acc.push({ name: sale.paymentMethod, value: saleTotalBs })
      }
      return acc
    },
    [] as Array<{ name: string; value: number }>,
  )

  const dailySalesData = filteredSales.reduce(
    (acc, sale) => {
      const date = new Date(sale.createdAt.toDate()).toLocaleDateString("es-VE")
      const saleTotalBs = safeFloat(sale.totalBs)

      const existing = acc.find((item) => item.date === date)
      if (existing) {
        existing.total += saleTotalBs
        existing.count += 1
      } else {
        acc.push({ date, total: saleTotalBs, count: 1 })
      }
      return acc
    },
    [] as Array<{ date: string; total: number; count: number }>,
  )

  const COLORS = ["#4f35f8", "#ff6b6b", "#4ecdc4", "#45b7d1", "#ffa07a"]

  if (loading) {
    return <div className="text-center py-8">Cargando estadísticas...</div>
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2 md:mb-4">Estadísticas de Ventas</h2>
        <p className="text-sm md:text-base text-muted-foreground">Análisis de tu desempeño de ventas</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
        <div className="flex-1">
          <label className="text-sm font-medium text-foreground">Desde</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1" />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium text-foreground">Hasta</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardHeader className="pb-2 px-3 pt-3 md:px-6 md:pt-6">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Total de Ventas</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
            <div className="text-xl md:text-2xl font-bold text-foreground">{totalSales}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 px-3 pt-3 md:px-6 md:pt-6">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Ingresos USD</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
            <div className="text-xl md:text-2xl font-bold text-foreground">${totalRevenueUsd.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 px-3 pt-3 md:px-6 md:pt-6">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Ingresos Bs</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
            <div className="text-xl md:text-2xl font-bold text-primary">Bs {totalRevenueBs.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 px-3 pt-3 md:px-6 md:pt-6">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Promedio por Venta</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
            <div className="text-xl md:text-2xl font-bold text-foreground">Bs {averageSaleBs.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader className="px-4 pt-4 md:px-6 md:pt-6">
            <CardTitle className="text-base md:text-lg">Ventas por Día</CardTitle>
          </CardHeader>
          <CardContent className="px-2 md:px-6">
            {dailySalesData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No hay datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dailySalesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="total" fill="#4f35f8" name="Total Bs" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-4 pt-4 md:px-6 md:pt-6">
            <CardTitle className="text-base md:text-lg">Métodos de Pago</CardTitle>
          </CardHeader>
          <CardContent className="px-2 md:px-6">
            {paymentMethodData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No hay datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: Bs ${(value || 0).toFixed(0)}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="px-4 pt-4 md:px-6 md:pt-6">
          <CardTitle className="text-base md:text-lg">Detalle de Ventas</CardTitle>
        </CardHeader>
        <CardContent className="px-4 md:px-6">
          {filteredSales.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No hay ventas en este período</p>
          ) : (
            <>
              {/* Vista de tarjetas para móvil */}
              <div className="lg:hidden space-y-3">
                {filteredSales.map((sale) => (
                  <div key={sale.id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-medium">
                        {new Date(sale.createdAt.toDate()).toLocaleDateString("es-VE")}
                      </span>
                      <span className="text-xs bg-muted px-2 py-1 rounded">{sale.paymentMethod}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Productos:</span>
                      <span className="font-medium">{sale.items.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total USD:</span>
                      <span className="font-medium">${(Number.parseFloat(String(sale.totalUsd)) || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Bs:</span>
                      <span className="font-semibold text-primary">
                        Bs {(Number.parseFloat(String(sale.totalBs)) || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Vista de tabla para desktop */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4">Fecha</th>
                      <th className="text-right py-3 px-4">Productos</th>
                      <th className="text-right py-3 px-4">Total USD</th>
                      <th className="text-right py-3 px-4">Total Bs</th>
                      <th className="text-left py-3 px-4">Método</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map((sale) => (
                      <tr key={sale.id} className="border-b border-border hover:bg-muted/50">
                        <td className="py-3 px-4">{new Date(sale.createdAt.toDate()).toLocaleDateString("es-VE")}</td>
                        <td className="text-right py-3 px-4">{sale.items.length}</td>
                        <td className="text-right py-3 px-4">
                          ${(Number.parseFloat(String(sale.totalUsd)) || 0).toFixed(2)}
                        </td>
                        <td className="text-right py-3 px-4 font-semibold text-primary">
                          Bs {(Number.parseFloat(String(sale.totalBs)) || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4">{sale.paymentMethod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
