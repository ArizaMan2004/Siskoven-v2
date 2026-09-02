"use client"

import { useCallback, useEffect, useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import {
  Crown,
  Loader2,
  Mail,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { StatCard } from "@/components/ui/stat-card"
import { EmptyState, PageHeader } from "@/components/ui/page-header"
import { ModalHeader, ModalShell } from "@/components/ui/modal-shell"
import RoleEditor from "./role-editor"
import { reportFirestoreError } from "@/lib/sync-status"
import { listItem, staggerContainer } from "@/lib/motion"
import { type Permission, type RolPersonalizado } from "@/lib/roles"
import {
  type Invitacion,
  type Miembro,
  actualizarRol,
  asignarRol,
  cambiarAcceso,
  cancelarInvitacion,
  crearRol,
  eliminarRol,
  invitar,
  listarInvitaciones,
  listarMiembros,
  listarRoles,
} from "@/lib/team"

const SELECT_CLASS =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

type Pestaña = "personas" | "roles"

/**
 * Equipo: quién entra al sistema y qué puede hacer.
 *
 * Dos pestañas porque son dos preguntas distintas y se hacen en momentos
 * distintos: "¿a quién le doy acceso?" (todos los meses) y "¿qué puede hacer un
 * cajero?" (una vez, y luego casi nunca).
 */
export default function TeamView() {
  const { user, negocioId, userData } = useAuth()

  const [pestaña, setPestaña] = useState<Pestaña>("personas")
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [roles, setRoles] = useState<RolPersonalizado[]>([])
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([])
  const [loading, setLoading] = useState(true)

  const [editandoRol, setEditandoRol] = useState<RolPersonalizado | null>(null)
  const [creandoRol, setCreandoRol] = useState(false)
  const [invitando, setInvitando] = useState(false)
  const [cambiandoRolDe, setCambiandoRolDe] = useState<Miembro | null>(null)
  const [aviso, setAviso] = useState("")

  const cargar = useCallback(async () => {
    if (!negocioId) return
    setLoading(true)

    try {
      const [nuevosMiembros, nuevosRoles, nuevasInvitaciones] = await Promise.all([
        listarMiembros(negocioId),
        listarRoles(negocioId),
        listarInvitaciones(negocioId),
      ])

      setMiembros(nuevosMiembros)
      setRoles(nuevosRoles)
      setInvitaciones(nuevasInvitaciones)
    } catch (error) {
      reportFirestoreError(error)
    } finally {
      setLoading(false)
    }
  }, [negocioId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const guardarRol = async (datos: {
    nombre: string
    descripcion: string
    permisos: Permission[]
  }) => {
    if (!negocioId || !user) return

    if (editandoRol) {
      const alcanzados = await actualizarRol({ rolId: editandoRol.id, ...datos })
      setAviso(
        alcanzados > 0
          ? `Rol guardado. Los permisos ya cambiaron para ${alcanzados} ${alcanzados === 1 ? "persona" : "personas"}.`
          : "Rol guardado.",
      )
    } else {
      await crearRol({ negocioId, ...datos, creadoPor: user.uid })
      setAviso(`Rol "${datos.nombre}" creado. Ya se lo puedes asignar a alguien.`)
    }

    await cargar()
  }

  const borrarRol = async (rol: RolPersonalizado) => {
    try {
      await eliminarRol(rol.id)
      setAviso(`Rol "${rol.nombre}" eliminado.`)
      await cargar()
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "No se pudo eliminar el rol.")
    }
  }

  const alternarAcceso = async (miembro: Miembro) => {
    try {
      await cambiarAcceso(miembro.uid, !miembro.activo)
      setMiembros((previos) =>
        previos.map((m) => (m.uid === miembro.uid ? { ...m, activo: !m.activo } : m)),
      )
    } catch (error) {
      reportFirestoreError(error)
    }
  }

  const activos = miembros.filter((miembro) => miembro.activo).length

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" aria-hidden />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Equipo"
        description="Quién entra al sistema y qué puede hacer cada uno"
        actions={
          pestaña === "personas" ? (
            <Button onClick={() => setInvitando(true)} className="gap-2">
              <UserPlus className="size-4" aria-hidden />
              Invitar
            </Button>
          ) : (
            <Button onClick={() => setCreandoRol(true)} className="gap-2">
              <Plus className="size-4" aria-hidden />
              Nuevo rol
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Personas con acceso" value={String(activos)} icon={Users} />
        <StatCard label="Roles creados" value={String(roles.length)} icon={ShieldCheck} />
        <StatCard
          label="Invitaciones sin usar"
          value={String(invitaciones.length)}
          hint={invitaciones.length > 0 ? "Esperando a que se registren" : undefined}
          icon={Mail}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {aviso ? (
        <m.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary/10 text-primary flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm"
        >
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso("")} className="shrink-0 font-medium">
            Cerrar
          </button>
        </m.div>
      ) : null}

      <div className="bg-muted inline-flex w-full rounded-lg p-1 sm:w-auto">
        {(
          [
            { id: "personas" as const, label: "Personas" },
            { id: "roles" as const, label: "Roles y permisos" },
          ]
        ).map((opcion) => (
          <button
            key={opcion.id}
            type="button"
            onClick={() => setPestaña(opcion.id)}
            className={`relative flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
              pestaña === opcion.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {pestaña === opcion.id && (
              <m.span
                layoutId="tab-equipo"
                className="bg-background absolute inset-0 rounded-md shadow-sm"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{opcion.label}</span>
          </button>
        ))}
      </div>

      {pestaña === "personas" ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <m.ul
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="divide-border divide-y"
              >
                {miembros.map((miembro, indice) => {
                  const esDueño = miembro.role === "owner"
                  const esYo = miembro.uid === user?.uid

                  return (
                    <m.li
                      key={miembro.uid}
                      custom={indice}
                      variants={listItem}
                      className="flex flex-wrap items-center gap-3 p-4"
                    >
                      <span
                        className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                          esDueño ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        }`}
                        aria-hidden
                      >
                        {esDueño ? (
                          <Crown className="size-5" />
                        ) : (
                          (miembro.nombre || miembro.email || "?").charAt(0).toUpperCase()
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          <span className="truncate">{miembro.nombre || miembro.email}</span>
                          {esYo && (
                            <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-[11px]">
                              tú
                            </span>
                          )}
                          {!miembro.activo && (
                            <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-[11px] font-medium">
                              sin acceso
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground truncate text-sm">
                          {esDueño
                            ? "Dueño · lo puede todo"
                            : miembro.rolNombre ||
                              `${miembro.permisos.length} permisos, sin rol asignado`}
                        </p>
                      </div>

                      {/* El dueño no se toca: quitarse el acceso a uno mismo deja
                          el negocio sin nadie que pueda devolvérselo. */}
                      {!esDueño && (
                        <div className="flex shrink-0 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCambiandoRolDe(miembro)}
                          >
                            Cambiar rol
                          </Button>
                          <Button
                            size="sm"
                            variant={miembro.activo ? "ghost" : "default"}
                            onClick={() => alternarAcceso(miembro)}
                          >
                            {miembro.activo ? "Suspender" : "Reactivar"}
                          </Button>
                        </div>
                      )}
                    </m.li>
                  )
                })}
              </m.ul>
            </CardContent>
          </Card>

          {invitaciones.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="mb-1 font-semibold">Invitaciones enviadas</p>
                <p className="text-muted-foreground mb-4 text-sm">
                  Se activan solas cuando la persona se registre con ese correo. Dile que entre a
                  Siskoven y cree su cuenta normal.
                </p>

                <ul className="divide-border divide-y">
                  {invitaciones.map((invitacion) => (
                    <li
                      key={invitacion.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{invitacion.email}</p>
                        <p className="text-muted-foreground text-xs">
                          Entrará como {invitacion.rolNombre}
                        </p>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground shrink-0"
                        onClick={async () => {
                          await cancelarInvitacion(invitacion.id)
                          await cargar()
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        <span className="sr-only">Cancelar invitación</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {roles.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  icon={ShieldCheck}
                  title="Todavía no has creado ningún rol"
                  description="Un rol es un conjunto de permisos con nombre: lo creas una vez y se lo pones a quien haga ese trabajo. Puedes empezar desde la plantilla de cajero o de encargado y quitarle o ponerle lo que quieras."
                  action={
                    <Button onClick={() => setCreandoRol(true)} className="gap-2">
                      <Plus className="size-4" aria-hidden />
                      Crear el primero
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <m.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {roles.map((rol, indice) => (
                <m.div
                  key={rol.id}
                  custom={indice}
                  variants={listItem}
                  className="bg-card flex flex-col rounded-xl border p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{rol.nombre}</p>
                      {rol.descripcion ? (
                        <p className="text-muted-foreground mt-0.5 text-sm">{rol.descripcion}</p>
                      ) : null}
                    </div>
                    <ShieldCheck className="text-muted-foreground size-5 shrink-0" aria-hidden />
                  </div>

                  <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span className="tabular-nums">{rol.permisos.length} permisos</span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <UserRound className="size-3.5" aria-hidden />
                      {rol.miembros ?? 0}
                    </span>
                  </div>

                  <div className="mt-4 flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1.5"
                      onClick={() => setEditandoRol(rol)}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => borrarRol(rol)}
                      aria-label={`Eliminar el rol ${rol.nombre}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </m.div>
              ))}
            </m.div>
          )}
        </div>
      )}

      <AnimatePresence>
        {(creandoRol || editandoRol) && (
          <RoleEditor
            rol={editandoRol}
            onClose={() => {
              setCreandoRol(false)
              setEditandoRol(null)
            }}
            onGuardar={guardarRol}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {invitando && (
          <DialogoInvitar
            roles={roles}
            negocioNombre={userData?.businessName ?? "tu negocio"}
            onClose={() => setInvitando(false)}
            onInvitado={async (mensaje) => {
              setAviso(mensaje)
              await cargar()
            }}
            onCrearRol={() => {
              setInvitando(false)
              setPestaña("roles")
              setCreandoRol(true)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cambiandoRolDe && (
          <DialogoCambiarRol
            miembro={cambiandoRolDe}
            roles={roles}
            onClose={() => setCambiandoRolDe(null)}
            onAsignado={async (mensaje) => {
              setAviso(mensaje)
              await cargar()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------

function DialogoInvitar({
  roles,
  negocioNombre,
  onClose,
  onInvitado,
  onCrearRol,
}: {
  roles: RolPersonalizado[]
  negocioNombre: string
  onClose: () => void
  onInvitado: (mensaje: string) => Promise<void>
  onCrearRol: () => void
}) {
  const { user, negocioId } = useAuth()
  const [email, setEmail] = useState("")
  const [rolId, setRolId] = useState(roles[0]?.id ?? "")
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState("")

  const enviar = async () => {
    if (!user || !negocioId) return

    const rol = roles.find((r) => r.id === rolId)
    if (!rol) {
      setError("Elige con qué rol va a entrar.")
      return
    }
    if (!email.includes("@")) {
      setError("Ese correo no parece válido.")
      return
    }

    setTrabajando(true)
    setError("")
    try {
      await invitar({
        negocioId,
        negocioNombre,
        email,
        rolId: rol.id,
        rolNombre: rol.nombre,
        permisos: rol.permisos,
        creadoPor: user.uid,
      })

      await onInvitado(
        `Listo. Dile a ${email.trim()} que entre a Siskoven y cree su cuenta con ese mismo correo: entrará directo a tu negocio como ${rol.nombre}.`,
      )
      onClose()
    } catch (fallo) {
      reportFirestoreError(fallo)
      setError("No se pudo crear la invitación.")
      setTrabajando(false)
    }
  }

  return (
    <ModalShell onClose={onClose} title="Invitar a alguien">
      <ModalHeader
        title="Invitar a alguien"
        description="Se une con su propia contraseña; tú nunca la ves."
        onClose={onClose}
      />

      {roles.length === 0 ? (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Antes de invitar a nadie hace falta un rol, que es lo que decide qué podrá hacer esa
            persona cuando entre.
          </p>
          <Button onClick={onCrearRol} className="w-full gap-2">
            <Plus className="size-4" aria-hidden />
            Crear un rol
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="invitar-email" className="mb-1.5 block text-sm font-medium">
              Correo de la persona
            </label>
            <Input
              id="invitar-email"
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              placeholder="yorbis@ejemplo.com"
              autoFocus
            />
            <p className="text-muted-foreground mt-1.5 text-xs">
              Tiene que registrarse con este correo exacto para que la invitación lo reconozca.
            </p>
          </div>

          <div>
            <label htmlFor="invitar-rol" className="mb-1.5 block text-sm font-medium">
              Entrará como
            </label>
            <select
              id="invitar-rol"
              value={rolId}
              onChange={(evento) => setRolId(evento.target.value)}
              className={SELECT_CLASS}
            >
              {roles.map((rol) => (
                <option key={rol.id} value={rol.id}>
                  {rol.nombre} ({rol.permisos.length} permisos)
                </option>
              ))}
            </select>
          </div>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={trabajando} className="flex-1">
              {trabajando && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              Invitar
            </Button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------

function DialogoCambiarRol({
  miembro,
  roles,
  onClose,
  onAsignado,
}: {
  miembro: Miembro
  roles: RolPersonalizado[]
  onClose: () => void
  onAsignado: (mensaje: string) => Promise<void>
}) {
  const [rolId, setRolId] = useState(miembro.rolId ?? roles[0]?.id ?? "")
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState("")

  const guardar = async () => {
    const rol = roles.find((r) => r.id === rolId)
    if (!rol) {
      setError("Elige un rol.")
      return
    }

    setTrabajando(true)
    try {
      await asignarRol({
        uid: miembro.uid,
        rolId: rol.id,
        rolNombre: rol.nombre,
        permisos: rol.permisos,
      })

      await onAsignado(
        `${miembro.nombre || miembro.email} ahora entra como ${rol.nombre}. El cambio aplica la próxima vez que abra el sistema.`,
      )
      onClose()
    } catch (fallo) {
      reportFirestoreError(fallo)
      setError("No se pudo cambiar el rol.")
      setTrabajando(false)
    }
  }

  return (
    <ModalShell onClose={onClose} title="Cambiar rol">
      <ModalHeader
        title="Cambiar rol"
        description={miembro.nombre || miembro.email}
        onClose={onClose}
      />

      <div className="space-y-4">
        <div>
          <label htmlFor="cambiar-rol" className="mb-1.5 block text-sm font-medium">
            Nuevo rol
          </label>
          <select
            id="cambiar-rol"
            value={rolId}
            onChange={(evento) => setRolId(evento.target.value)}
            className={SELECT_CLASS}
          >
            {roles.map((rol) => (
              <option key={rol.id} value={rol.id}>
                {rol.nombre} ({rol.permisos.length} permisos)
              </option>
            ))}
          </select>
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={trabajando || roles.length === 0} className="flex-1">
            {trabajando && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Guardar
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
