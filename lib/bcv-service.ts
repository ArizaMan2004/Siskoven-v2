// /lib/bcv-service.ts
export async function fetchBCVRateFromAPI() {
  try {
    const res = await fetch("/api/bcv");
    if (!res.ok) throw new Error("Error al consultar la API interna del BCV");

    const data = await res.json();
    if (!data.rate) throw new Error("No se encontró la tasa del BCV en la respuesta");

    return {
      rate: Number(data.rate),
      lastUpdated: new Date(data.lastUpdated),
    };
  } catch (error) {
    console.error("Error obteniendo tasa BCV:", error);
    throw error;
  }
}



// Estas funciones simulan almacenamiento local
export function getBCVRate() {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("bcvRate");
    if (stored) return JSON.parse(stored);
  }
  return { rate: 0, lastUpdated: new Date() };
}

export function setBCVRate(rate: number, source: "manual" | "api") {
  const data = { rate, source, lastUpdated: new Date() };
  if (typeof window !== "undefined") {
    localStorage.setItem("bcvRate", JSON.stringify(data));
  }
  return data;
}
