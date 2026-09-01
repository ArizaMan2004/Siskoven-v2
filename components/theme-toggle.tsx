"use client"

import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  // resolvedTheme, no theme: con la preferencia del sistema activada `theme`
  // vale "system", así que comparar con "dark" siempre daba falso y el botón
  // mostraba el icono equivocado.
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Hasta montar no se conoce el tema real; se reserva el hueco para que la
  // cabecera no dé un salto cuando aparece el botón.
  if (!mounted) return <div className="size-9" aria-hidden />

  const isDark = resolvedTheme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
    >
      {/* El icono hereda el color del texto: antes era slate-700 fijo y sobre
          el fondo oscuro quedaba invisible. */}
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  )
}
