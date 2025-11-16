"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
// 🔑 Importar doc y getDoc para leer un solo documento
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
// 🔑 Se asume que BusinessInfo se exporta de pdf-generator
import { generateInventoryReport, generateInvoice, generateProductLabels, BusinessInfo } from "@/lib/pdf-generator" 
import { getBCVRate } from "@/lib/bcv-service"
import { FileText, Download } from "lucide-react"
import { motion } from "framer-motion"

// Interfaces... (restante igual)
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
  const [currentBcvRate, setCurrentBcvRate] = useState<number>(0) 
  
  // 🔑 NUEVO ESTADO: Inicializar con datos por defecto/placeholder
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({
      logoBase64: 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4MoaAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAhSURBVHja7cEBDQAAACDqg29+pXAPAAAAAAAAAAAAAAAAAAAAAH8G5vQAAXh0jRkAAAAASUVORK5CYII=', // Placeholder: Pequeña imagen blanca
      fiscalAddress: "No configurada",
      fiscalDocument: "No configurado",
      phoneNumber: "No configurado",
      email: "No configurado",
      bankName: "No configurado",
      bankAccountOwner: "No configurado",
      bankAccountNumber: "No configurado",
  });

  useEffect(() => {
    if (user) {
      loadData()
    }
  }, [user])
  
  useEffect(() => {
    const rateData = getBCVRate()
    setCurrentBcvRate(rateData.rate) 
  }, [])


  const loadData = async () => {
    if (!user) return
    setLoading(true)
    try {
      // Lógica para obtener el businessName y datos fiscales
      const userDocRef = doc(db, "usuarios", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const data = userDoc.data();
        
        if (data.businessName) {
          setBusinessName(data.businessName as string); 
        }
        
        // 🔑 Cargar Información Fiscal y Bancaria del documento de usuario
        setBusinessInfo({
            // Se usa el valor por defecto si no existe en la base de datos (|| businessInfo.[...])
            logoBase64: data.logoBase64 || businessInfo.logoBase64,
            fiscalAddress: data.fiscalAddress || "Dirección Fiscal, Ciudad, País",
            fiscalDocument: data.fiscalDocument || "J-00000000",
            phoneNumber: data.phoneNumber || "0412-1234567",
            email: data.email || "contacto@tutienda.com",
            bankName: data.bankName || "Banco Nacional",
            bankAccountOwner: data.bankAccountOwner || "Nombre del Titular",
            bankAccountNumber: data.bankAccountNumber || "0100-0000-00-0000000000",
        });
      }
      
      // Cargar Productos
      const productsQuery = query(collection(db, "productos"), where("userId", "==", user.uid))
      const productsSnapshot = await getDocs(productsQuery)
      const productsData = productsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Product[]
      setProducts(productsData)

      // Cargar Ventas
      const salesQuery = query(collection(db, "ventas"), where("userId", "==", user.uid))
      const salesSnapshot = await getDocs(salesQuery)
      const salesData = salesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Sale[]

      const sortedSales = salesData.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate())

      setSales(sortedSales)
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateInventoryReport = () => {
    if (currentBcvRate === 0) {
        alert("La tasa BCV no se ha cargado correctamente. Asegúrate de que esté configurada en el widget.");
        return;
    }
    generateInventoryReport(products, businessName, currentBcvRate)
  }

  const handleGenerateLabels = () => {
    if (currentBcvRate === 0) {
        alert("La tasa BCV no se ha cargado correctamente. Asegúrate de que esté configurada en el widget.");
        return;
    }
    generateProductLabels(products, currentBcvRate) 
  }

  // 🔑 LÓGICA DE FACTURA ACTUALIZADA
  const handleGenerateInvoice = (sale: Sale) => {
    generateInvoice(
        sale.items, 
        businessName, 
        sale.totalBs, 
        sale.totalUsd, 
        sale.paymentMethod, 
        sale.bcvRate,
        0, // discountApplied
        "CLIENTE DE EJEMPLO", // Placeholder para el nombre del cliente
        businessInfo // 🔑 PASAMOS TODA LA INFO FISCAL Y BANCARIA
    )
  }

  if (loading) {
    return <div className="text-center py-8">Cargando reportes...</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="space-y-4 md:space-y-6"
    >
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2 md:mb-4">Reportes</h2>
        <p className="text-sm md:text-base text-muted-foreground">Genera reportes e invoices en PDF</p>
      </div>
      
      {/* Resto del JSX... (igual) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="px-4 pt-4 md:px-6 md:pt-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <FileText className="w-4 h-4 md:w-5 md:h-5" />
              Reporte de Inventario
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
            <p className="text-xs md:text-sm text-muted-foreground mb-4">
              Descarga un reporte completo de tu inventario actual con precios en USD y Bs.
            </p>
            <Button 
                onClick={handleGenerateInventoryReport} 
                className="w-full gap-2 bg-primary hover:bg-primary/90"
                // Deshabilitar el botón si la tasa es 0 para evitar PDFs incorrectos.
                disabled={currentBcvRate === 0} 
            >
              <Download className="w-4 h-4" />
              {currentBcvRate === 0 ? "Cargando Tasa BCV..." : "Descargar Reporte"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-4 pt-4 md:px-6 md:pt-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <FileText className="w-4 h-4 md:w-5 md:h-5" />
              Etiquetas de Productos
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 md:px-6 md:pb-6">
            <p className="text-xs md:text-sm text-muted-foreground mb-4">
              Genera etiquetas imprimibles con los precios de tus productos.
            </p>
            <Button 
                onClick={handleGenerateLabels} 
                className="w-full gap-2 bg-accent hover:bg-accent/90"
                // Deshabilitar el botón si la tasa es 0 para evitar PDFs incorrectos.
                disabled={currentBcvRate === 0}
            >
              <Download className="w-4 h-4" />
              {currentBcvRate === 0 ? "Cargando Tasa BCV..." : "Generar Etiquetas"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="px-4 pt-4 md:px-6 md:pt-6">
          <CardTitle className="text-base md:text-lg">Historial de Ventas</CardTitle>
        </CardHeader>
        <CardContent className="px-4 md:px-6">
          {sales.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No hay ventas registradas</p>
          ) : (
            <>
              {/* Vista de tarjetas para móvil */}
              <div className="lg:hidden space-y-3">
                {sales.map((sale) => (
                  <div key={sale.id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium">
                        {new Date(sale.createdAt.toDate()).toLocaleDateString("es-VE")}
                      </span>
                      <span className="text-xs bg-muted px-2 py-1 rounded">{sale.paymentMethod}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total USD:</span>
                      <span className="font-medium">${sale.totalUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-3">
                      <span className="text-muted-foreground">Total Bs:</span>
                      <span className="font-semibold text-primary">Bs {sale.totalBs.toFixed(2)}</span>
                    </div>
                    <Button
                      onClick={() => handleGenerateInvoice(sale)}
                      size="sm"
                      variant="outline"
                      className="w-full gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Descargar Factura
                    </Button>
                  </div>
                ))}
              </div>

              {/* Vista de tabla para desktop */}
              <div className="hidden lg:block overflow-x-auto">
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
                        <td className="text-right py-3 px-4 font-semibold text-primary">
                          Bs {sale.totalBs.toFixed(2)}
                        </td>
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
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}