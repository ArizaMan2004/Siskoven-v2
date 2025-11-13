"use client"

// 🚨 CORRECCIÓN: Se agrega 'useCallback'
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchBCVRateFromAPI } from "@/lib/bcv-service"; 
import { RefreshCw } from "lucide-react"

interface BCVWidgetProps {
  onRateChange?: (rate: number) => void
}

export default function BCVWidget({ onRateChange }: BCVWidgetProps) {
  const [rate, setRate] = useState(216.37)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  
  // 🚨 CORRECCIÓN CLAVE 1: Envolver refreshRateFromAPI en useCallback
  // Esto asegura que la referencia a la función no cambie a menos que 'onRateChange' cambie.
  const refreshRateFromAPI = useCallback(async () => {
    setIsUpdating(true);
    try {
      // 1. Llama a la API
      const data = await fetchBCVRateFromAPI();
      
      // 2. Actualiza los estados
      setRate(data.rate);
      setLastUpdated(data.lastUpdated); 
      
      // 3. Notifica a los padres
      onRateChange?.(data.rate);
      
    } catch (error) {
      console.error("Error refreshing rate:", error);
    } finally {
      setIsUpdating(false);
    }
  }, [onRateChange]) // Depende de onRateChange (que estabilizaremos en el padre)

  // Hook para la actualización automática y al montar el componente
  useEffect(() => {
    const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

    // 1. Actualiza inmediatamente al montar
    refreshRateFromAPI();

    // 2. Configura el intervalo para la actualización periódica
    const intervalId = setInterval(refreshRateFromAPI, REFRESH_INTERVAL_MS);

    // 3. Función de limpieza: Detiene el intervalo al desmontar el componente
    return () => clearInterval(intervalId);
  // 🚨 CORRECCIÓN CLAVE 2: Ahora el useEffect solo depende de la versión memoizada de la función.
  }, [refreshRateFromAPI])


  const handleUpdateRate = () => {
    setLastUpdated(new Date())
    onRateChange?.(rate)
  }

  // Ahora, handleRefreshFromAPI solo necesita llamar a la función reutilizada
  const handleRefreshFromAPI = refreshRateFromAPI;


  const formatDate = (dateValue: Date | string | null) => {
  if (!dateValue) return "Sin fecha";

  let date: Date;
  try {
    // Asegura que el valor sea un objeto Date
    date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;

    if (isNaN(date.getTime())) return "Fecha inválida";

    return new Intl.DateTimeFormat("es-VE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "Fecha inválida";
  }
};


  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Tasa BCV</span>
          <span className="text-sm font-normal text-muted-foreground">Dólar - Bolívares</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-primary/10 rounded-lg p-4">
          <div className="text-4xl font-bold text-primary mb-2">Bs {rate.toFixed(2)}</div>
          <p className="text-sm text-muted-foreground">Actualizado: {formatDate(lastUpdated)}</p>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="number"
              value={rate}
              onChange={(e) => setRate(Number.parseFloat(e.target.value))}
              step="0.01"
              placeholder="Ingresa la tasa"
              className="flex-1"
              disabled={isUpdating}
            />
            <Button onClick={handleUpdateRate} className="bg-primary hover:bg-primary/90" disabled={isUpdating}>
              Guardar
            </Button>
          </div>

          <Button
            onClick={handleRefreshFromAPI}
            disabled={isUpdating}
            variant="outline"
            className="w-full gap-2 bg-transparent"
          >
            <RefreshCw className={`w-4 h-4 ${isUpdating ? "animate-spin" : ""}`} />
            {isUpdating ? "Actualizando..." : "Actualizar Tasa BCV"}
          </Button>
        </div>
        <p className="text-xs text-center text-muted-foreground">
          Actualización automática cada 5 minutos.
        </p>
      </CardContent>
    </Card>
  )
}