"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs } from "firebase/firestore"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button" 
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react" 
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
import { m } from "framer-motion"
import CapitalizationCard from "./capitalization-card"

// 🔑 COMPONENTE SELECT BÁSICO (Para consistencia visual)
const Select = ({ children, className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select
        {...props}
        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
    >
        {children}
    </select>
);


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
  paymentMethodDescription?: string 
  bcvRate: number
  createdAt: any
}

// Función de utilidad para conversión segura
const safeFloat = (value: any): number => {
  return Number.parseFloat(String(value)) || 0
}

/** Fecha de la venta, tolerando documentos sin `createdAt`. */
const saleDateOf = (sale: { createdAt?: any }): Date | null => {
  const raw = sale?.createdAt
  if (!raw) return null
  const date = typeof raw?.toDate === "function" ? raw.toDate() : new Date(raw)
  return Number.isNaN(date?.getTime?.()) ? null : date
}

/**
 * Clave YYYY-MM-DD en hora LOCAL. Con `toISOString()` (UTC) las ventas de la
 * tarde en Venezuela se contaban en el día siguiente.
 */
const toLocalDateKey = (date: Date | null): string => {
  if (!date) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// 🔑 FUNCIÓN AUXILIAR DE VISUALIZACIÓN
const getDisplayPaymentMethod = (sale: Sale): string => {
    if (sale.paymentMethodDescription) {
        return sale.paymentMethodDescription;
    }
    
    if (sale.paymentMethod === 'mixed') {
        return 'Mixto (Detalle no guardado)'; 
    }
    
    switch (sale.paymentMethod) {
        case 'cash': return 'Efectivo (USD)';
        case 'zelle': return 'Zelle';
        case 'binance': return 'Binance';
        case 'debit': return 'Débito';
        case 'transfer': return 'Transferencia';
        case 'pagoMovil': return 'Pago Móvil';
        case 'biopago': return 'Biopago';
        default: return sale.paymentMethod || 'N/A';
    }
}

// 🔑 CONSTANTE PARA EL FILTRO DE MÉTODOS DE PAGO
const PAYMENT_METHODS = [
  { value: "all", label: "Todos los Métodos" },
  { value: "cash", label: "Efectivo (USD)" },
  { value: "zelle", label: "Zelle" },
  { value: "binance", label: "Binance" },
  { value: "debit", label: "Débito" },
  { value: "transfer", label: "Transferencia" },
  { value: "pagoMovil", label: "Pago Móvil" },
  { value: "biopago", label: "Biopago" },
  { value: "mixed", label: "Pago Mixto" },
];


export default function StatisticsView() {
  const { user, negocioId } = useAuth()
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  
  // 🔑 ESTADOS DE FILTRO Y PAGINACIÓN
  const [filterMethod, setFilterMethod] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const salesPerPage = 10; // Ventas por página


  useEffect(() => {
    if (user) {
      loadSales()
    }
  }, [user])

  const loadSales = async () => {
    if (!user) return
    setLoading(true)
    try {
      const salesQuery = query(collection(db, "ventas"), where("negocioId", "==", negocioId ?? user.uid))
      const salesSnapshot = await getDocs(salesQuery)
      
      const salesData = salesSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          paymentMethodDescription: data.paymentMethodDescription || undefined, 
          totalBs: safeFloat(data.totalBs),
          totalUsd: safeFloat(data.totalUsd),
        }
      }) as Sale[]
      
      setSales(salesData)
    } catch (error) {
      console.error("Error loading sales data:", error)
    } finally {
      setLoading(false)
    }
  }

  // 🔑 LÓGICA DE FILTRADO Y ORDENAMIENTO COMBINADO
  const filteredSales = sales
    // 1. Filtrado por fecha y método
    .filter((sale) => {
      const saleDate = toLocalDateKey(saleDateOf(sale))
      const matchesFrom = !dateFrom || saleDate >= dateFrom
      const matchesTo = !dateTo || saleDate <= dateTo
      
      const matchesMethod = filterMethod === "all" || sale.paymentMethod === filterMethod;
      
      return matchesFrom && matchesTo && matchesMethod
    })
    // 2. Ordenamiento: Más reciente primero (DESCENDENTE)
    .sort((a, b) => (saleDateOf(b)?.getTime() ?? 0) - (saleDateOf(a)?.getTime() ?? 0));
  
  // 🔑 LÓGICA DE PAGINACIÓN
  const indexOfLastSale = currentPage * salesPerPage;
  const indexOfFirstSale = indexOfLastSale - salesPerPage;
  const currentSalesForTable = filteredSales.slice(indexOfFirstSale, indexOfLastSale);
  const totalPages = Math.ceil(filteredSales.length / salesPerPage);

  const paginate = (pageNumber: number) => {
      if (pageNumber > 0 && pageNumber <= totalPages) {
          setCurrentPage(pageNumber);
      }
  };

  // 📊 Datos para el Gráfico de Barras: Ventas Diarias (Usa filteredSales, pero necesita ordenarse por fecha para el gráfico)
  const salesByDay = filteredSales.reduce((acc, sale) => {
    const date = saleDateOf(sale)
    const key = toLocalDateKey(date)
    if (!key) return acc

    if (!acc[key]) {
      acc[key] = {
        key,
        date: date!.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit" }),
        totalUsd: 0,
        totalBs: 0,
      }
    }
    acc[key].totalUsd += sale.totalUsd
    acc[key].totalBs += sale.totalBs
    return acc
  }, {} as Record<string, { key: string; date: string; totalUsd: number; totalBs: number }>)

  // El gráfico de barras necesita que sus datos estén ordenados ascendentemente (más antiguo primero) para que se muestre correctamente en el eje X.
  // Se ordena por la clave YYYY-MM-DD, que es ordenable como texto. Antes se
  // reconstruía una fecha a partir de "DD/MM" sin año y salía Invalid Date, así
  // que el gráfico mostraba los días en cualquier orden.
  const barChartData = Object.values(salesByDay).sort((a, b) => a.key.localeCompare(b.key))

  // 📊 Datos para el Gráfico de Torta: Métodos de Pago (Usa filteredSales)
  const salesByPaymentMethod = filteredSales.reduce((acc, sale) => {
    const method = getDisplayPaymentMethod(sale)
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
    return <div className="text-center py-8 flex justify-center items-center"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando estadísticas...</div>
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="space-y-4 md:space-y-6 p-4 md:p-0" 
    >
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2 md:mb-4">Estadísticas de Ventas</h2>
        <p className="text-sm md:text-base text-muted-foreground">Análisis de rendimiento de tu negocio.</p>
      </div>

      {/* La pregunta que de verdad importa, antes que cualquier gráfico:
          ¿lo que ganaste alcanza para reponer lo que vendiste? */}
      <CapitalizationCard dateFrom={dateFrom} dateTo={dateTo} />

      {/* 🔑 CONTROLES DE FILTRO (Fecha y Método de Pago) */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} 
          placeholder="Desde"
          className="w-full md:w-auto"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} 
          placeholder="Hasta"
          className="w-full md:w-auto"
        />
        {/* Filtro por Método de Pago */}
        <Select
          value={filterMethod}
          onChange={(e) => { setFilterMethod(e.target.value); setCurrentPage(1); }} 
          className="w-full md:w-60"
        >
          {PAYMENT_METHODS.map(method => (
            <option key={method.value} value={method.value}>
              {method.label}
            </option>
          ))}
        </Select>
      </div>

      {filteredSales.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No hay datos de ventas en el rango de fechas seleccionado o con el filtro aplicado.</p>
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
                  {/* Sin anotar el tipo del valor: Recharts lo declara como
                      `ValueType | undefined`, así que fijarlo a `number` deja
                      de compilar en cuanto la librería sube de versión. Y no
                      es solo tipografía — Recharts puede pasar undefined de
                      verdad, y `undefined.toFixed()` revienta el gráfico. */}
                  <Tooltip
                    formatter={(value) => [`$${(Number(value) || 0).toFixed(2)}`, "Total USD"]}
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
            </CardHeader> {/* 🔑 CORRECCIÓN: Se reemplazó el </CardTitle> duplicado por </CardHeader> */}
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
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`
                    }
                  >
                    {pieChartData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => {
                      const etiqueta = String(name ?? "")
                      return [
                        `$${(Number(value) || 0).toFixed(2)}`,
                        etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1),
                      ]
                    }}
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
                    {/* Usar las ventas paginadas (que ya están ordenadas) */}
                    {currentSalesForTable.map((sale) => (
                      <tr key={sale.id} className="border-b border-border hover:bg-muted/50">
                        <td className="py-3 px-4">
                          {saleDateOf(sale)?.toLocaleDateString("es-VE") ?? "sin fecha"}
                        </td>
                        <td className="text-right py-3 px-4">{sale.items.length}</td>
                        <td className="text-right py-3 px-4">
                          ${(safeFloat(sale.totalUsd) || 0).toFixed(2)}
                        </td>
                        <td className="text-right py-3 px-4 font-semibold text-primary">
                          Bs {(safeFloat(sale.totalBs) || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4">{getDisplayPaymentMethod(sale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* 🔑 CONTROLES DE PAGINACIÓN */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4">
                  <span className="text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => paginate(currentPage - 1)}
                      disabled={currentPage === 1}
                      variant="outline"
                      size="icon"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => paginate(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      variant="outline"
                      size="icon"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </m.div>
  )
}