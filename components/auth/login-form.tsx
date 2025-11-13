"use client"

import type React from "react"
import { useState } from "react"
import { useGoogleReCaptcha } from "react-google-recaptcha-v3"
// ✅ Importar la función para restablecer contraseña
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import { doc, setDoc, getDoc } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle } from "lucide-react"

// Importar el componente de Radio Group de ShadCN (asumo que existe)
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"


export default function LoginForm() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [exclusiveCode, setExclusiveCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("") 
  // Estado para rastrear si el error actual es la falta de verificación
  const [isUnverifiedError, setIsUnverifiedError] = useState(false);
  
  // ✅ NUEVO ESTADO PARA EL SELECTOR DE PLANES (Solo relevante en el registro)
  const [selectedPlan, setSelectedPlan] = useState<'complete' | 'trial'>('trial'); 

  const { executeRecaptcha } = useGoogleReCaptcha()

  // ✅ Función que valida el reCAPTCHA en el backend
  const verifyCaptcha = async (action: string) => {
    if (!executeRecaptcha) return null
    try {
      const token = await executeRecaptcha(action)
      const res = await fetch("/api/verify-recaptcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      return data.success
    } catch {
      return false
    }
  }

// ------------------------------------------------------------------
// FUNCIONES DE MANEJO
// ------------------------------------------------------------------

  // ✅ Inicio de sesión 
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccessMessage("") 
    setIsUnverifiedError(false); 

    const captchaPassed = await verifyCaptcha("login")
    if (!captchaPassed) {
      setError("Por favor verifica que no eres un robot 🧠🤖")
      setLoading(false)
      return
    }

    try {
      // 1. Intento de inicio de sesión
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      const user = userCredential.user

      await user.reload() 

      // 2. VERIFICACIÓN DE CORREO
      if (!user.emailVerified) {
        await auth.signOut() 
        
        alert("¡ATENCIÓN! Tu cuenta aún no ha sido verificada. Revisa tu correo electrónico para completar el registro. Si no lo ves, ¡revisa la carpeta de SPAM!")

        setError("Tu cuenta aún no ha sido verificada. Revisa tu correo electrónico, ¡puede estar en la carpeta de Spam!") 
        setIsUnverifiedError(true); 
        return 
      }
      
      // 3. VERIFICACIÓN DE EXPIRACIÓN DE PRUEBA (TRIAL)
      const userDoc = await getDoc(doc(db, "usuarios", user.uid))
      if (userDoc.exists()) {
        const data = userDoc.data()
        
        if (data.plan === "trial" && data.trialEndsAt) {
          const trialEndTimestamp = data.trialEndsAt.toDate().getTime()
          const now = new Date().getTime()

          if (now >= trialEndTimestamp) {
            await auth.signOut() 
            
            alert("¡CUENTA DESACTIVADA! Su período de prueba ha finalizado. Para seguir gozando del servicio, contacte al administrador para comprar la versión completa.");

            setError("Su período de prueba ha finalizado. La cuenta ha sido desactivada. Por favor, contacte al administrador.");
            
            return 
          }
        }
      }
      
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Credenciales incorrectas. Verifica tu correo y contraseña.")
      } else if (err.code === 'auth/too-many-requests') {
        setError("Demasiados intentos. Intenta más tarde.")
      } else {
        setError(err.message || "Error al iniciar sesión")
      }
      setIsUnverifiedError(false); 
    } finally {
      setLoading(false)
    }
  }

  // ✅ Función para reenviar la verificación de correo
  const handleResendVerification = async () => {
    const user = auth.currentUser;
    if (!user) {
        setError("Error: El usuario no está disponible. Por favor, intenta iniciar sesión de nuevo.")
        return;
    }
    
    setLoading(true)
    setError("")
    setSuccessMessage("")
    setIsUnverifiedError(false); 

    try {
      await sendEmailVerification(user)
      setSuccessMessage("Se ha enviado un nuevo correo de verificación. Revisa tu bandeja de entrada.")
    } catch (err: any) {
      setError("Error al enviar el correo. Inténtalo de nuevo más tarde.")
    } finally {
      setLoading(false)
    }
  }

  // ✅ NUEVA FUNCIÓN: Restablecer Contraseña
  const handlePasswordReset = async () => {
    // 1. Verificar si el campo de correo está lleno
    if (!email) {
      setError("Por favor, ingresa tu correo electrónico para restablecer la contraseña.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      // 2. Enviar el correo de restablecimiento de Firebase
      await sendPasswordResetEmail(auth, email);

      setSuccessMessage(`Se ha enviado un correo de restablecimiento a ${email}. Por favor, revisa tu bandeja de entrada (y la carpeta de spam).`);

    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        // Por seguridad, es mejor no revelar si el correo existe o no
        setError("Si el correo electrónico es correcto, recibirás un enlace para restablecer tu contraseña.");
      } else {
        setError("Hubo un error al intentar enviar el correo de restablecimiento.");
      }
    } finally {
      setLoading(false);
      setPassword(""); // Limpiar la contraseña después del intento
    }
  }

  // ✅ FUNCIÓN UNIFICADA DE REGISTRO
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccessMessage("")
    setIsUnverifiedError(false);

    const captchaPassed = await verifyCaptcha("register")
    if (!captchaPassed) {
      setError("Por favor verifica que no eres un robot 🧠🤖")
      setLoading(false)
      return
    }

    try {
      // 1. Validar el código solo si el plan es 'complete'
      if (selectedPlan === 'complete') {
        if (!exclusiveCode.trim()) {
          setError("Debes ingresar el código exclusivo de registro para el plan completo")
          setLoading(false)
          return
        }

        const codeRef = doc(db, "admin_codes", exclusiveCode.trim())
        const codeDoc = await getDoc(codeRef)
        if (!codeDoc.exists()) {
          setError("Código exclusivo no válido o inexistente.")
          setLoading(false)
          return
        }

        const codeData = codeDoc.data()
        if (codeData.used) {
          setError("Este código ya ha sido utilizado.")
          setLoading(false)
          return
        }
        // Marcar el código como usado (se hace después de crear el usuario)
      }


      // 2. Crear usuario en Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      
      // 3. Enviar correo de verificación
      await sendEmailVerification(userCredential.user) 

      // 4. Determinar los datos a guardar
      const userData: any = {
        email,
        businessName,
        createdAt: new Date(),
        emailVerified: false,
        plan: selectedPlan, // <-- Usar el plan seleccionado
        isActive: true,
      };

      if (selectedPlan === 'trial') {
        // Añadir lógica específica para la prueba de 7 días
        userData.trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); 
      } else if (selectedPlan === 'complete') {
        // Añadir lógica específica para el plan completo
        userData.exclusiveCode = exclusiveCode;
        // Marcar el código como usado en Firestore
        await setDoc(doc(db, "admin_codes", exclusiveCode.trim()), { used: true, usedBy: userCredential.user.uid, usedAt: new Date() }, { merge: true })
      }


      // 5. Guardar datos del usuario
      await setDoc(doc(db, "usuarios", userCredential.user.uid), userData)

      // 6. Cierra la sesión después del registro para forzar el login con verificación
      await auth.signOut();
      
      // 7. Mensaje y Alerta
      if (selectedPlan === 'trial') {
          alert("¡IMPORTANTE! Acabas de crear tu cuenta de prueba. Revisa tu correo electrónico para verificar tu cuenta y poder iniciar sesión. ¡Asegúrate de revisar la carpeta de SPAM!");
          setSuccessMessage("¡Cuenta de prueba creada! Revisa tu correo electrónico (incluyendo spam) para verificar tu cuenta e iniciar sesión. ¡Tienes 7 días de prueba!")
      } else {
          setSuccessMessage("¡Cuenta creada! Revisa tu correo electrónico para verificar tu cuenta e iniciar sesión.")
      }

      // Vuelve a la vista de login
      setIsLogin(true) 
      setEmail(""); // Limpiar campos
      setPassword("");
      setBusinessName("");
      setExclusiveCode(""); 

    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError("Este correo electrónico ya está registrado.")
      } else {
        setError(err.message || "Error al registrarse")
      }
    } finally {
      setLoading(false)
    }
  }


// ------------------------------------------------------------------
// RENDERIZADO DEL COMPONENTE
// ------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2">
          {/* Logo y encabezado */}
          <div className="flex items-center gap-2 mb-4">
            <img src="/logo.png" alt="Siskoven Logo" className="w-10 h-10 object-contain" />
            <span className="text-2xl font-bold text-primary">Siskoven System</span>
          </div>
          <CardTitle>{isLogin ? "Iniciar Sesión" : "Crear Cuenta"}</CardTitle>
          <CardDescription>
            {isLogin
              ? "Accede a tu sistema de inventario"
              : "Selecciona el plan que deseas utilizar para registrarte"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={isLogin ? handleLogin : handleRegister} className="space-y-4">
            
            {/* ✅ SELECTOR DE PLANES (Solo visible en el REGISTRO) */}
            {!isLogin && (
              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">Seleccionar Plan</Label>
                <RadioGroup 
                  value={selectedPlan} 
                  onValueChange={(value: 'complete' | 'trial') => setSelectedPlan(value)} 
                  className="flex justify-between space-y-0 gap-3"
                  disabled={loading}
                >
                  {/* Opción Prueba Gratuita */}
                  <div className="flex items-center space-x-2 border p-3 rounded-lg flex-1 cursor-pointer">
                    <RadioGroupItem value="trial" id="plan-trial" />
                    <Label htmlFor="plan-trial" className="flex flex-col space-y-1 cursor-pointer">
                      <span className="font-semibold">Prueba (7 Días)</span>
                      <span className="text-xs text-muted-foreground">No necesita código.</span>
                    </Label>
                  </div>
                  {/* Opción Plan Completo */}
                  <div className="flex items-center space-x-2 border p-3 rounded-lg flex-1 cursor-pointer">
                    <RadioGroupItem value="complete" id="plan-complete" />
                    <Label htmlFor="plan-complete" className="flex flex-col space-y-1 cursor-pointer">
                       <span className="font-semibold">Completo (Pago)</span>
                       <span className="text-xs text-muted-foreground">Requiere código exclusivo.</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* CAMPOS COMUNES */}
            
            {/* Nombre del Comercio (Solo en Registro) */}
            {!isLogin && (
              <div>
                <label className="text-sm font-medium text-foreground">Nombre del Comercio</label>
                <Input
                  type="text"
                  placeholder="Mi Tienda"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="mt-1"
                  required
                  disabled={loading}
                />
              </div>
            )}

            {/* Correo Electrónico */}
            <div>
              <label className="text-sm font-medium text-foreground">Correo Electrónico</label>
              <Input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                required
                disabled={loading}
              />
            </div>

            {/* Contraseña */}
            <div>
              <label className="text-sm font-medium text-foreground">Contraseña</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
                required
                disabled={loading}
              />
            </div>

            {/* ✅ CAMPO DE CÓDIGO EXCLUSIVO (Solo en Registro y Plan Completo) */}
            {!isLogin && selectedPlan === 'complete' && (
              <div>
                <label className="text-sm font-medium text-foreground">Código Exclusivo de Registro</label>
                <Input
                  type="text"
                  placeholder="Ingresa tu código exclusivo"
                  value={exclusiveCode}
                  onChange={(e) => setExclusiveCode(e.target.value)}
                  className="mt-1"
                  required={selectedPlan === 'complete'}
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      ¿No tienes código? Contacta al administrador:
                      <a
                        href="https://wa.me/584146004526"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline font-bold"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-green-500"
                        >
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        +58 0414-6004526
                      </a>
                    </p>
              </div>
            )}


            {/* MENSAJES DE ÉXITO */}
            {successMessage && (
              <div className="p-3 bg-green-100/50 text-green-700 text-sm rounded-md flex items-start gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {successMessage}
              </div>
            )}

            {/* MENSAJES DE ERROR */}
            {error && 
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  {error}
                  {/* Botón de Reenvío de alta visibilidad */}
                  {isUnverifiedError && isLogin && (
                    <div className="mt-3"> 
                        <Button 
                          onClick={handleResendVerification}
                          variant="outline" 
                          size="sm"
                          className="text-destructive border-destructive hover:bg-destructive/10"
                          disabled={loading}
                        >
                          Reenviar Correo de Verificación
                        </Button>
                    </div>
                  )}
                </div>
              </div>
            }

            {/* BOTÓN PRINCIPAL */}
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={loading}>
              {loading ? "Cargando..." : isLogin ? "Iniciar Sesión" : (selectedPlan === 'trial' ? "Registrar Prueba Gratuita" : "Crear Cuenta")}
            </Button>
            
            {/* BOTÓN ALTERNAR VISTA */}
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin)
                  // Limpiar estados al cambiar de vista
                  setError("")
                  setSuccessMessage("") 
                  setIsUnverifiedError(false);
                  setSelectedPlan('trial'); // Default a trial al ir a registro
                }}
                className="w-full text-sm text-primary hover:underline"
              >
                {isLogin ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
              </button>
              
              {/* ✅ BOTÓN OLVIDÉ MI CONTRASEÑA (Solo visible en Login) */}
              {isLogin && (
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  className="w-full text-xs text-muted-foreground hover:underline mt-1"
                  disabled={loading || !email}
                >
                  {loading ? "Enviando..." : "Olvidé mi Contraseña"}
                </button>
              )}
            </div>
          </form>

        </CardContent>
      </Card>
    </div>
  )
}