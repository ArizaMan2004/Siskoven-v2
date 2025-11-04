// /app/api/bcv/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch("https://api.dolarvzla.com/public/exchange-rate", {
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Error consultando la API de DólarVzla" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const usd = data?.current?.usd;
    const date = data?.current?.date;

    if (!usd) {
      return NextResponse.json(
        { error: "No se encontró el valor de USD en la respuesta" },
        { status: 404 }
      );
    }

    const previousUsd = data?.previous?.usd ?? null;
    const change = data?.changePercentage?.usd ?? null;

    return NextResponse.json({
      rate: Number(usd),
      previous: Number(previousUsd),
      changePercentage: Number(change),
      date,
      lastUpdated: new Date(),
    });
  } catch (error) {
    console.error("Error API BCV:", error);
    return NextResponse.json(
      { error: "Fallo al conectar con la API" },
      { status: 500 }
    );
  }
}
