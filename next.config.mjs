import withPWA from 'next-pwa';

// Definimos la función de envoltura PWA con la configuración deseada
// Esta función (pwaConfig) es el resultado de llamar a withPWA con tus opciones.
const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  
  // FIX 1: Usamos la opción 'disable' del plugin next-pwa, lo cual 
  // es la forma correcta de manejar PWA solo en producción.
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuración de Next.js
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  
  // FIX 2: Añadimos 'turbopack: {}' para evitar el conflicto entre
  // Turbopack (nuevo constructor de Next.js) y Webpack (usado por el plugin PWA).
  turbopack: {}, 
};

// Exportamos la configuración base envuelta en la configuración de PWA
export default pwaConfig(nextConfig);