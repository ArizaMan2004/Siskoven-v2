/** @type {import('next').NextConfig} */
const nextConfig = {
  // Los errores de tipos rompen el build a propósito: estaban ocultando bugs
  // reales, entre ellos un className duplicado y varios precios mal tipados.
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

// Nota: aquí vivía `next-pwa`. Se quitó porque es la versión para Next 12/13,
// solo funciona con webpack y bajo Turbopack no generaba ningún service
// worker: había manifiesto pero cero capacidad sin conexión. El service worker
// ahora está escrito a mano en public/sw.js y se registra desde
// components/service-worker-registrar.tsx.
export default nextConfig
