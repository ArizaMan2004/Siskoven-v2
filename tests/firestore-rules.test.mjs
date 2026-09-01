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
