// /lib/team.ts
//
// El equipo del negocio: roles creados por el dueño, quién los tiene, y cómo
// entra alguien nuevo.
//
// CÓMO ENTRA UN EMPLEADO (y por qué así)
//
// Crear la cuenta de otra persona desde aquí es imposible con el SDK del
// navegador: `createUserWithEmailAndPassword` inicia sesión con la cuenta
// recién creada, así que el dueño se saldría de la suya en el acto. Hacerlo
// bien pide el Admin SDK, que no puede vivir en el navegador porque su clave
// privada abre la base entera.
//
// Así que se invita. El dueño crea una invitación con el correo y el rol; la
// persona se registra normal con ese mismo correo y, al hacerlo, el registro
// encuentra su invitación y la mete en el negocio con los permisos que le
// tocan. Ventajas de rebote: el empleado elige su propia contraseña (el dueño
// nunca la sabe) y el correo queda verificado por Firebase.
//
// LA DENORMALIZACIÓN DE PERMISOS
//
// `usuarios/{uid}.permisos` guarda una COPIA de la lista del rol. Las reglas de
// seguridad leen el documento del usuario de todas formas, así que consultar
// ahí no cuesta nada; ir a buscar `roles/{id}` costaría una lectura extra en
// cada venta, cada consulta y cada guardado.
//
// El precio es tener que reescribir a los miembros cuando el rol cambia. Es el
// intercambio correcto: repartir permisos pasa una vez al mes, vender pasa cien
// veces al día.

import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore"
import { db } from "./firebase"
import {
  type Permission,
  type RolPersonalizado,
  completarDependencias,
  isValidRole,
  PERMISOS_POR_ROL,
} from "./roles"

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function listarRoles(negocioId: string): Promise<RolPersonalizado[]> {
  const [rolesSnap, usuariosSnap] = await Promise.all([
    getDocs(query(collection(db, "roles"), where("negocioId", "==", negocioId))),
    getDocs(query(collection(db, "usuarios"), where("negocioId", "==", negocioId))),
  ])

  // Cuántos lo tienen: se cuenta aquí en vez de guardarlo en el rol, porque un
  // contador guardado se desincroniza en cuanto una escritura falla a medias.
  const porRol = new Map<string, number>()
  for (const documento of usuariosSnap.docs) {
    const rolId = documento.data().rolId
    if (typeof rolId === "string") porRol.set(rolId, (porRol.get(rolId) ?? 0) + 1)
  }

  return rolesSnap.docs
    .map((documento) => {
      const datos = documento.data()
      return {
        id: documento.id,
        negocioId: datos.negocioId,
        nombre: datos.nombre ?? "Sin nombre",
        descripcion: datos.descripcion ?? "",
        permisos: (datos.permisos ?? []) as Permission[],
        miembros: porRol.get(documento.id) ?? 0,
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

export async function crearRol(params: {
  negocioId: string
  nombre: string
  descripcion?: string
  permisos: Permission[]
  creadoPor: string
}): Promise<string> {
  const referencia = doc(collection(db, "roles"))

  await writeBatch(db)
    .set(referencia, {
      negocioId: params.negocioId,
      nombre: params.nombre.trim(),
      descripcion: params.descripcion?.trim() ?? "",
      // Se completan aquí y no solo en la pantalla: quien llame a esta función
      // desde otro sitio tampoco debería poder guardar un rol incoherente.
      permisos: completarDependencias(params.permisos),
      creadoPor: params.creadoPor,
      creadoEn: Timestamp.now(),
    })
    .commit()

  return referencia.id
}

/**
 * Guarda el rol y arrastra el cambio a quien lo tenga.
 *
 * Las dos cosas van en el mismo lote a propósito. Si se guardara el rol y
 * fallara la propagación, la pantalla enseñaría unos permisos y el servidor
 * aplicaría otros: el dueño creería haberle quitado el acceso a los costos a
 * alguien que los sigue viendo.
 *
 * Devuelve a cuántas personas alcanzó, para poder decírselo.
 */
export async function actualizarRol(params: {
  rolId: string
  nombre: string
  descripcion?: string
  permisos: Permission[]
}): Promise<number> {
  const permisos = completarDependencias(params.permisos)

  const miembros = await getDocs(
    query(collection(db, "usuarios"), where("rolId", "==", params.rolId)),
  )

  const lote = writeBatch(db)

  lote.update(doc(db, "roles", params.rolId), {
    nombre: params.nombre.trim(),
    descripcion: params.descripcion?.trim() ?? "",
    permisos,
    actualizadoEn: Timestamp.now(),
  })

  for (const miembro of miembros.docs) {
    lote.update(miembro.ref, { permisos, rolNombre: params.nombre.trim() })
  }

  await lote.commit()
  return miembros.size
}

/**
 * Borra un rol, solo si no lo tiene nadie.
 *
 * Borrarlo con gente dentro dejaría a esas personas con una lista de permisos
 * huérfana que nadie puede volver a editar: seguirían entrando, y el dueño no
 * tendría ninguna pantalla donde corregirlo.
 */
export async function eliminarRol(rolId: string): Promise<void> {
  const miembros = await getDocs(query(collection(db, "usuarios"), where("rolId", "==", rolId)))

  if (miembros.size > 0) {
    throw new Error(
      `Todavía hay ${miembros.size} ${miembros.size === 1 ? "persona" : "personas"} con este rol. Cámbiales el rol antes de borrarlo.`,
    )
  }

  await deleteDoc(doc(db, "roles", rolId))
}

/**
 * Vuelve a copiar los permisos del rol a sus miembros.
 *
 * Red de seguridad para cuando el lote de `actualizarRol` se quedó a medias:
 * sin conexión, sin cuota, o con la pestaña cerrada en mitad de la escritura.
 */
export async function sincronizarRol(rolId: string): Promise<number> {
  const rol = await getDoc(doc(db, "roles", rolId))
  if (!rol.exists()) throw new Error("Ese rol ya no existe.")

  const permisos = (rol.data().permisos ?? []) as Permission[]
  const nombre = rol.data().nombre ?? ""

  const miembros = await getDocs(query(collection(db, "usuarios"), where("rolId", "==", rolId)))
  if (miembros.size === 0) return 0

  const lote = writeBatch(db)
  for (const miembro of miembros.docs) {
    lote.update(miembro.ref, { permisos, rolNombre: nombre })
  }
  await lote.commit()

  return miembros.size
}

// ---------------------------------------------------------------------------
// Miembros
// ---------------------------------------------------------------------------

export interface Miembro {
  uid: string
  email: string
  nombre?: string
  /** "owner" para el dueño; "staff" para todos los demás. */
  role: string
  rolId?: string | null
  rolNombre?: string
  permisos: Permission[]
  activo: boolean
  ultimoAcceso?: Timestamp | null
}

export async function listarMiembros(negocioId: string): Promise<Miembro[]> {
  const snapshot = await getDocs(
    query(collection(db, "usuarios"), where("negocioId", "==", negocioId)),
  )

  return snapshot.docs
    .map((documento) => {
      const datos = documento.data()

      // Un usuario viejo puede no tener `permisos`: se resuelven desde su rol
      // heredado para que la pantalla no lo enseñe como si no pudiera nada.
      const permisos: Permission[] = Array.isArray(datos.permisos)
        ? (datos.permisos as Permission[])
        : isValidRole(datos.role)
          ? PERMISOS_POR_ROL[datos.role]
          : []

      return {
        uid: documento.id,
        email: datos.email ?? "",
        nombre: datos.nombre ?? datos.displayName ?? "",
        role: datos.role ?? "staff",
        rolId: datos.rolId ?? null,
        rolNombre: datos.rolNombre ?? "",
        permisos,
        activo: datos.isActive !== false,
        ultimoAcceso: datos.ultimoAcceso ?? null,
      }
    })
    .sort((a, b) => {
      // El dueño primero, después por nombre. Es el orden en que la gente
      // busca: "¿quién manda aquí?" antes que "¿dónde está Yorbis?".
      if (a.role === "owner" && b.role !== "owner") return -1
      if (b.role === "owner" && a.role !== "owner") return 1
      return (a.nombre || a.email).localeCompare(b.nombre || b.email, "es")
    })
}

/** Le cambia el rol a alguien, copiando los permisos al mismo tiempo. */
export async function asignarRol(params: {
  uid: string
  rolId: string
  rolNombre: string
  permisos: Permission[]
}): Promise<void> {
  await updateDoc(doc(db, "usuarios", params.uid), {
    rolId: params.rolId,
    rolNombre: params.rolNombre,
    permisos: completarDependencias(params.permisos),
    role: "staff",
  })
}

/**
 * Suspende o reactiva a alguien.
 *
 * No se borra la cuenta: sus ventas, sus turnos y sus cierres tienen que seguir
 * apuntando a una persona con nombre. Un historial que dice "usuario eliminado"
 * no sirve para averiguar quién cuadró mal una caja hace tres meses.
 */
export async function cambiarAcceso(uid: string, activo: boolean): Promise<void> {
  await updateDoc(doc(db, "usuarios", uid), { isActive: activo })
}

// ---------------------------------------------------------------------------
// Invitaciones
// ---------------------------------------------------------------------------

export interface Invitacion {
  id: string
  negocioId: string
  negocioNombre: string
  email: string
  rolId: string
  rolNombre: string
  permisos: Permission[]
  estado: "pendiente" | "aceptada" | "cancelada"
  creadaEn: Timestamp
}

/** El correo es la llave de la invitación, así que se normaliza siempre igual. */
function normalizarEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function invitar(params: {
  negocioId: string
  negocioNombre: string
  email: string
  rolId: string
  rolNombre: string
  permisos: Permission[]
  creadoPor: string
}): Promise<string> {
  const email = normalizarEmail(params.email)

  // Dos invitaciones al mismo correo dejarían al registro eligiendo entre dos
  // roles distintos sin criterio. La segunda reemplaza a la primera.
  const previas = await getDocs(
    query(
      collection(db, "invitaciones"),
      where("negocioId", "==", params.negocioId),
      where("email", "==", email),
      where("estado", "==", "pendiente"),
    ),
  )

  const referencia = doc(collection(db, "invitaciones"))
  const lote = writeBatch(db)

  for (const previa of previas.docs) lote.delete(previa.ref)

  lote.set(referencia, {
    negocioId: params.negocioId,
    negocioNombre: params.negocioNombre,
    email,
    rolId: params.rolId,
    rolNombre: params.rolNombre,
    permisos: completarDependencias(params.permisos),
    estado: "pendiente",
    creadoPor: params.creadoPor,
    creadaEn: Timestamp.now(),
  })

  await lote.commit()
  return referencia.id
}

export async function listarInvitaciones(negocioId: string): Promise<Invitacion[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "invitaciones"),
      where("negocioId", "==", negocioId),
      where("estado", "==", "pendiente"),
    ),
  )

  return snapshot.docs.map(
    (documento) => ({ id: documento.id, ...documento.data() }) as Invitacion,
  )
}

export async function cancelarInvitacion(invitacionId: string): Promise<void> {
  await deleteDoc(doc(db, "invitaciones", invitacionId))
}

/**
 * Busca la invitación pendiente de un correo. La usa el registro.
 *
 * Devuelve null sin ruido cuando no hay ninguna: registrarse sin invitación es
 * el caso normal, no un error.
 */
export async function buscarInvitacion(email: string): Promise<Invitacion | null> {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, "invitaciones"),
        where("email", "==", normalizarEmail(email)),
        where("estado", "==", "pendiente"),
      ),
    )

    const primera = snapshot.docs[0]
    return primera ? ({ id: primera.id, ...primera.data() } as Invitacion) : null
  } catch (error) {
    console.warn("No se pudo consultar la invitación:", error)
    return null
  }
}

/** Marca la invitación como usada, ya con la cuenta creada. */
export async function marcarInvitacionAceptada(invitacionId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "invitaciones", invitacionId), {
    estado: "aceptada",
    aceptadaPor: uid,
    aceptadaEn: Timestamp.now(),
  })
}
