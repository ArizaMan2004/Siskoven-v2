// tests/firestore-rules.test.mjs
//
// Pruebas de las reglas de seguridad contra el emulador de Firestore.
//
// Cada caso comprueba UNA afirmación concreta de las que sostiene el sistema.
// Si una regla se relaja por accidente en el futuro, aquí se cae algo.
//
// Correr con:  npm run test:rules

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing"
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from "firebase/firestore"

const PROJECT_ID = "siskoven-rules-test"

// Dos negocios distintos, para poder comprobar que no se ven entre sí.
const NEGOCIO_A = "negocio-a"
const NEGOCIO_B = "negocio-b"

const DUENO_A = "dueno-a"
const CAJERO_A = "cajero-a"
const DUENO_B = "dueno-b"
const SUPER = "super-admin"

let testEnv

/** Contexto autenticado con el correo ya verificado, que es lo que exigen las reglas. */
function ctx(uid) {
  return testEnv.authenticatedContext(uid, { email_verified: true }).firestore()
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  })

  // Datos base, sembrados saltándose las reglas.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const dentroDeUnAno = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

    await setDoc(doc(db, "usuarios", DUENO_A), {
      email: "dueno@a.com",
      businessName: "Bodega A",
      negocioId: NEGOCIO_A,
      role: "owner",
      plan: "mensual",
      isActive: true,
      subscriptionEndsAt: dentroDeUnAno,
    })

    await setDoc(doc(db, "usuarios", CAJERO_A), {
      email: "cajero@a.com",
      businessName: "Bodega A",
      negocioId: NEGOCIO_A,
      role: "cashier",
      plan: "mensual",
      isActive: true,
      subscriptionEndsAt: dentroDeUnAno,
    })

    await setDoc(doc(db, "usuarios", DUENO_B), {
      email: "dueno@b.com",
      businessName: "Bodega B",
      negocioId: NEGOCIO_B,
      role: "owner",
      plan: "mensual",
      isActive: true,
      subscriptionEndsAt: dentroDeUnAno,
    })

    await setDoc(doc(db, "superAdmins", SUPER), { creado: new Date() })
    await setDoc(doc(db, "usuarios", SUPER), {
      email: "super@siskoven.com",
      negocioId: "siskoven",
      role: "owner",
      plan: "anual",
      isActive: true,
      subscriptionEndsAt: dentroDeUnAno,
    })

    // El producto público NO lleva costo ni margen: solo lo que hace falta
    // para venderlo.
    await setDoc(doc(db, "productos", "producto-a"), {
      negocioId: NEGOCIO_A,
      name: "Harina",
      quantity: 50,
      precioUsd: 1.6,
      precioDivisaUsd: 1.5,
    })

    await setDoc(doc(db, "productos_costos", "producto-a"), {
      negocioId: NEGOCIO_A,
      productoId: "producto-a",
      costUsd: 1.2,
      profit: 25,
    })

    await setDoc(doc(db, "productos", "producto-b"), {
      negocioId: NEGOCIO_B,
      name: "Café",
      quantity: 10,
      precioUsd: 4.3,
    })

    await setDoc(doc(db, "ventas", "venta-cajero"), {
      negocioId: NEGOCIO_A,
      cajeroUid: CAJERO_A,
      totalUsd: 10,
      totalBs: 7950,
      items: [],
      anulada: false,
      createdAt: new Date(),
    })

    await setDoc(doc(db, "ventas", "venta-dueno"), {
      negocioId: NEGOCIO_A,
      cajeroUid: DUENO_A,
      totalUsd: 20,
      totalBs: 15900,
      items: [],
      anulada: false,
      createdAt: new Date(),
    })

    await setDoc(doc(db, "admin_codes", "CODIGO-SECRETO"), { used: false })

    await setDoc(doc(db, "contadores", `${NEGOCIO_A}__nota_entrega`), {
      negocioId: NEGOCIO_A,
      tipo: "nota_entrega",
      ultimo: 5,
      serie: null,
    })
  })
})

after(async () => {
  await testEnv?.cleanup()
})

// ---------------------------------------------------------------------------

describe("Aislamiento entre negocios", () => {
  it("el dueño de A lee sus propios productos", async () => {
    await assertSucceeds(getDoc(doc(ctx(DUENO_A), "productos", "producto-a")))
  })

  it("el dueño de A NO puede leer los productos de B", async () => {
    await assertFails(getDoc(doc(ctx(DUENO_A), "productos", "producto-b")))
  })

  it("el dueño de A NO puede mudar un producto al negocio de B", async () => {
    await assertFails(
      updateDoc(doc(ctx(DUENO_A), "productos", "producto-a"), { negocioId: NEGOCIO_B }),
    )
  })

  it("el dueño de A NO puede leer las ventas de B", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "ventas", "venta-b"), {
        negocioId: NEGOCIO_B,
        cajeroUid: DUENO_B,
        totalUsd: 5,
        anulada: false,
        createdAt: new Date(),
      })
    })
    await assertFails(getDoc(doc(ctx(DUENO_A), "ventas", "venta-b")))
  })
})

describe("El cajero y el inventario", () => {
  it("el cajero PUEDE leer el catálogo", async () => {
    await assertSucceeds(getDoc(doc(ctx(CAJERO_A), "productos", "producto-a")))
  })

  it("el cajero NO puede crear productos", async () => {
    await assertFails(
      setDoc(doc(ctx(CAJERO_A), "productos", "nuevo"), {
        negocioId: NEGOCIO_A,
        name: "Inventado",
        costUsd: 1,
        quantity: 1,
        profit: 10,
      }),
    )
  })

  it("el cajero NO puede ajustar el stock", async () => {
    await assertFails(updateDoc(doc(ctx(CAJERO_A), "productos", "producto-a"), { quantity: 999 }))
  })

  it("el cajero NO puede borrar productos", async () => {
    await assertFails(deleteDoc(doc(ctx(CAJERO_A), "productos", "producto-a")))
  })

  it("el encargado o dueño SÍ puede ajustar el stock", async () => {
    await assertSucceeds(updateDoc(doc(ctx(DUENO_A), "productos", "producto-a"), { quantity: 45 }))
  })
})

describe("Las ventas no se borran ni se reescriben", () => {
  it("nadie puede borrar una venta, ni el dueño", async () => {
    await assertFails(deleteDoc(doc(ctx(DUENO_A), "ventas", "venta-cajero")))
  })

  it("no se puede cambiar el total de una venta", async () => {
    await assertFails(updateDoc(doc(ctx(DUENO_A), "ventas", "venta-cajero"), { totalUsd: 1 }))
  })

  it("anular exige motivo", async () => {
    await assertFails(
      updateDoc(doc(ctx(CAJERO_A), "ventas", "venta-cajero"), {
        anulada: true,
        anuladaPor: CAJERO_A,
        motivoAnulacion: "",
      }),
    )
  })

  it("el cajero SÍ puede anular con motivo", async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(CAJERO_A), "ventas", "venta-cajero"), {
        anulada: true,
        anuladaPor: CAJERO_A,
        motivoAnulacion: "El cliente devolvió la mercancía",
      }),
    )
  })

  it("una venta ya anulada no se puede volver a tocar", async () => {
    await assertFails(
      updateDoc(doc(ctx(CAJERO_A), "ventas", "venta-cajero"), {
        anulada: true,
        anuladaPor: CAJERO_A,
        motivoAnulacion: "Otra vez",
      }),
    )
  })

  it("el cajero NO puede leer las ventas de otro cajero", async () => {
    await assertFails(getDoc(doc(ctx(CAJERO_A), "ventas", "venta-dueno")))
  })

  it("el dueño SÍ puede leer las ventas de todos", async () => {
    await assertSucceeds(getDoc(doc(ctx(DUENO_A), "ventas", "venta-dueno")))
  })
})

describe("Nadie se asciende ni se regala el plan", () => {
  it("un usuario NO puede cambiarse el rol", async () => {
    await assertFails(updateDoc(doc(ctx(CAJERO_A), "usuarios", CAJERO_A), { role: "owner" }))
  })

  it("un usuario NO puede cambiarse el plan", async () => {
    await assertFails(updateDoc(doc(ctx(CAJERO_A), "usuarios", CAJERO_A), { plan: "anual" }))
  })

  it("un usuario NO puede alargarse la fecha de vencimiento", async () => {
    await assertFails(
      updateDoc(doc(ctx(CAJERO_A), "usuarios", CAJERO_A), {
        subscriptionEndsAt: new Date(Date.now() + 999 * 24 * 60 * 60 * 1000),
      }),
    )
  })

  it("un usuario SÍ puede cambiar sus propios ajustes", async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(CAJERO_A), "usuarios", CAJERO_A), {
        pricing: { divisaDiscountPercent: 5 },
      }),
    )
  })

  it("al registrarse no se puede nacer con plan pagado", async () => {
    await assertFails(
      setDoc(doc(ctx("nuevo-usuario"), "usuarios", "nuevo-usuario"), {
        email: "nuevo@x.com",
        role: "owner",
        negocioId: "nuevo-usuario",
        plan: "anual",
        isActive: true,
      }),
    )
  })

  it("al registrarse no se puede entrar al negocio de otro", async () => {
    await assertFails(
      setDoc(doc(ctx("intruso"), "usuarios", "intruso"), {
        email: "intruso@x.com",
        role: "owner",
        negocioId: NEGOCIO_A,
        plan: "trial",
        isActive: true,
      }),
    )
  })

  it("un registro normal SÍ funciona", async () => {
    await assertSucceeds(
      setDoc(doc(ctx("legitimo"), "usuarios", "legitimo"), {
        email: "legitimo@x.com",
        role: "owner",
        negocioId: "legitimo",
        plan: "trial",
        isActive: true,
      }),
    )
  })
})

describe("Los códigos de registro están cerrados", () => {
  it("nadie puede leer un código", async () => {
    await assertFails(getDoc(doc(ctx(DUENO_A), "admin_codes", "CODIGO-SECRETO")))
  })

  it("nadie puede listar los códigos", async () => {
    await assertFails(getDocs(collection(ctx(DUENO_A), "admin_codes")))
  })

  it("nadie puede marcar un código como usado", async () => {
    await assertFails(setDoc(doc(ctx(DUENO_A), "admin_codes", "CODIGO-SECRETO"), { used: true }))
  })
})

describe("El correlativo solo sube, y de uno en uno", () => {
  const counterPath = `${NEGOCIO_A}__nota_entrega`

  it("no se puede retroceder el contador para reutilizar un número", async () => {
    await assertFails(
      setDoc(doc(ctx(DUENO_A), "contadores", counterPath), {
        negocioId: NEGOCIO_A,
        tipo: "nota_entrega",
        ultimo: 2,
      }),
    )
  })

  it("no se puede saltar tramos para tapar documentos", async () => {
    await assertFails(
      setDoc(doc(ctx(DUENO_A), "contadores", counterPath), {
        negocioId: NEGOCIO_A,
        tipo: "nota_entrega",
        ultimo: 500,
      }),
    )
  })

  it("sumar exactamente uno SÍ funciona", async () => {
    await assertSucceeds(
      setDoc(doc(ctx(DUENO_A), "contadores", counterPath), {
        negocioId: NEGOCIO_A,
        tipo: "nota_entrega",
        ultimo: 6,
        serie: null,
      }),
    )
  })
})

describe("Cuentas vencidas y desactivadas", () => {
  it("una cuenta vencida no puede leer sus productos", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "usuarios", "vencido"), {
        email: "vencido@x.com",
        negocioId: NEGOCIO_A,
        role: "owner",
        plan: "mensual",
        isActive: true,
        subscriptionEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      })
    })

    await assertFails(getDoc(doc(ctx("vencido"), "productos", "producto-a")))
  })

  it("una cuenta desactivada tampoco", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "usuarios", "desactivado"), {
        email: "off@x.com",
        negocioId: NEGOCIO_A,
        role: "owner",
        plan: "mensual",
        isActive: false,
        subscriptionEndsAt: new Date(Date.now() + 999 * 24 * 60 * 60 * 1000),
      })
    })

    await assertFails(getDoc(doc(ctx("desactivado"), "productos", "producto-a")))
  })

  it("sin correo verificado no se entra", async () => {
    const sinVerificar = testEnv.authenticatedContext(DUENO_A, { email_verified: false }).firestore()
    await assertFails(getDoc(doc(sinVerificar, "productos", "producto-a")))
  })

  it("sin sesión no se lee nada", async () => {
    const anonimo = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonimo, "productos", "producto-a")))
  })
})

describe("Panel de administración", () => {
  it("el super-admin lee cualquier cuenta", async () => {
    await assertSucceeds(getDoc(doc(ctx(SUPER), "usuarios", DUENO_B)))
  })

  it("el super-admin puede extender una suscripción", async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(SUPER), "usuarios", DUENO_B), {
        plan: "anual",
        subscriptionEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }),
    )
  })

  it("un dueño cualquiera NO puede leer la cuenta de otro negocio", async () => {
    await assertFails(getDoc(doc(ctx(DUENO_A), "usuarios", DUENO_B)))
  })

  it("nadie puede ascenderse a super-admin", async () => {
    await assertFails(setDoc(doc(ctx(DUENO_A), "superAdmins", DUENO_A), { creado: new Date() }))
  })

  it("un recibo de pago no se puede modificar", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "pagos", "pago-1"), {
        uid: DUENO_A,
        montoUsd: 30,
        registradoPor: SUPER,
        createdAt: new Date(),
      })
    })

    await assertFails(updateDoc(doc(ctx(SUPER), "pagos", "pago-1"), { montoUsd: 1 }))
  })
})

describe("Auditoría y movimientos de caja son inmutables", () => {
  it("un movimiento de caja no se puede editar", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "movimientos_caja", "mov-1"), {
        negocioId: NEGOCIO_A,
        turnoId: "turno-1",
        tipo: "salida",
        metodo: "cash",
        monto: 50,
        creadoPor: CAJERO_A,
        createdAt: new Date(),
      })
    })

    await assertFails(updateDoc(doc(ctx(DUENO_A), "movimientos_caja", "mov-1"), { monto: 5 }))
    await assertFails(deleteDoc(doc(ctx(DUENO_A), "movimientos_caja", "mov-1")))
  })
})

// ---------------------------------------------------------------------------

describe("El costo está fuera del alcance del cajero", () => {
  it("el cajero NO puede leer el costo de un producto", async () => {
    await assertFails(getDoc(doc(ctx(CAJERO_A), "productos_costos", "producto-a")))
  })

  it("el cajero NO puede listar los costos del negocio", async () => {
    await assertFails(
      getDocs(query(collection(ctx(CAJERO_A), "productos_costos"), where("negocioId", "==", NEGOCIO_A))),
    )
  })

  it("el producto que SÍ lee el cajero no trae el costo dentro", async () => {
    const snap = await getDoc(doc(ctx(CAJERO_A), "productos", "producto-a"))
    assert.equal(snap.exists(), true)
    assert.equal(snap.data().costUsd, undefined, "El costo se coló en el documento público")
    assert.equal(snap.data().profit, undefined, "El margen permite despejar el costo")
    assert.equal(typeof snap.data().precioUsd, "number", "El cajero necesita el precio para vender")
  })

  it("el encargado SÍ puede leer el costo", async () => {
    await assertSucceeds(getDoc(doc(ctx(DUENO_A), "productos_costos", "producto-a")))
  })

  it("el cajero NO puede escribir un costo", async () => {
    await assertFails(
      setDoc(doc(ctx(CAJERO_A), "productos_costos", "producto-a"), {
        negocioId: NEGOCIO_A,
        costUsd: 0.01,
      }),
    )
  })

  it("el costo de una venta se escribe pero no se lee de vuelta", async () => {
    await assertSucceeds(
      setDoc(doc(ctx(CAJERO_A), "ventas_costos", "venta-nueva"), {
        negocioId: NEGOCIO_A,
        ventaId: "venta-nueva",
        items: [{ productId: "producto-a", quantity: 1, costUsdUnit: 1.2 }],
        createdAt: new Date(),
      }),
    )

    await assertFails(getDoc(doc(ctx(CAJERO_A), "ventas_costos", "venta-nueva")))
    await assertSucceeds(getDoc(doc(ctx(DUENO_A), "ventas_costos", "venta-nueva")))
  })
})

describe("El cajero descuenta inventario al vender", () => {
  // Producto propio de esta suite: usar el compartido hacía que el resultado
  // dependiera de qué prueba hubiera corrido antes y cómo dejara el stock.
  const PRODUCTO = "producto-stock"

  before(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "productos", PRODUCTO), {
        negocioId: NEGOCIO_A,
        name: "Azúcar",
        quantity: 100,
        precioUsd: 2,
      })
    })
  })

  it("puede bajar las existencias", async () => {
    await assertSucceeds(updateDoc(doc(ctx(CAJERO_A), "productos", PRODUCTO), { quantity: 99 }))
  })

  it("NO puede subirlas: eso sería ajustar stock", async () => {
    await assertFails(updateDoc(doc(ctx(CAJERO_A), "productos", PRODUCTO), { quantity: 999 }))
  })

  it("NO puede dejarlas en negativo", async () => {
    await assertFails(updateDoc(doc(ctx(CAJERO_A), "productos", PRODUCTO), { quantity: -5 }))
  })

  it("NO puede aprovechar para cambiar el precio", async () => {
    await assertFails(
      updateDoc(doc(ctx(CAJERO_A), "productos", PRODUCTO), { quantity: 98, precioUsd: 0.01 }),
    )
  })
})

describe("Tesorería: el cajero no ve dónde está el dinero", () => {
  before(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, "cuentas", "cuenta-a"), {
        negocioId: NEGOCIO_A,
        nombre: "Banco de Venezuela",
        tipo: "banco",
        moneda: "BS",
        saldo: 15000,
        activa: true,
      })
      await setDoc(doc(db, "movimientos", "mov-a"), {
        negocioId: NEGOCIO_A,
        cuentaId: "cuenta-a",
        tipo: "ingreso",
        monto: 500,
        moneda: "BS",
        concepto: "Venta",
        origen: "venta",
        creadoPor: CAJERO_A,
      })
      await setDoc(doc(db, "gastos", "gasto-a"), {
        negocioId: NEGOCIO_A,
        tipo: "fijo",
        categoria: "Alquiler",
        concepto: "Alquiler de septiembre",
        montoUsd: 200,
        montoBs: 159000,
        creadoPor: DUENO_A,
      })
    })
  })

  it("el cajero NO puede ver los saldos de las cuentas", async () => {
    await assertFails(getDoc(doc(ctx(CAJERO_A), "cuentas", "cuenta-a")))
  })

  it("el cajero NO puede leer el libro de movimientos", async () => {
    await assertFails(getDoc(doc(ctx(CAJERO_A), "movimientos", "mov-a")))
  })

  it("el cajero NO puede ver los gastos del negocio", async () => {
    await assertFails(getDoc(doc(ctx(CAJERO_A), "gastos", "gasto-a")))
  })

  it("el encargado SÍ ve saldos, movimientos y gastos", async () => {
    await assertSucceeds(getDoc(doc(ctx(DUENO_A), "cuentas", "cuenta-a")))
    await assertSucceeds(getDoc(doc(ctx(DUENO_A), "movimientos", "mov-a")))
    await assertSucceeds(getDoc(doc(ctx(DUENO_A), "gastos", "gasto-a")))
  })

  it("un movimiento no se puede retocar ni borrar", async () => {
    await assertFails(updateDoc(doc(ctx(DUENO_A), "movimientos", "mov-a"), { monto: 1 }))
    await assertFails(deleteDoc(doc(ctx(DUENO_A), "movimientos", "mov-a")))
  })

  it("no se puede cambiar el importe de un gasto ya registrado", async () => {
    await assertFails(updateDoc(doc(ctx(DUENO_A), "gastos", "gasto-a"), { montoUsd: 1 }))
  })

  it("sí se puede apagar la recurrencia de un gasto fijo", async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(DUENO_A), "gastos", "gasto-a"), { recurrencia: { activa: false } }),
    )
  })

  it("el dueño de otro negocio no ve nada de esto", async () => {
    await assertFails(getDoc(doc(ctx(DUENO_B), "cuentas", "cuenta-a")))
    await assertFails(getDoc(doc(ctx(DUENO_B), "gastos", "gasto-a")))
  })
})

// ===========================================================================
// Roles creados por el dueño
//
// Desde que los roles son documentos, lo que autoriza es la lista de permisos
// copiada en usuarios/{uid}.permisos, no el nombre del rol. Estas pruebas
// cubren lo que esa copia hace posible y, sobre todo, lo que sigue impidiendo.
// ===========================================================================

const DUENO_C = "dueno-c" // negocio con la suscripción vencida
const EMPLEADO_C = "empleado-c"

const DUENO_D = "dueno-d"
const VENDEDOR_D = "vendedor-d" // permisos mínimos de mostrador
const GERENTE_D = "gerente-d" // con users.manage y cobros

/** Contexto con correo en el token: lo exigen las reglas de invitaciones. */
function ctxEmail(uid, email) {
  return testEnv.authenticatedContext(uid, { email_verified: true, email }).firestore()
}

describe("roles por documento, invitaciones y fiado", () => {
  before(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      const dentroDeUnAno = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      const anteayer = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

      // Negocio C: el dueño dejó de pagar.
      await setDoc(doc(db, "usuarios", DUENO_C), {
        email: "dueno@c.com",
        negocioId: DUENO_C,
        role: "owner",
        plan: "mensual",
        isActive: true,
        subscriptionEndsAt: anteayer,
      })

      // Su empleado tiene fechas propias en regla: si algo lo deja fuera tiene
      // que ser la suscripción del negocio, no la suya.
      await setDoc(doc(db, "usuarios", EMPLEADO_C), {
        email: "empleado@c.com",
        negocioId: DUENO_C,
        role: "staff",
        plan: "mensual",
        isActive: true,
        permisos: ["sales.create", "products.view"],
        subscriptionEndsAt: dentroDeUnAno,
      })

      // Negocio D, al día.
      await setDoc(doc(db, "usuarios", DUENO_D), {
        email: "dueno@d.com",
        negocioId: DUENO_D,
        role: "owner",
        plan: "mensual",
        isActive: true,
        subscriptionEndsAt: dentroDeUnAno,
      })

      await setDoc(doc(db, "usuarios", VENDEDOR_D), {
        email: "vendedor@d.com",
        negocioId: DUENO_D,
        role: "staff",
        rolId: "rol-mostrador",
        rolNombre: "Mostrador",
        permisos: ["sales.create", "products.view", "customers.view"],
        plan: "mensual",
        isActive: true,
      })

      await setDoc(doc(db, "usuarios", GERENTE_D), {
        email: "gerente@d.com",
        negocioId: DUENO_D,
        role: "staff",
        rolId: "rol-gerencia",
        rolNombre: "Gerencia",
        permisos: [
          "sales.create",
          "sales.credit",
          "products.view",
          "customers.view",
          "customers.manage",
          "receivables.collect",
          "users.manage",
        ],
        plan: "mensual",
        isActive: true,
      })

      await setDoc(doc(db, "roles", "rol-mostrador"), {
        negocioId: DUENO_D,
        nombre: "Mostrador",
        permisos: ["sales.create", "products.view", "customers.view"],
      })

      await setDoc(doc(db, "productos", "producto-d"), {
        negocioId: DUENO_D,
        name: "Harina",
        quantity: 20,
        precioUsd: 1.5,
      })

      await setDoc(doc(db, "productos_costos", "producto-d"), {
        negocioId: DUENO_D,
        productoId: "producto-d",
        costUsd: 0.9,
        profit: 40,
      })

      await setDoc(doc(db, "clientes", "cliente-d"), {
        negocioId: DUENO_D,
        nombre: "Yorbis",
        saldoDeudaUsd: 50,
        limiteCreditoUsd: 0,
        activo: true,
      })

      await setDoc(doc(db, "cuentas_cobrar", "deuda-d"), {
        negocioId: DUENO_D,
        clienteId: "cliente-d",
        clienteNombre: "Yorbis",
        montoUsd: 50,
        abonadoUsd: 0,
        saldoUsd: 50,
        estado: "pendiente",
        fecha: new Date(),
        creadoPor: GERENTE_D,
      })

      await setDoc(doc(db, "invitaciones", "invitacion-d"), {
        negocioId: DUENO_D,
        negocioNombre: "Bodega D",
        email: "nuevo@d.com",
        rolId: "rol-mostrador",
        rolNombre: "Mostrador",
        permisos: ["sales.create", "products.view", "customers.view"],
        estado: "pendiente",
        creadaEn: new Date(),
      })
    })
  })

  // --- la lista de permisos manda -----------------------------------------

  it("quien tiene products.view lee el producto pero NO su costo", async () => {
    await assertSucceeds(getDoc(doc(ctx(VENDEDOR_D), "productos", "producto-d")))
    await assertFails(getDoc(doc(ctx(VENDEDOR_D), "productos_costos", "producto-d")))
  })

  it("sin products.edit no se puede tocar el catálogo", async () => {
    await assertFails(updateDoc(doc(ctx(VENDEDOR_D), "productos", "producto-d"), { name: "Otra" }))
  })

  it("vender sí baja el stock, aunque no se pueda editar el producto", async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(VENDEDOR_D), "productos", "producto-d"), { quantity: 19 }),
    )
  })

  it("subir el stock sigue siendo ajustar, y eso pide su permiso", async () => {
    await assertFails(updateDoc(doc(ctx(VENDEDOR_D), "productos", "producto-d"), { quantity: 99 }))
  })

  // --- nadie se reparte permisos a sí mismo --------------------------------

  it("nadie puede añadirse permisos en su propio documento", async () => {
    await assertFails(
      updateDoc(doc(ctx(VENDEDOR_D), "usuarios", VENDEDOR_D), {
        permisos: ["costs.view", "sales.create"],
      }),
    )
  })

  it("nadie puede cambiarse el rol ni el negocio", async () => {
    await assertFails(updateDoc(doc(ctx(VENDEDOR_D), "usuarios", VENDEDOR_D), { role: "owner" }))
    await assertFails(updateDoc(doc(ctx(VENDEDOR_D), "usuarios", VENDEDOR_D), { negocioId: NEGOCIO_A }))
  })

  it("sí puede editar sus propias preferencias", async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(VENDEDOR_D), "usuarios", VENDEDOR_D), { telefono: "0414-0000000" }),
    )
  })

  // --- gestionar el equipo -------------------------------------------------

  it("sin users.manage no se pueden crear roles", async () => {
    await assertFails(
      setDoc(doc(ctx(VENDEDOR_D), "roles", "rol-colado"), {
        negocioId: DUENO_D,
        nombre: "Colado",
        permisos: ["costs.view"],
      }),
    )
  })

  it("con users.manage sí, y se le pueden cambiar los permisos a otro", async () => {
    await assertSucceeds(
      setDoc(doc(ctx(GERENTE_D), "roles", "rol-deposito"), {
        negocioId: DUENO_D,
        nombre: "Depósito",
        permisos: ["products.view"],
      }),
    )

    await assertSucceeds(
      updateDoc(doc(ctx(GERENTE_D), "usuarios", VENDEDOR_D), {
        rolId: "rol-deposito",
        rolNombre: "Depósito",
        permisos: ["products.view"],
      }),
    )
  })

  it("quien gestiona el equipo NO puede tocar al dueño", async () => {
    await assertFails(
      updateDoc(doc(ctx(GERENTE_D), "usuarios", DUENO_D), { isActive: false }),
    )
  })

  it("quien gestiona el equipo NO puede fabricar otro dueño", async () => {
    await assertFails(updateDoc(doc(ctx(GERENTE_D), "usuarios", VENDEDOR_D), { role: "owner" }))
  })

  it("no se puede alargar el plan de nadie desde la gestión del equipo", async () => {
    await assertFails(
      updateDoc(doc(ctx(GERENTE_D), "usuarios", VENDEDOR_D), {
        subscriptionEndsAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
      }),
    )
  })

  it("los roles de un negocio no se ven desde otro", async () => {
    await assertFails(getDoc(doc(ctx(DUENO_A), "roles", "rol-mostrador")))
  })

  // --- invitaciones --------------------------------------------------------

  it("el destinatario puede leer su invitación aunque no sea de ese negocio", async () => {
    const invitaciones = query(
      collection(ctxEmail("nuevo-d", "nuevo@d.com"), "invitaciones"),
      where("email", "==", "nuevo@d.com"),
      where("estado", "==", "pendiente"),
    )
    await assertSucceeds(getDocs(invitaciones))
  })

  it("nadie más puede leer la invitación de otro", async () => {
    await assertFails(
      getDoc(doc(ctxEmail("intruso", "intruso@x.com"), "invitaciones", "invitacion-d")),
    )
  })

  it("una invitación no se puede reabrir para colar a otra persona", async () => {
    await assertFails(
      updateDoc(doc(ctxEmail("nuevo-d", "nuevo@d.com"), "invitaciones", "invitacion-d"), {
        email: "otro@d.com",
        estado: "pendiente",
      }),
    )
  })

  it("el alta con invitación tiene que calcar el negocio, el rol y los permisos", async () => {
    const comoInvitado = ctxEmail("nuevo-d", "nuevo@d.com")

    // Con más permisos de los que le dieron: denegado.
    await assertFails(
      setDoc(doc(comoInvitado, "usuarios", "nuevo-d"), {
        email: "nuevo@d.com",
        negocioId: DUENO_D,
        role: "staff",
        rolId: "rol-mostrador",
        permisos: ["sales.create", "products.view", "customers.view", "costs.view"],
        invitacionId: "invitacion-d",
        plan: "trial",
      }),
    )

    // Colándose como dueño del negocio ajeno: denegado.
    await assertFails(
      setDoc(doc(comoInvitado, "usuarios", "nuevo-d"), {
        email: "nuevo@d.com",
        negocioId: DUENO_D,
        role: "owner",
        plan: "trial",
      }),
    )

    // Exactamente lo que dice la invitación: entra.
    await assertSucceeds(
      setDoc(doc(comoInvitado, "usuarios", "nuevo-d"), {
        email: "nuevo@d.com",
        negocioId: DUENO_D,
        role: "staff",
        rolId: "rol-mostrador",
        rolNombre: "Mostrador",
        permisos: ["sales.create", "products.view", "customers.view"],
        invitacionId: "invitacion-d",
        plan: "trial",
      }),
    )
  })

  // --- la suscripción del negocio manda ------------------------------------

  it("si el negocio dejó de pagar, su empleado tampoco entra", async () => {
    await assertFails(getDoc(doc(ctx(EMPLEADO_C), "productos", "producto-d")))
  })

  // --- fiado ---------------------------------------------------------------

  it("sin sales.credit no se puede fiar", async () => {
    await assertFails(
      setDoc(doc(ctx(VENDEDOR_D), "cuentas_cobrar", "deuda-colada"), {
        negocioId: DUENO_D,
        clienteId: "cliente-d",
        clienteNombre: "Yorbis",
        montoUsd: 30,
        abonadoUsd: 0,
        saldoUsd: 30,
        estado: "pendiente",
        fecha: new Date(),
        creadoPor: VENDEDOR_D,
      }),
    )
  })

  it("una deuda no puede nacer ya abonada", async () => {
    await assertFails(
      setDoc(doc(ctx(GERENTE_D), "cuentas_cobrar", "deuda-trucada"), {
        negocioId: DUENO_D,
        clienteId: "cliente-d",
        clienteNombre: "Yorbis",
        montoUsd: 30,
        abonadoUsd: 30,
        saldoUsd: 0,
        estado: "pagada",
        fecha: new Date(),
        creadoPor: GERENTE_D,
      }),
    )
  })

  it("no se puede cambiar el importe de una deuda ya registrada", async () => {
    await assertFails(
      updateDoc(doc(ctx(GERENTE_D), "cuentas_cobrar", "deuda-d"), { montoUsd: 5 }),
    )
  })

  it("no se puede desabonar una deuda", async () => {
    await assertFails(
      updateDoc(doc(ctx(GERENTE_D), "cuentas_cobrar", "deuda-d"), {
        abonadoUsd: -10,
        saldoUsd: 60,
      }),
    )
  })

  it("quien cobra sí puede abonar, y el abono queda inmutable", async () => {
    await assertSucceeds(
      updateDoc(doc(ctx(GERENTE_D), "cuentas_cobrar", "deuda-d"), {
        abonadoUsd: 20,
        saldoUsd: 30,
        estado: "parcial",
      }),
    )

    await assertSucceeds(
      setDoc(doc(ctx(GERENTE_D), "abonos", "abono-d"), {
        negocioId: DUENO_D,
        clienteId: "cliente-d",
        cuentaCobrarId: "deuda-d",
        montoUsd: 20,
        metodo: "cash",
        fecha: new Date(),
        registradoPor: GERENTE_D,
      }),
    )

    await assertFails(updateDoc(doc(ctx(GERENTE_D), "abonos", "abono-d"), { montoUsd: 999 }))
    await assertFails(deleteDoc(doc(ctx(GERENTE_D), "abonos", "abono-d")))
  })

  it("un abono no se puede registrar a nombre de otro", async () => {
    await assertFails(
      setDoc(doc(ctx(GERENTE_D), "abonos", "abono-falso"), {
        negocioId: DUENO_D,
        clienteId: "cliente-d",
        cuentaCobrarId: "deuda-d",
        montoUsd: 5,
        metodo: "cash",
        fecha: new Date(),
        registradoPor: DUENO_D,
      }),
    )
  })

  it("las deudas de un negocio no se ven desde otro", async () => {
    await assertFails(getDoc(doc(ctx(DUENO_A), "cuentas_cobrar", "deuda-d")))
  })
})
