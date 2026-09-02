@AGENTS.md

# Siskoven

Sistema de inventario, punto de venta y administración para comercios
venezolanos. Next 16 (App Router, Turbopack) + React 19 + Firebase.

## Las pruebas de las reglas de seguridad

`firestore.rules` es la autorización DE VERDAD; lo que hay en `lib/roles.ts`
solo decide qué botones se dibujan. Cualquier cambio en las reglas se prueba:

    npm run test:rules

Son 82 casos contra el emulador de Firestore. **Necesitan Java**, porque el
emulador corre sobre la JVM. En esta máquina hay un JRE portátil en
`C:\Users\Jesus\.jdks\temurin-21-jre` (Temurin 21 LTS, de Adoptium). Si `java`
no está en el PATH:

    JAVA_HOME=/c/Users/Jesus/.jdks/temurin-21-jre PATH="$JAVA_HOME/bin:$PATH" npm run test:rules

En la salida aparecen líneas de `evaluation error at L…` mezcladas con las
pruebas. **No son fallos**: Firestore las emite cuando una regla consulta un
campo o un documento que no existe para esa petición concreta —por ejemplo, un
usuario sin documento en `usuarios/`—, y el resultado sigue siendo denegar, que
es justo lo que se está comprobando. Lo que importa es el recuento final.

## Trampas conocidas de este proyecto

**No usar `AnimatePresence` con `mode="wait"`.** No completa la salida del hijo,
así que el entrante no llega a montarse y el contenido se congela en el primero.
Tuvo rotos el registro, el carrusel de la portada y el cambio de módulo del
panel. Se remonta con `<div key={loQueCambia}>`. La nota larga está en
`lib/motion.ts`.

**Nada de dependencias en `"latest"`.** Vercel instalaba versiones distintas a
las de aquí y el build fallaba solo allí. Todo va fijado.

**`.env.production` SÍ se versiona.** Son valores `NEXT_PUBLIC_*`, que Next
compila dentro del JavaScript del navegador: no son secretos ni pueden serlo.
Cualquier variable sin ese prefijo va en el panel de Vercel, nunca aquí.

## Node

`next build` no funciona con Node 26 (revienta el prerender). Vercel usa Node
22, que sí. Para construir en local hace falta Node 22 LTS.

