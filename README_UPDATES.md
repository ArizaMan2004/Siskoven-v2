# Actualizaciones Recientes - Sistema Venko

## Nuevas Características Implementadas

### 1. Sistema de Planes (Prueba + Completo)
- **Prueba Gratuita**: 7 días de acceso completo
- **Plan Completo**: Acceso permanente con código exclusivo
- **Validación**: Verificación automática de expiración
- **Modal de Expiración**: Interfaz clara para contactar al administrador

### 2. Categorías Predeterminadas
- **Categorías Incluidas**: Víveres, Ropa, Accesorios, Bebidas, Charcutería
- **Inicialización Automática**: Se crean al primer acceso
- **Categorías Personalizadas**: Los usuarios pueden crear más categorías
- **Ordenamiento**: Las categorías predeterminadas aparecen primero

### 3. Validación reCAPTCHA
- **Protección contra Bots**: Validación en el registro
- **reCAPTCHA v3**: Sin interacción del usuario
- **Verificación del Lado del Servidor**: Seguridad mejorada
- **Aviso de Privacidad**: Cumplimiento con políticas de Google

## Cambios en la Base de Datos

### Nueva Colección: categorias
\`\`\`javascript
{
  userId: string,
  name: string,
  isPredefined: boolean,
  createdAt: timestamp
}
\`\`\`

### Cambios en Colección: usuarios
\`\`\`javascript
{
  // ... campos existentes ...
  plan: "trial" | "complete",
  trialEndDate: timestamp | null,
  exclusiveCode: string | null,
  isActive: boolean
}
\`\`\`

## Variables de Entorno Nuevas

Agrega estas variables a tu archivo `.env.local`:

\`\`\`env
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_site_key_here
RECAPTCHA_SECRET_KEY=your_secret_key_here
NEXT_PUBLIC_ADMIN_PHONE=+58-XXX-XXX-XXXX
\`\`\`

## Obtener Claves de reCAPTCHA

1. Ve a [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Crea un nuevo sitio
3. Selecciona reCAPTCHA v3
4. Agrega tu dominio
5. Copia las claves (Site Key y Secret Key)
6. Pégalas en tu `.env.local`

## Configurar Número de Administrador

Edita `lib/admin-config.ts` y cambia:

\`\`\`typescript
export const ADMIN_CONFIG = {
  phone: "+58 XXX-XXX-XXXX", // Tu número aquí
  email: "admin@venko.com",
  supportEmail: "soporte@venko.com",
}
\`\`\`

## Flujo de Registro Actualizado

1. Usuario ingresa email y contraseña
2. Usuario ingresa nombre del comercio
3. **NUEVO**: Usuario selecciona plan (Prueba o Completo)
4. **NUEVO**: Si selecciona Completo, ingresa código exclusivo
5. **NUEVO**: reCAPTCHA valida automáticamente
6. Se crea la cuenta
7. Se envía verificación de email
8. **NUEVO**: Se inicializan categorías predeterminadas automáticamente

## Flujo de Expiración de Prueba

1. Usuario se registra con plan de prueba
2. Tiene 7 días de acceso completo
3. Después de 7 días, se muestra modal de expiración
4. Modal muestra número de contacto del administrador
5. Usuario contacta al administrador para obtener código exclusivo
6. Usuario se registra nuevamente con el código
7. Obtiene acceso permanente

## Reglas de Firestore Actualizadas

Asegúrate de que tus reglas de Firestore incluyan:

\`\`\`javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Usuarios - solo pueden leer/escribir sus propios datos
    match /usuarios/{userId} {
      allow read, write: if request.auth.uid == userId;
    }

    // Categorías - solo pueden leer/escribir sus propias categorías
    match /categorias/{document=**} {
      allow read, write: if request.auth.uid == resource.data.userId;
      allow create: if request.auth.uid == request.resource.data.userId;
    }

    // Productos - solo pueden leer/escribir sus propios productos
    match /productos/{document=**} {
      allow read, write: if request.auth.uid == resource.data.userId;
      allow create: if request.auth.uid == request.resource.data.userId;
    }

    // Ventas - solo pueden leer/escribir sus propias ventas
    match /ventas/{document=**} {
      allow read, write: if request.auth.uid == resource.data.userId;
      allow create: if request.auth.uid == request.resource.data.userId;
    }
  }
}
\`\`\`

## Próximos Pasos

1. Configura las variables de entorno
2. Obtén las claves de reCAPTCHA
3. Actualiza el número de administrador
4. Ejecuta el script de inicialización (si tienes usuarios existentes)
5. Prueba el flujo de registro
6. Prueba la expiración de prueba (puedes cambiar TRIAL_DAYS en admin-config.ts)

## Solución de Problemas

### reCAPTCHA no funciona
- Verifica que las claves estén correctas en `.env.local`
- Asegúrate de que el dominio esté registrado en Google reCAPTCHA
- Revisa la consola del navegador para errores

### Las categorías no se crean
- Verifica que el usuario esté autenticado
- Revisa las reglas de Firestore
- Ejecuta el script de inicialización

### La prueba no expira
- Verifica que `trialEndDate` esté guardado correctamente
- Revisa la fecha actual del servidor
- Cambia TRIAL_DAYS en admin-config.ts para pruebas

## Soporte

Para preguntas o problemas, contacta al administrador:
- **Teléfono**: +58 XXX-XXX-XXXX
- **Email**: admin@venko.com
