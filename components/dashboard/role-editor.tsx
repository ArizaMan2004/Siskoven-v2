"use client"

import { useMemo, useState } from "react"
import { m } from "framer-motion"
import { Check, Loader2, ShieldAlert, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ModalHeader, ModalShell } from "@/components/ui/modal-shell"
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  PLANTILLAS,
  type Permission,
  type RolPersonalizado,
  completarDependencias,
  quitarConDependientes,
} from "@/lib/roles"
import { fadeUp } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface Props {
  /** El rol a editar. Sin él, se crea uno nuevo. */
  rol?: RolPersonalizado | null
  onClose: () => void
  onGuardar: (datos: { nombre: string; descripcion: string; permisos: Permission[] }) => Promise<void>
}

/**
 * Editor de un rol: nombre y casillas de permisos.
 *
 * Dos decisiones que hacen que esto se pueda usar sin ser programador:
 *
 * 1. CADA CASILLA EXPLICA QUÉ HACE. "Ajustar existencias" no significa nada por
 *    sí solo; "quien puede cuadrar el stock puede tapar un faltante" sí. Quien
 *    reparte permisos está decidiendo en quién confía, y para eso necesita
 *    saber qué está repartiendo.
 *
 * 2. LAS DEPENDENCIAS SE RESUELVEN SOLAS. Marcar "vender fiado" marca también
 *    "ver clientes", porque sin eso el permiso no hace nada. Y desmarcar "ver
 *    productos" desmarca "editar productos", porque un rol que puede editar lo
 *    que no puede ver es un rol que miente. Lo que se añade o se quita solo se
 *    avisa debajo, para que nadie crea que la pantalla hace lo que le da la gana.
 */
export default function RoleEditor({ rol, onClose, onGuardar }: Props) {
  const editando = Boolean(rol)

  const [nombre, setNombre] = useState(rol?.nombre ?? "")
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? "")
  const [permisos, setPermisos] = useState<Permission[]>(rol?.permisos ?? [])
  const [ultimoAjuste, setUltimoAjuste] = useState<string>("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")

  const seleccionados = useMemo(() => new Set(permisos), [permisos])

  const alternar = (permiso: Permission, marcar: boolean) => {
    if (marcar) {
      const siguiente = completarDependencias([...permisos, permiso])
      const añadidos = siguiente.filter((p) => !seleccionados.has(p) && p !== permiso)

      setPermisos(siguiente)
      setUltimoAjuste(
        añadidos.length > 0
          ? `Se activaron también ${nombresDe(añadidos)}: sin eso, el permiso no serviría de nada.`
          : "",
      )
      return
    }

    const siguiente = quitarConDependientes(permisos, permiso)
    const quitados = permisos.filter((p) => !siguiente.includes(p) && p !== permiso)

    setPermisos(siguiente)
    setUltimoAjuste(
      quitados.length > 0
        ? `Se desactivaron también ${nombresDe(quitados)}, porque dependían de este.`
        : "",
    )
  }

  const alternarGrupo = (grupoPermisos: Permission[], marcar: boolean) => {
    if (marcar) {
      setPermisos(completarDependencias([...permisos, ...grupoPermisos]))
    } else {
      let siguiente = permisos
      for (const permiso of grupoPermisos) siguiente = quitarConDependientes(siguiente, permiso)
      setPermisos(siguiente)
    }
    setUltimoAjuste("")
  }

  const aplicarPlantilla = (plantillaPermisos: Permission[]) => {
    setPermisos([...plantillaPermisos])
    setUltimoAjuste("Puedes quitar o añadir lo que quieras desde aquí.")
  }

  const guardar = async () => {
    if (!nombre.trim()) {
      setError("Ponle un nombre al rol, para poder reconocerlo al asignarlo.")
      return
    }
    if (permisos.length === 0) {
      setError("Un rol sin ningún permiso no deja entrar a ninguna pantalla. Marca al menos uno.")
      return
    }

    setGuardando(true)
    setError("")
    try {
      await onGuardar({ nombre: nombre.trim(), descripcion: descripcion.trim(), permisos })
      onClose()
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo guardar el rol.")
      setGuardando(false)
    }
  }

  return (
    <ModalShell onClose={onClose} size="lg" title={editando ? "Editar rol" : "Nuevo rol"}>
      <ModalHeader
        title={editando ? `Editar ${rol?.nombre}` : "Nuevo rol"}
        description="Marca lo que esta persona podrá hacer. Puedes cambiarlo cuando quieras."
        onClose={onClose}
      />

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="rol-nombre" className="mb-1.5 block text-sm font-medium">
              Nombre del rol
            </label>
            <Input
              id="rol-nombre"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              placeholder="Cajero de tarde"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="rol-descripcion" className="mb-1.5 block text-sm font-medium">
              Para qué es <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <Input
              id="rol-descripcion"
              value={descripcion}
              onChange={(evento) => setDescripcion(evento.target.value)}
              placeholder="Vende y cierra su caja"
            />
          </div>
        </div>

        {/* Las plantillas solo al crear: pulsarlas al editar borraría de golpe
            los ajustes finos que alguien hizo a mano. */}
        {!editando && (
          <div className="bg-muted/40 rounded-lg border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="text-primary size-4" aria-hidden />
              Empezar desde una plantilla
            </p>
            <div className="flex flex-wrap gap-2">
              {PLANTILLAS.map((plantilla) => (
                <Button
                  key={plantilla.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    aplicarPlantilla(plantilla.permisos)
                    if (!nombre.trim()) setNombre(plantilla.nombre)
                  }}
                >
                  {plantilla.nombre}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPermisos([])
                  setUltimoAjuste("")
                }}
              >
                Empezar en blanco
              </Button>
            </div>
          </div>
        )}

        {ultimoAjuste ? (
          <m.p
            key={ultimoAjuste}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="text-muted-foreground bg-muted/50 rounded-md px-3 py-2 text-sm"
          >
            {ultimoAjuste}
          </m.p>
        ) : null}

        <div className="space-y-3">
          {PERMISSION_GROUPS.map((grupo) => {
            const idsGrupo = grupo.permisos.map((p) => p.id)
            const marcadosGrupo = idsGrupo.filter((id) => seleccionados.has(id)).length
            const todos = marcadosGrupo === idsGrupo.length

            return (
              <div key={grupo.id} className="overflow-hidden rounded-lg border">
                <div className="bg-muted/40 flex items-center justify-between gap-3 border-b px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{grupo.label}</p>
                    <p className="text-muted-foreground truncate text-xs">{grupo.descripcion}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {marcadosGrupo}/{idsGrupo.length}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => alternarGrupo(idsGrupo, !todos)}
                    >
                      {todos ? "Ninguno" : "Todos"}
                    </Button>
                  </div>
                </div>

                <ul className="divide-border divide-y">
                  {grupo.permisos.map((permiso) => {
                    const marcado = seleccionados.has(permiso.id)

                    return (
                      <li key={permiso.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors",
                            marcado ? "bg-primary/5" : "hover:bg-muted/40",
                          )}
                        >
                          {/* Casilla dibujada a mano en vez del control nativo:
                              el nativo no se puede teñir de forma consistente
                              entre navegadores, y aquí el estado marcado tiene
                              que leerse de un vistazo en una lista de treinta. */}
                          <span
                            className={cn(
                              "mt-0.5 grid size-5 shrink-0 place-items-center rounded border transition-colors",
                              marcado
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input bg-background",
                            )}
                            aria-hidden
                          >
                            {marcado && <Check className="size-3.5" strokeWidth={3} />}
                          </span>

                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={(evento) => alternar(permiso.id, evento.target.checked)}
                            className="sr-only"
                          />

                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm font-medium">{permiso.label}</span>
                              {permiso.sensible && (
                                <span className="text-warning-foreground dark:text-warning bg-warning/15 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                                  <ShieldAlert className="size-3" aria-hidden />
                                  delicado
                                </span>
                              )}
                            </span>
                            <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">
                              {permiso.ayuda}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <div className="bg-card sticky bottom-0 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm tabular-nums">
            {permisos.length} de {ALL_PERMISSIONS.length} permisos
          </p>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 sm:flex-none">
              Cancelar
            </Button>
            <Button type="button" onClick={guardar} disabled={guardando} className="flex-1 sm:flex-none">
              {guardando && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              {editando ? "Guardar cambios" : "Crear rol"}
            </Button>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

/** "ver clientes y facturar", con la coma y la "y" en su sitio. */
function nombresDe(permisos: Permission[]): string {
  const etiquetas = permisos.map(
    (permiso) =>
      PERMISSION_GROUPS.flatMap((g) => g.permisos).find((p) => p.id === permiso)?.label ?? permiso,
  )

  if (etiquetas.length === 1) return `"${etiquetas[0]}"`

  const ultima = etiquetas.pop()
  return `${etiquetas.map((e) => `"${e}"`).join(", ")} y "${ultima}"`
}

/** Se exporta para que la lista de roles no tenga que importar el grupo entero. */
export { ALL_PERMISSIONS }
