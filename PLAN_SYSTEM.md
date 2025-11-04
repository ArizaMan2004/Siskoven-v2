# Sistema de Planes Venko

## Descripción General

Venko ofrece dos opciones de planes para los usuarios:

### 1. Prueba Gratuita (7 días)
- **Duración**: 7 días desde la creación de la cuenta
- **Costo**: Gratis
- **Características incluidas**:
  - Gestión de productos ilimitada
  - Punto de venta básico
  - Reportes PDF
  - Tasa BCV actualizada diariamente
  - Escáner de códigos de barras
  - Categorías predeterminadas (Víveres, Ropa, Accesorios, Bebidas, Charcutería)

### 2. Plan Completo (Permanente)
- **Duración**: Permanente
- **Costo**: Requiere código exclusivo de registro
- **Características incluidas**:
  - Todas las características de prueba
  - Acceso permanente sin límite de tiempo
  - Soporte prioritario
  - Actualizaciones futuras incluidas

## Flujo de Expiración de Prueba

1. **Registro**: El usuario selecciona "Prueba Gratuita (7 días)" al registrarse
2. **Período de Prueba**: El usuario tiene acceso completo durante 7 días
3. **Notificación de Expiración**: Cuando expira la prueba, se muestra un modal con:
   - Mensaje de expiración
   - Número de contacto del administrador
   - Opción para copiar el número
   - Instrucciones para obtener el código exclusivo
4. **Bloqueo de Acceso**: El usuario no puede acceder al dashboard hasta obtener un código exclusivo

## Obtención del Código Exclusivo

1. El usuario contacta al administrador por teléfono
2. Proporciona su correo electrónico registrado
3. El administrador genera un código exclusivo
4. El usuario ingresa el código al registrarse o actualizar su plan
5. El usuario obtiene acceso permanente

## Configuración

### Variables de Entorno Requeridas

\`\`\`env
NEXT_PUBLIC_ADMIN_PHONE=+58-XXX-XXX-XXXX
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_site_key
RECAPTCHA_SECRET_KEY=your_secret_key
\`\`\`

### Modificar Número de Contacto

Edita el archivo `lib/admin-config.ts`:

\`\`\`typescript
export const ADMIN_CONFIG = {
  phone: "+58 XXX-XXX-XXXX", // Cambia este número
  email: "admin@venko.com",
  supportEmail: "soporte@venko.com",
}
\`\`\`

## Categorías Predeterminadas

Las siguientes categorías se crean automáticamente para cada usuario:

1. **Víveres** - Alimentos y productos de consumo
2. **Ropa** - Prendas de vestir
3. **Accesorios** - Complementos y accesorios
4. **Bebidas** - Bebidas en general
5. **Charcutería** - Productos de charcutería

Los usuarios pueden crear categorías personalizadas adicionales en cualquier momento.

## Validación de reCAPTCHA

El sistema incluye validación de reCAPTCHA v3 en el registro para prevenir bots:

- Se ejecuta automáticamente al registrarse
- Valida que el usuario sea humano
- No requiere interacción del usuario
- Se muestra el aviso de privacidad de Google

## Base de Datos

### Colección: usuarios
\`\`\`javascript
{
  email: string,
  businessName: string,
  createdAt: timestamp,
  emailVerified: boolean,
  plan: "trial" | "complete",
  trialEndDate: timestamp | null, // Solo para plan de prueba
  exclusiveCode: string | null, // Solo para plan completo
  isActive: boolean
}
\`\`\`

### Colección: categorias
\`\`\`javascript
{
  userId: string,
  name: string,
  isPredefined: boolean,
  createdAt: timestamp
}
\`\`\`

## Flujo de Autenticación

1. Usuario se registra con email y contraseña
2. Selecciona plan (Prueba o Completo)
3. Si selecciona Completo, ingresa código exclusivo
4. reCAPTCHA valida que sea humano
5. Se crea la cuenta con los datos del plan
6. Se envía verificación de email
7. Se inicializan las categorías predeterminadas
8. Usuario puede acceder al dashboard

## Monitoreo de Expiración

El sistema verifica automáticamente si la prueba ha expirado:

- En cada inicio de sesión
- Al cargar el dashboard
- Si está expirada, muestra el modal de expiración
- El usuario no puede acceder a ninguna funcionalidad

## Soporte

Para preguntas sobre los planes o códigos exclusivos, contacta al administrador:

**Teléfono**: +58 XXX-XXX-XXXX
**Email**: admin@venko.com
