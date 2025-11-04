# Venko - Sistema de Gestión de Inventario

Venko es un sistema profesional de gestión de inventario diseñado para negocios en Venezuela, con integración de tasa BCV y gestión de ventas en tiempo real.

## Características

- **Autenticación Segura**: Login y registro con Firebase
- **Gestión de Productos**: CRUD completo con categorías dinámicas
- **Punto de Venta**: Carrito de compras con múltiples métodos de pago
- **Tasa BCV**: Actualización manual de tasa dólar-bolívares
- **Cálculo de Precios**: Conversión automática USD ↔ Bs
- **Escáner de Códigos**: Lectura de códigos de barras
- **Reportes PDF**: Inventario, facturas y etiquetas
- **Estadísticas**: Análisis de ventas con gráficos
- **Inventario**: Control automático de stock

## Instalación

1. Clona el repositorio
2. Instala las dependencias:
   \`\`\`bash
   npm install
   \`\`\`

3. Configura las variables de entorno:
   - Copia `.env.example` a `.env.local`
   - Agrega tus credenciales de Firebase

4. Ejecuta el servidor de desarrollo:
   \`\`\`bash
   npm run dev
   \`\`\`

5. Abre [http://localhost:3000](http://localhost:3000)

## Configuración de Firebase

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com)
2. Habilita Authentication (Email/Password)
3. Crea una base de datos Firestore
4. Copia las credenciales a `.env.local`

## Estructura de Datos

### Colecciones Firestore

- **usuarios**: Información de usuarios
- **productos**: Catálogo de productos
- **ventas**: Historial de transacciones

## Uso

1. **Registrarse**: Crea una cuenta con tu email
2. **Agregar Productos**: Ve a "Productos" y crea tu catálogo
3. **Actualizar Tasa BCV**: Ingresa la tasa diaria en el widget
4. **Realizar Ventas**: Usa "Punto de Venta" para procesar transacciones
5. **Ver Reportes**: Descarga reportes en PDF

## Tecnologías

- Next.js 16
- React 19.2
- Firebase (Auth + Firestore)
- Tailwind CSS
- jsPDF
- Recharts

## Licencia

MIT
