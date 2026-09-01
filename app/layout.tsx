import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Providers } from "./providers"
import ServiceWorkerRegistrar from "@/components/service-worker-registrar"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Siskoven - Sistema de Inventario",
  description: "Impulsa tu negocio con nuestro innovador sistema de gestión de inventario",
  generator: "Jesus Ariza",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Siskoven" },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1e3a73" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1017" },
  ],
  // La caja se usa con una sola mano: que el navegador no haga zoom solo al
  // enfocar un campo de precio.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        <ServiceWorkerRegistrar />
        <Analytics />
      </body>
    </html>
  )
}
