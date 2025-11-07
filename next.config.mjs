import { fileURLToPath } from 'url';
import path from 'path';
// 1. IMPORTAR next-pwa aquí, de forma asíncrona si es necesario, 
// o simplemente el import estático si next-pwa lo permite
import NextPWA from 'next-pwa'; // <-- ASUME que next-pwa usa export default

// Necesitas una forma de obtener el 'withPWA' que es la función.
// Como next-pwa exporta una función, la forma más limpia es esta:
const withPWA = NextPWA({
    dest: 'public',
    register: true,
    skipWaiting: true,
    // Puedes dejar 'disable: process.env.NODE_ENV === 'development'' si lo quieres
    disable: process.env.NODE_ENV === 'development',
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Quitamos la función 'withPWA' custom que creaste, 
// y usamos directamente la de next-pwa.

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

// 3. Aplicamos el HOC de PWA a la configuración de Next
// ¡Aquí es donde envolvemos nextConfig con la función withPWA importada!
export default withPWA(nextConfig);

// NOTA: Si 'next-pwa' no usa 'export default', 
// puedes intentar: import NextPWA from 'next-pwa/lib/with-pwa.js' 
// o buscar la documentación oficial de next-pwa para cómo importarlo en ESM.
// Pero la estructura de arriba es la más común para "wrappers" de Next.js.