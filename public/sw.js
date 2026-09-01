/* eslint-disable no-restricted-globals */
//
// Service worker de Siskoven.
//
// POR QUÉ ESTÁ ESCRITO A MANO
// El proyecto traía `next-pwa`, pero es la versión para Next 12/13 y solo
// funciona con webpack: bajo Next 16 con Turbopack no generaba nada. Había
// manifiesto pero ni un solo archivo en caché, así que la aplicación no abría
// sin internet. Esto son ~120 líneas sin dependencias y se entiende entero.
//
// QUÉ RESUELVE, Y QUÉ NO
// La caché persistente de Firestore guarda los DATOS: ventas encoladas,
// inventario consultable. Pero solo sirve si la página ya está abierta. Si el
// cajero abre el navegador sin señal, el navegador no puede ni descargar el
// HTML. Este archivo es lo que hace que la aplicación ARRANQUE sin internet;
// los datos los sigue poniendo Firestore.
//
// Las dos capas son necesarias y ninguna sustituye a la otra.

const VERSION = "siskoven-v1"
const SHELL_CACHE = `${VERSION}-shell`
const STATIC_CACHE = `${VERSION}-static`
const DATA_CACHE = `${VERSION}-data`

// Lo mínimo para que algo se pinte sin red.
const SHELL_URLS = ["/", "/manifest.json", "/logo.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll falla entero si UN recurso falla; aquí se prefiere instalar a
      // medias antes que quedarse sin service worker por un icono ausente.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

/** Peticiones que este service worker no debe tocar jamás. */
function seDejaPasar(url) {
  return (
    // Firestore y la autenticación traen su propia gestión sin conexión, y
    // meterse en medio rompería la cola de escrituras.
    url.hostname.endsWith("googleapis.com") ||
    url.hostname.endsWith("google.com") ||
    url.hostname.endsWith("gstatic.com") ||
    url.hostname.endsWith("firebaseio.com") ||
    // El servidor de desarrollo y su recarga en caliente.
    url.pathname.startsWith("/_next/webpack-hmr") ||
    url.pathname.startsWith("/__nextjs")
  )
}

self.addEventListener("fetch", (event) => {
  const { request } = event

  // Solo GET: cachear un POST guardaría una venta como si fuera una página.
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || seDejaPasar(url)) return

  // 1. Navegación: primero la red, y si no hay, lo último que se vio.
  //    Así el cajero siempre trabaja con la versión más reciente cuando hay
  //    señal, y con la última conocida cuando no.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copia = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put("/", copia))
          return response
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE)
          return (await cache.match(request)) ?? (await cache.match("/")) ?? Response.error()
        }),
    )
    return
  }

  // 2. Recursos con hash en el nombre: primero la caché. Su contenido no
  //    cambia nunca, así que si está guardado es correcto por definición.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copia = response.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copia))
            return response
          }),
      ),
    )
    return
  }

  // 3. Las tasas de cambio: primero la red, con la última respuesta buena de
  //    reserva. Una tasa de ayer sirve para seguir cobrando; ninguna, no.
  if (url.pathname.startsWith("/api/rates")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copia = response.clone()
            caches.open(DATA_CACHE).then((cache) => cache.put(request, copia))
          }
          return response
        })
        .catch(async () => (await caches.match(request)) ?? Response.error()),
    )
    return
  }

  // 4. El resto de peticiones al propio dominio (iconos, imágenes): caché
  //    primero y red de reserva.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const copia = response.clone()
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copia))
            }
            return response
          })
          .catch(() => cached ?? Response.error()),
    ),
  )
})

// La página puede pedir que se active una versión nueva sin esperar.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting()
})
