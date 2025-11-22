// @/components/dashboard/CalculatorView.tsx

"use client"

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DollarSign, Euro, Loader2, Repeat2, Calculator as CalcIcon } from "lucide-react";
// Importar el servicio BCV para obtener las tasas (Asumiendo que existe en la ruta lib)
import { fetchBCVRateFromAPI } from "@/lib/bcv-service"; 


// --- Tipado para las tasas de cambio ---
interface ExchangeRates {
    usdRate: number | null; 
    eurRate: number | null; 
    loading: boolean;
    error: string | null;
}

// --- UTILIDAD: Formato para Bolívares (es-VE) ---
const formatCurrencyBs = (amount: number | null): string => {
    if (amount === null || isNaN(amount)) return "0,00";
    return new Intl.NumberFormat('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
};

// --- UTILIDAD: Formato para Divisas (USD/EUR) ---
const formatCurrencyForeign = (amount: number | null): string => {
    if (amount === null || isNaN(amount)) return "0.00";
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
};


// --- Sub-Componente de la Lógica de Conversión ---
const CurrencyConverter: React.FC<{ rates: ExchangeRates }> = ({ rates }) => {
    const { usdRate, eurRate, loading, error } = rates;
    
    // Estado para la conversión
    const [inputAmount, setInputAmount] = useState<number>(1); 
    const [isForeignToBs, setIsForeignToBs] = useState(true); 
    const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'EUR'>('USD'); 
    const [result, setResult] = useState<number | null>(null);

    const currentRate = selectedCurrency === 'USD' ? usdRate : eurRate;
    const otherRateAvailable = selectedCurrency === 'USD' ? (eurRate !== null) : (usdRate !== null);

    const handleCalculate = useCallback((amount: number, foreignToBs: boolean, rate: number | null) => {
        if (rate === null || amount <= 0) {
            setResult(null);
            return;
        }

        let calculatedResult: number;

        if (foreignToBs) {
            // Conversión: USD/EUR a Bs (Multiplicación)
            calculatedResult = amount * rate;
        } else {
            // Conversión: Bs a USD/EUR (División)
            calculatedResult = amount / rate;
        }

        setResult(calculatedResult);
    }, []);

    useEffect(() => {
        handleCalculate(inputAmount, isForeignToBs, currentRate);
    }, [inputAmount, currentRate, isForeignToBs, handleCalculate]);

    const toggleCurrency = () => {
        const newCurrency = selectedCurrency === 'USD' ? 'EUR' : 'USD';
        setSelectedCurrency(newCurrency);
    };
    
    const toggleDirection = () => {
        const newDirection = !isForeignToBs;
        // Usar el resultado anterior como nuevo input si es válido
        const newInputValue = (result !== null && result > 0) ? result : inputAmount;

        setIsForeignToBs(newDirection);
        setInputAmount(newInputValue);
    };

    const fromCurrency = isForeignToBs ? selectedCurrency : 'Bs';
    const toCurrency = isForeignToBs ? 'Bs' : selectedCurrency;
    const fromLabel = `Monto (${fromCurrency})`;
    const toLabel = `Resultado (${toCurrency})`;

    const formattedRate = currentRate !== null ? formatCurrencyBs(currentRate) : "N/A";
    
    const formattedResult = isForeignToBs 
        ? formatCurrencyBs(result) 
        : formatCurrencyForeign(result);


    return (
        <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Convierte entre Bolívares (Bs) y Divisas ({selectedCurrency}) usando la tasa BCV actual.
            </p>

            {loading && (
                 <div className="p-4 bg-yellow-50/50 rounded-md text-sm text-yellow-700 flex items-center">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin"/>Cargando tasas de cambio...
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-50/50 rounded-md text-sm text-red-700">{error}</div>
            )}

            {currentRate && !loading && (
                <>
                    <div className="flex justify-between items-center bg-gray-100 dark:bg-gray-800 p-3 rounded-md">
                        <span className="text-sm font-semibold">Tasa BCV ({selectedCurrency} a Bs):</span>
                        <span className="text-lg font-bold text-primary">
                            Bs {formattedRate}
                        </span>
                    </div>

                    <div className="flex gap-2 items-center">
                        {/* Input para Monto Inicial */}
                        <div className="flex-1 space-y-2">
                            <label htmlFor="monto-input" className="text-sm font-medium block">
                                {fromLabel}
                            </label>
                            <Input
                                id="monto-input"
                                type="number"
                                value={inputAmount}
                                onChange={(e) => setInputAmount(parseFloat(e.target.value) || 0)}
                                placeholder="1.00"
                                className="text-lg font-semibold"
                            />
                        </div>

                        {/* Botón para cambiar dirección */}
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={toggleDirection}
                            title={`Cambiar dirección: ${fromCurrency} a ${toCurrency}`}
                            className="flex-shrink-0 mt-7"
                        >
                            <Repeat2 className="w-4 h-4" />
                        </Button>

                        {/* Input para Resultado */}
                        <div className="flex-1 space-y-2">
                            <label htmlFor="resultado-output" className="text-sm font-medium block">
                                {toLabel}
                            </label>
                            <Input
                                id="resultado-output"
                                type="text"
                                value={formattedResult}
                                readOnly
                                className="text-lg font-semibold bg-primary/10 border-primary"
                            />
                        </div>
                    </div>

                    {otherRateAvailable && (
                        <Button
                            variant="outline"
                            onClick={toggleCurrency}
                            className="w-full mt-2 gap-2"
                        >
                            {selectedCurrency === 'USD' ? <Euro className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
                            {selectedCurrency === 'USD' ? `Cambiar a EUR` : `Cambiar a USD`}
                        </Button>
                    )}
                </>
            )}
        </CardContent>
    );
};


// --- Componente principal (Vista de Calculadora) ---

const CalculatorView: React.FC = () => {
    const [rates, setRates] = useState<ExchangeRates>({
        usdRate: null,
        eurRate: null,
        loading: true,
        error: null
    });

    useEffect(() => {
        const loadRates = async () => {
            try {
                setRates(r => ({ ...r, loading: true, error: null }));

                // 🚨 Asumiendo que esta función trae ambas tasas (USD y EUR) del BCV
                const data = await fetchBCVRateFromAPI();

                // Intentamos extraer USD y EUR. Si solo viene 'rate', lo asignamos a USD.
                const currentUsdRate = (data as any).usdRate ?? (data as any).rate ?? null;
                const currentEurRate = (data as any).eurRate ?? null;

                setRates({
                    usdRate: currentUsdRate !== null ? parseFloat(currentUsdRate) : null,
                    eurRate: currentEurRate !== null ? parseFloat(currentEurRate) : null,
                    loading: false,
                    error: null,
                });

            } catch (err) {
                console.error("Error al cargar tasas de BCV:", err);
                setRates(r => ({ ...r, loading: false, error: "No se pudieron cargar las tasas de cambio BCV." }));
            }
        };
        loadRates();
    }, []);

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center text-xl font-bold">
                            <CalcIcon className="w-5 h-5 mr-3 text-primary" />
                            Conversor de Divisas
                        </CardTitle>
                    </CardHeader>
                    {/* Renderizamos directamente la lógica de conversión sin las pestañas */}
                    <CurrencyConverter rates={rates} /> 
                </Card>
            </div>
        </div>
    );
};

export default CalculatorView;