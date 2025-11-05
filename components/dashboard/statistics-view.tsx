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
// ⭐️ NUEVO: Importación para animaciones
import { motion } from "framer-motion"

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
      const salesQuery = query(collection(db, "ventas"), where("userId", "==", user.uid))
      const salesSnapshot = await getDocs(salesQuery)
      const salesData = salesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Sale[]

      // Convertir valores numéricos a float para asegurar cálculos
      const cleanedSales = salesData.map((sale) => ({
        ...sale,
        totalBs: safeFloat(sale.totalBs),
        totalUsd: safeFloat(sale.totalUsd),
      }))

      setSales(cleanedSales)
    } catch (error) {
      console.error("Error loading sales data:", error)
    } finally {
      setLoading(false)
    }
  }

  // Filtrado por fecha
  const filteredSales = sales.filter((sale) => {
    const saleDate = sale.createdAt.toDate().toISOString().split("T")[0]
    const matchesFrom = !dateFrom || saleDate >= dateFrom
    const matchesTo = !dateTo || saleDate <= dateTo
    return matchesFrom && matchesTo
  })

  // 📊 Datos para el Gráfico de Barras: Ventas Diarias
  const salesByDay = filteredSales.reduce((acc, sale) => {
    const date = sale.createdAt.toDate().toLocaleDateString("es-VE", {
      day: "2-digit",
      month: "2-digit",
    })
    if (!acc[date]) {
      acc[date] = { date, totalUsd: 0, totalBs: 0 }
    }
    acc[date].totalUsd += sale.totalUsd
    acc[date].totalBs += sale.totalBs
    return acc
  }, {} as Record<string, { date: string; totalUsd: number; totalBs: number }>)

  const barChartData = Object.values(salesByDay).sort(
    (a, b) => new Date(a.date.split("/").reverse().join("-")).getTime() - new Date(b.date.split("/").reverse().join("-")).getTime(),
  )

  // 📊 Datos para el Gráfico de Torta: Métodos de Pago
  const salesByPaymentMethod = filteredSales.reduce((acc, sale) => {
    const method = sale.paymentMethod
    if (!acc[method]) {
      acc[method] = { name: method, value: 0 }
    }
    acc[method].value += sale.totalUsd
    return acc
  }, {} as Record<string, { name: string; value: number }>)

  const pieChartData = Object.values(salesByPaymentMethod).filter((item) => item.value > 0)

  // Sumario de Totales
  const totalUsdSum = filteredSales.reduce((sum, sale) => sum + sale.totalUsd, 0)
  const totalBsSum = filteredSales.reduce((sum, sale) => sum + sale.totalBs, 0)
  const totalSalesCount = filteredSales.length

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"]

  if (loading) {
    return <div className="text-center py-8">Cargando estadísticas...</div>
  }

  return (
    // ⭐️ AJUSTE DE ANIMACIÓN: motion.div envuelve todo el contenido
    <motion.div
      initial={{ opacity: 0, y: 20 }} // Comienza invisible y 20px abajo
      animate={{ opacity: 1, y: 0 }} // Termina visible y en su posición (subiendo)
      transition={{ duration: 0.5, ease: "easeOut" }} // Duración de 0.5 segundos
      className="space-y-4 md:space-y-6"
    >
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2 md:mb-4">Estadísticas de Ventas</h2>
        <p className="text-sm md:text-base text-muted-foreground">Análisis de rendimiento de tu negocio.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder="Desde"
          className="w-full md:w-auto"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder="Hasta"
          className="w-full md:w-auto"
        />
      </div>

      {filteredSales.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No hay datos de ventas en el rango de fechas seleccionado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="px-4 pt-4 md:px-6 md:pt-6">
                <CardTitle className="text-sm font-medium">Ventas Totales (USD)</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
                <div className="text-2xl md:text-3xl font-bold">${totalUsdSum.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1">Suma de ventas en el período</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="px-4 pt-4 md:px-6 md:pt-6">
                <CardTitle className="text-sm font-medium">Ventas Totales (Bs)</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
                <div className="text-2xl md:text-3xl font-bold text-primary">Bs {totalBsSum.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1">Suma de ventas en el período</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="px-4 pt-4 md:px-6 md:pt-6">
                <CardTitle className="text-sm font-medium">Transacciones</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
                <div className="text-2xl md:text-3xl font-bold">{totalSalesCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Número total de ventas</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="px-4 pt-4 md:px-6 md:pt-6">
              <CardTitle className="text-base md:text-lg">Ventas Diarias (USD)</CardTitle>
            </CardHeader>
            <CardContent className="h-64 px-4 pb-4 md:px-6 md:pb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                  <XAxis dataKey="date" stroke="#888888" fontSize={10} />
                  <YAxis stroke="#888888" fontSize={10} tickFormatter={(value) => `$${value.toFixed(0)}`} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Total USD"]}
                    labelFormatter={(label) => `Fecha: ${label}`}
                  />
                  <Bar dataKey="totalUsd" fill="#8884d8" name="Ventas USD" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 pt-4 md:px-6 md:pt-6">
              <CardTitle className="text-base md:text-lg">Distribución por Método de Pago</CardTitle>
            </CardHeader>
            <CardContent className="h-64 px-4 pb-4 md:px-6 md:pb-6">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {pieChartData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `$${value.toFixed(2)}`,
                      name.charAt(0).toUpperCase() + name.slice(1),
                    ]}
                  />
                  <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 pt-4 md:px-6 md:pt-6">
              <CardTitle className="text-base md:text-lg">Detalle de Ventas</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
              <div className="overflow-x-auto">
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
                        <td className="py-3 px-4">
                          {new Date(sale.createdAt.toDate()).toLocaleDateString("es-VE")}
                        </td>
                        <td className="text-right py-3 px-4">{sale.items.length}</td>
                        <td className="text-right py-3 px-4">
                          ${(safeFloat(sale.totalUsd) || 0).toFixed(2)}
                        </td>
                        <td className="text-right py-3 px-4 font-semibold text-primary">
                          Bs {(safeFloat(sale.totalBs) || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4">{sale.paymentMethod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </motion.div>
  )
}