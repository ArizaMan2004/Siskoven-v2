import { fileURLToPath } from 'url';
import path from 'path';

// 🔥 IMPORTANTE: Importamos next-pwa de forma asíncrona porque estamos en .mjs
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const withPWA = (config) => {
  // Solo se carga en modo de producción, ¡pero debe ser instalado!
  // Asegúrate de haber ejecutado 'npm install next-pwa'
  if (process.env.NODE_ENV === 'development') {
    return config;
  }
  
  // Cargamos next-pwa y lo inicializamos
  const nextPWA = require('next-pwa')({
    dest: 'public',
    register: true,
    skipWaiting: true,
    // La opción 'disable' ya no es necesaria aquí si lo manejamos en el 'if'
  });

  return nextPWA(config);
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

// Aplicamos el HOC de PWA a la configuración de Next
export default withPWA(nextConfig);