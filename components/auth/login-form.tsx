"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import { doc, setDoc, getDoc } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginForm() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [exclusiveCode, setExclusiveCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err: any) {
      setError(err.message || "Error al iniciar sesión")
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      // LÓGICA DE VERIFICACIÓN Y USO ÚNICO DEL CÓDIGO
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
      // FIN LÓGICA DE CÓDIGO

      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      await sendEmailVerification(userCredential.user)

      // MARCAR EL CÓDIGO COMO USADO EN admin_codes
      await setDoc(codeRef, { used: true, usedBy: userCredential.user.uid, usedAt: new Date() }, { merge: true })

      // REGISTRO DEL USUARIO con 'plan: complete' fijo
      await setDoc(doc(db, "usuarios", userCredential.user.uid), {
        email,
        businessName: businessName,
        createdAt: new Date(),
        emailVerified: false,
        plan: "complete", // Fijo
        exclusiveCode: exclusiveCode,
        isActive: true,
      })

      setError("Verifica tu correo electrónico para continuar")
    } catch (err: any) {
      setError(err.message || "Error al registrarse")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2">
          {/* ENCABEZADO PERSONALIZADO: LOGO y Siskooven */}
          <div className="flex items-center gap-2 mb-4">
            <img src="/logo.png" alt="Siskoven Logo" className="w-10 h-10 object-contain" />
            <span className="text-2xl font-bold text-primary">Siskoven</span>
          </div>
          <CardTitle>{isLogin ? "Iniciar Sesión" : "Crear Cuenta (Acceso Exclusivo)"}</CardTitle>
          <CardDescription>
            {isLogin ? "Accede a tu sistema de inventario" : "Crea tu cuenta ingresando tu código exclusivo"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={isLogin ? handleLogin : handleRegister} className="space-y-4">
            {!isLogin && (
              <>
                {/* CAMPO DE NOMBRE DEL COMERCIO */}
                <div>
                  <label className="text-sm font-medium text-foreground">Nombre del Comercio</label>
                  <Input
                    type="text"
                    placeholder="Mi Tienda"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="mt-1"
                    required
                  />
                </div>
                
                {/* CAMPO DE CÓDIGO EXCLUSIVO */}
                  <div>
                    <label className="text-sm font-medium text-foreground">Código Exclusivo de Registro</label>
                    <Input
                      type="text"
                      placeholder="Ingresa tu código exclusivo"
                      value={exclusiveCode}
                      onChange={(e) => setExclusiveCode(e.target.value)}
                      className="mt-1"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      ¿No tienes código? Contacta al administrador:
                      <a 
                          href="https://wa.me/584146004526" // **REEMPLAZA ESTE NÚMERO** (Ej: 584121234567)
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="flex items-center gap-1 text-primary hover:underline font-bold"
                      >
                          {/* ** Ícono SVG de WhatsApp ESTILIZADO (Outline) ** */}
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                              <path d="M12 12V12"></path>
                              <path d="M12 12V12"></path>
                              <path d="M16 10a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0z"></path>
                              <path d="M9 10a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0z"></path>
                              <path d="M12 10V10"></path>
                              <path d="M12 14V14"></path>
                          </svg>
                          +58 0414-6004526
                      </a>
                    </p>
                  </div>
              </>
            )}

            <div>
              <label className="text-sm font-medium text-foreground">Correo Electrónico</label>
              <Input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Contraseña</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
                required
              />
            </div>

            {error && <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>}

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={loading}>
              {loading ? "Cargando..." : isLogin ? "Iniciar Sesión" : "Crear Cuenta"}
            </Button>

            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin)
                setError("")
              }}
              className="w-full text-sm text-primary hover:underline"
            >
              {isLogin ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}