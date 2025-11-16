"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
// 🔑 CORRECCIÓN 1: Importar funciones de persistencia
import { fetchBCVRateFromAPI, getBCVRate, setBCVRate } from "@/lib/bcv-service"; 
import { RefreshCw, AlertTriangle } from "lucide-react"
import { toast } from "sonner" // Asumiendo que usas Sonner para notificaciones

interface BCVWidgetProps {
  onRateChange?: (rate: number) => void
}

// ⚙️ FUNCIÓN ASUMIDA: Da formato a la fecha para el display
const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    // Muestra en formato DD/MM/AAAA HH:MM (ajusta según tu necesidad)
    return date.toLocaleString("es-VE", {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        hour12: true
    });
};

// 🔑 CORRECCIÓN 2: Cargar el estado inicial desde localStorage
const initialData = getBCVRate();

export default function BCVWidget({ onRateChange }: BCVWidgetProps) {
  // Inicialización con el valor guardado o 0 como fallback.
  const [rate, setRate] = useState(initialData.rate || 0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(
    initialData.lastUpdated ? new Date(initialData.lastUpdated) : null
  )
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null) // Nuevo estado para errores

  // 🚨 CORRECCIÓN CLAVE 3: Lógica de refresco envuelta en useCallback
  const refreshRateFromAPI = useCallback(async () => {
    setIsUpdating(true);
    setError(null);
    try {
      // 1. Llama a la API
      const data = await fetchBCVRateFromAPI();
      
      // 2. Guarda en localStorage y obtiene la data actualizada con timestamp
      const updatedData = setBCVRate(data.rate, "api");
      
      // 3. Actualiza los estados
      setRate(updatedData.rate);
      setLastUpdated(updatedData.lastUpdated); 
      
      // 4. Notifica al componente padre
      onRateChange?.(updatedData.rate); 
      toast.success("Tasa BCV actualizada desde la API.")

    } catch (err) {
      console.error("Error al obtener tasa BCV:", err);
      setError("Error al obtener la tasa. Revisa la consola o ingresa manualmente.");
      toast.error("Fallo al actualizar la tasa BCV.")
    } finally {
      setIsUpdating(false);
    }
  }, [onRateChange]);

  // 🔑 CORRECCIÓN 4: Handle para actualizar manualmente
  const handleUpdateRate = useCallback(() => {
    setError(null);
    if (rate <= 0 || !Number.isFinite(rate)) {
        setError("La tasa debe ser un número positivo.");
        return;
    }
    
    // 1. Guarda en localStorage
    const updatedData = setBCVRate(rate, "manual");
    
    // 2. Actualiza el timestamp del estado
    setLastUpdated(updatedData.lastUpdated);

    // 3. Notifica al componente padre
    onRateChange?.(updatedData.rate);
    toast.success("Tasa BCV guardada correctamente.")
  }, [rate, onRateChange]);


  // 🔑 CORRECCIÓN 5: Carga inicial y refresco automático
  useEffect(() => {
    // Si la tasa es 0 o null (primer uso), intenta cargarla desde la API.
    if (rate === 0) {
      refreshRateFromAPI();
    }
  }, [rate, refreshRateFromAPI]);


  const handleRefreshFromAPI = refreshRateFromAPI; // Alias para el botón

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Tasa BCV <span className="text-sm font-normal text-muted-foreground">(USD a Bolívares)</span>
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
            {/* Usa el nuevo handler */}
            <Button onClick={handleUpdateRate} className="bg-primary hover:bg-primary/90" disabled={isUpdating}>
              Guardar
            </Button>
          </div>
          
          {/* Mostrar el error si existe */}
          {error && (
            <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                {error}
            </p>
          )}

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
        
        {/* Aquí asumimos que va el resto del JSX si lo hay */}
      </CardContent>
    </Card>
  )
}