import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { AuthProvider } from "@/lib/auth-context"
import { ThemeProviderWrapper } from "@/components/theme-provider"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Siskoven - Sistema de Inventario",
  description: "Impulsa tu negocio nuestro innvovador sistema de gestion de inventario",
  generator: "Jesus Ariza",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`font-sans antialiased`}>
        <AuthProvider>
          <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
