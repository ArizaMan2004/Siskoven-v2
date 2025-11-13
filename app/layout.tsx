import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Providers } from "./providers"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Siskoven - Sistema de Inventario",
  description: "Impulsa tu negocio con nuestro innovador sistema de gestión de inventario",
  generator: "Jesus Ariza",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`font-sans antialiased ${_geist.className}`}>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  )
}
