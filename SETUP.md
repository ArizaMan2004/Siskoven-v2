# Guía Completa de Instalación - Venko

## Paso 1: Descargar el Proyecto

1. Descarga el archivo ZIP desde v0
2. Extrae el contenido en tu computadora
3. Abre una terminal en la carpeta del proyecto

## Paso 2: Instalar Dependencias

\`\`\`bash
npm install
\`\`\`

Esto instalará todas las librerías necesarias (Next.js, React, Firebase, jsPDF, etc.)

## Paso 3: Configurar Firebase

### 3.1 Crear Proyecto en Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com)
2. Haz clic en "Crear proyecto"
3. Ingresa el nombre: "Venko"
4. Acepta los términos y crea el proyecto

### 3.2 Habilitar Autenticación

1. En el menú izquierdo, ve a "Autenticación"
2. Haz clic en "Comenzar"
3. Selecciona "Correo electrónico/Contraseña"
4. Habilita ambas opciones
5. Guarda los cambios

### 3.3 Crear Base de Datos Firestore

1. En el menú izquierdo, ve a "Firestore Database"
2. Haz clic en "Crear base de datos"
3. Selecciona "Comenzar en modo de prueba"
4. Elige la ubicación más cercana
5. Crea la base de datos

### 3.4 Obtener Credenciales

1. Ve a "Configuración del proyecto" (ícono de engranaje)
2. Selecciona "Configuración"
3. Desplázate hasta "Tu aplicación"
4. Haz clic en "Aplicación web" (ícono de <>)
5. Copia el objeto de configuración

## Paso 4: Configurar Variables de Entorno

1. En la carpeta del proyecto, copia el archivo `.env.example` y renómbralo a `.env.local`

2. Abre `.env.local` y reemplaza los valores con tus credenciales de Firebase:

\`\`\`
NEXT_PUBLIC_FIREBASE_API_KEY=tu_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tu_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tu_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=tu_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=tu_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=tu_app_id
\`\`\`

**Ejemplo:**
\`\`\`
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=venko-xxxxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=venko-xxxxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=venko-xxxxx.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:xxxxxxxxxxxxxxxx
\`\`\`

## Paso 5: Ejecutar el Proyecto

\`\`\`bash
npm run dev
\`\`\`

Abre tu navegador en [http://localhost:3000](http://localhost:3000)

## Paso 6: Crear tu Primera Cuenta

1. Haz clic en "Registrarse"
2. Ingresa tu email y contraseña
3. Haz clic en "Crear cuenta"
4. ¡Listo! Ya estás dentro del sistema

## Paso 7: Configurar Firestore (Reglas de Seguridad)

1. Ve a Firebase Console → Firestore Database
2. Selecciona la pestaña "Reglas"
3. Reemplaza el contenido con:

\`\`\`javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{uid} {
      allow read, write: if request.auth.uid == uid;
    }
    match /productos/{uid}/{document=**} {
      allow read, write: if request.auth.uid == uid;
    }
    match /ventas/{uid}/{document=**} {
      allow read, write: if request.auth.uid == uid;
    }
  }
}
\`\`\`

4. Haz clic en "Publicar"

## Uso del Sistema

### Agregar Productos

1. Ve a "Productos"
2. Completa los campos:
   - Nombre del producto
   - Tipo (Unidad o Peso)
   - Código de barras
   - Precio en USD
   - Ganancia (%)
   - Categoría
3. Haz clic en "Guardar"

### Actualizar Tasa BCV

1. En el dashboard, verás el widget de "Tasa BCV"
2. Ingresa la tasa diaria en bolívares por dólar
3. Haz clic en "Actualizar tasa"
4. Los precios se actualizarán automáticamente

### Realizar una Venta

1. Ve a "Punto de Venta"
2. Busca o escanea productos
3. Agrega cantidades
4. Selecciona método de pago
5. Haz clic en "Procesar Venta"
6. Se generará automáticamente una factura

### Generar Reportes

1. Ve a "Reportes"
2. Selecciona el tipo de reporte:
   - Inventario completo
   - Etiquetas de productos
   - Historial de ventas
3. Haz clic en "Descargar PDF"

### Ver Estadísticas

1. Ve a "Estadísticas"
2. Selecciona rango de fechas
3. Visualiza gráficos de ventas
4. Analiza métodos de pago

## Solución de Problemas

### Error: "Firebase is not initialized"
- Verifica que `.env.local` existe y tiene las credenciales correctas
- Reinicia el servidor: `npm run dev`

### Error: "Permission denied" en Firestore
- Ve a Firebase Console → Firestore → Reglas
- Asegúrate de que las reglas de seguridad están configuradas correctamente

### Los productos no se guardan
- Verifica que Firestore está habilitado
- Comprueba que las reglas de seguridad permiten escritura

### El escáner de códigos no funciona
- Asegúrate de usar HTTPS (en producción)
- Verifica que el navegador tiene permisos de cámara

## Desplegar en Producción

### Opción 1: Vercel (Recomendado)

1. Sube el proyecto a GitHub
2. Ve a [Vercel](https://vercel.com)
3. Importa el repositorio
4. Agrega las variables de entorno
5. Haz clic en "Deploy"

### Opción 2: Netlify

1. Sube el proyecto a GitHub
2. Ve a [Netlify](https://netlify.com)
3. Conecta tu repositorio
4. Agrega las variables de entorno
5. Despliega

## Soporte

Si tienes problemas, verifica:
- Las credenciales de Firebase son correctas
- Firestore está habilitado
- Las reglas de seguridad están configuradas
- El servidor está ejecutándose en `localhost:3000`

¡Disfruta usando Venko!
