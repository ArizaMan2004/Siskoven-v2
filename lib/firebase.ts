import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getStorage } from "firebase/storage"
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

/**
 * Almacenamiento de archivos: por ahora, los comprobantes de pago.
 *
 * No lleva caché sin conexión como Firestore. Una imagen no se puede encolar
 * en el navegador y subirla mañana sin ocupar el disco del teléfono, así que
 * si no hay internet el comprobante no se sube — pero la VENTA sí se guarda.
 * Ver lib/payment-receipts.ts: la imagen es prueba, no requisito para cobrar.
 */
export const storage = getStorage(app)

/**
 * Firestore con caché persistente en disco.
 *
 * Esto es lo que hace que una caja no pierda ventas cuando se va la luz, se cae
 * el internet o se agota la cuota diaria del proyecto:
 *
 * · Las escrituras que no se pueden enviar quedan en una cola guardada en el
 *   navegador (IndexedDB). Sobrevive a recargar la página y a cerrar el
 *   navegador, y se envía sola en cuanto se puede.
 * · Las lecturas se sirven de la copia local, así que el inventario se sigue
 *   consultando sin conexión.
 * · La cuota diaria de Firestore se reinicia cada medianoche (hora del
 *   Pacífico), así que lo que quedó en cola sube en la siguiente jornada.
 *
 * `persistentMultipleTabManager` permite varias pestañas abiertas compartiendo
 * la misma caché. Sin él, la segunda pestaña se queda sin persistencia, y ahí
 * sí se perderían escrituras.
 *
 * La única forma de perder la cola es borrar los datos del navegador o no
 * volver a abrir la aplicación nunca. Por eso el aviso en pantalla insiste en
 * no cerrar sesión mientras haya algo pendiente.
 */

/**
 * Identificador de la base de datos.
 *
 * Ojo: la base de este proyecto se llama "default" (una base CON NOMBRE), no
 * "(default)", que es la predeterminada que el SDK busca cuando no se le dice
 * nada. Sin este tercer argumento la aplicación se conecta a una base que no
 * existe y toda lectura falla, sin un error que lo explique.
 *
 * Se lee del entorno para no dejarlo escrito a fuego: si algún día se migra a
 * la base predeterminada, basta con borrar la variable.
 */
const DATABASE_ID = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "(default)"

export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  DATABASE_ID,
)
