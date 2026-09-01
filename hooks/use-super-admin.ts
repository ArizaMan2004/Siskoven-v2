"use client"

import { useEffect, useState } from "react"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"

/**
 * ¿La persona conectada administra el SaaS?
 *
 * Se comprueba con la existencia de `superAdmins/{uid}`. Ese documento solo se
 * puede crear desde la consola de Firebase: las reglas no permiten escribir en
 * esa colección desde ninguna parte de la aplicación, así que nadie puede
 * ascenderse a sí mismo.
 *
 * Igual que con los roles, esto solo decide qué se dibuja. Quien intente leer
 * las cuentas ajenas sin estar en esa lista se topa con las reglas.
 */
export function useSuperAdmin() {
  const { user, loading: authLoading } = useAuth()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      setIsSuperAdmin(false)
      setLoading(false)
      return
    }

    let cancelled = false

    getDoc(doc(db, "superAdmins", user.uid))
      .then((snap) => {
        if (!cancelled) setIsSuperAdmin(snap.exists())
      })
      .catch(() => {
        // Sin permiso o sin red: se asume que no lo es. Nunca al revés.
        if (!cancelled) setIsSuperAdmin(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  return { isSuperAdmin, loading: loading || authLoading }
}
