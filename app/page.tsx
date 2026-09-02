import LandingPage from "@/components/landing/landing-page"

/**
 * Portada pública.
 *
 * Antes esta ruta mostraba directamente el formulario de acceso, así que quien
 * llegaba desde fuera se topaba con un campo de contraseña sin saber siquiera
 * qué era Siskoven. Ahora `/` explica el producto, `/entrar` es el acceso y
 * `/panel` la aplicación.
 */
export default function Home() {
  return <LandingPage />
}
