"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchBCVRateFromAPI, getBCVRate, setBCVRate } from "@/lib/bcv-service";
import { RefreshCw } from "lucide-react"

interface BCVWidgetProps {
  onRateChange?: (rate: number) => void
}

export default function BCVWidget({ onRateChange }: BCVWidgetProps) {
  const [rate, setRate] = useState(216.37)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    const bcvData = getBCVRate()
    setRate(bcvData.rate)
    setLastUpdated(bcvData.lastUpdated)
  }, [])

  const handleUpdateRate = () => {
    setBCVRate(rate, "manual")
    setLastUpdated(new Date())
    onRateChange?.(rate)
  }

const handleRefreshFromAPI = async () => {
  setIsUpdating(true);
  try {
    const data = await fetchBCVRateFromAPI();
    setRate(data.rate);
    setBCVRate(data.rate, "api");
    setLastUpdated(data.lastUpdated);
    onRateChange?.(data.rate);
  } catch (error) {
    console.error("Error refreshing rate:", error);
  } finally {
    setIsUpdating(false);
  }
}

  const formatDate = (dateValue: Date | string) => {
  if (!dateValue) return "Sin fecha";

  let date: Date;
  try {
    // Si viene como string (por ejemplo "2025-10-28"), conviértelo a Date
    date = typeof dateValue === "string" ? new Date(dateValue + "T00:00:00") : dateValue;

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
            />
            <Button onClick={handleUpdateRate} className="bg-primary hover:bg-primary/90">
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
      </CardContent>
    </Card>
  )
}
