"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import { type User, onAuthStateChanged, signOut } from "firebase/auth"
import { auth, db } from "./firebase"
import { doc, getDoc } from "firebase/firestore"
import {
  FALLBACK_ROLE,
  type Permission,
  PERMISOS_POR_ROL,
  type Role,
  can,
  isValidRole,
} from "./roles"
import { accountExpiry, hasAccess } from "./subscriptions"

interface UserData {
  email: string
  businessName: string
  plan: "trial" | "complete"
  /**
   * Fin de la prueba. Es un Timestamp de Firestore, no un Date de JavaScript.
   * El campo se llama `trialEndsAt` (así lo escribe el registro); antes aquí se
   * leía `trialEndDate`, que no existe, así que la prueba no caducaba nunca.
   */
  trialEndsAt?: { toDate: () => Date } | null
  isActive: boolean
  exclusiveCode?: string
  /** Negocio al que pertenece. Varias personas comparten el mismo. */
  negocioId?: string
  /**
   * Rol heredado. Sigue existiendo por dos motivos: "owner" no es un rol
   * editable sino una condición del sistema, y las cuentas creadas antes de que
   * los roles fueran documentos no tienen otra cosa.
   */
  role?: Role
  /** Rol creado por el dueño, cuando lo hay. */
  rolId?: string | null
  rolNombre?: string
  /**
   * Copia de los permisos del rol. Es lo que consultan tanto la interfaz como
   * las reglas de seguridad, para no pagar una lectura extra por operación.
   */
  permisos?: Permission[]
}

interface AuthContextType {
  user: User | null
  userData: UserData | null
  loading: boolean
  logout: () => Promise<void>
  isTrialExpired: boolean
  /** Rol de la persona conectada. Null mientras carga. */
  role: Role | null
  /** Nombre del rol tal como lo escribió el dueño, para enseñarlo. */
  rolNombre: string | null
  /** Lo que puede hacer, ya resuelto. Vacío mientras carga. */
  permisos: Permission[]
  /** Negocio activo. Todas las consultas se filtran por él. */
  negocioId: string | null
  /** Cuándo caduca el acceso, venga de la prueba o de la suscripción. */
  expiresAt: Date | null
  /**
   * Atajo para condicionar la interfaz: `if (!allows("costs.view")) return null`.
   * Ojo: esto oculta, no protege. Lo que protege son las reglas de Firestore.
   */
  allows: (permission: Permission) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isTrialExpired, setIsTrialExpired] = useState(false)
  const [role, setRole] = useState<Role | null>(null)
  const [rolNombre, setRolNombre] = useState<string | null>(null)
  const [permisos, setPermisos] = useState<Permission[]>([])
  const [negocioId, setNegocioId] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)

      if (currentUser) {
        try {
          const userDocRef = doc(db, "usuarios", currentUser.uid)
          const userDocSnap = await getDoc(userDocRef)

          if (userDocSnap.exists()) {
            // Dos vistas del mismo documento: `raw` sin tipar para los campos
            // de suscripción, que los escribe el panel de administración y no
            // forman parte de UserData, y `data` con el tipo de la aplicación.
            const raw = userDocSnap.data()
            const data = raw as UserData
            setUserData(data)

            // Si el documento no trae rol, se asume el más restrictivo: ante la
            // duda, la persona ve de menos y nunca de más.
            const rolResuelto = isValidRole(data.role) ? data.role : FALLBACK_ROLE
            setRole(rolResuelto)
            setRolNombre(data.rolNombre || null)

            // El dueño no se consulta en ninguna lista: lo puede todo. Para los
            // demás manda la copia guardada en su documento, que es la misma que
            // leen las reglas de seguridad. Un usuario anterior a los roles por
            // documento no la tiene, y entonces se cae a la plantilla de su rol
            // heredado: sin eso se quedaría sin poder hacer nada de un día para
            // otro, sin que nadie le hubiera quitado ningún permiso.
            setPermisos(
              rolResuelto === "owner"
                ? PERMISOS_POR_ROL.owner
                : Array.isArray(data.permisos) && data.permisos.length > 0
                  ? data.permisos
                  : PERMISOS_POR_ROL[rolResuelto],
            )
            // Sin negocio explícito, el negocio es la propia cuenta: así las
            // cuentas de un solo dueño siguen funcionando sin configurar nada.
            setNegocioId(data.negocioId ?? currentUser.uid)

            // El acceso depende del vencimiento real: si pagó, manda
            // `subscriptionEndsAt`; si no, `trialEndsAt`. Una cuenta
            // desactivada a mano tampoco entra.
            setIsTrialExpired(!hasAccess(raw))
            setExpiresAt(accountExpiry(raw))
          }
        } catch (error) {
          console.error("Error fetching user data:", error)
        }
      } else {
        setUserData(null)
        setIsTrialExpired(false)
        setRole(null)
        setRolNombre(null)
        setPermisos([])
        setNegocioId(null)
        setExpiresAt(null)
      }

      setLoading(false)
    })

    return unsubscribe
  }, [])

  const logout = async () => {
    await signOut(auth)
  }

  // Se consulta la lista, no el rol: el rol ya solo dice si es el dueño.
  const allows = (permission: Permission) => can(permisos, permission)

  return (
    <AuthContext.Provider
      value={{
        user,
        userData,
        loading,
        logout,
        isTrialExpired,
        role,
        rolNombre,
        permisos,
        negocioId,
        expiresAt,
        allows,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}
