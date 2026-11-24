# App móvil de El Truco — diseño general

Fecha: 2026-11-23 · Estado: aprobado

## Intención

El Truco hoy se juega en el navegador (eltru.co). Queremos una app nativa para iOS y Android que se sienta mejor en la mano: animaciones fluidas de cartas, hápticos, sonidos con poca latencia y rendimiento nativo. Más adelante, voz entre jugadores.

El navegador sigue siendo una puerta de entrada de primera clase: la misma interfaz de juego se publica también en la web.

Restricciones de fondo: hay un único desarrollador y el juego no tiene ingresos. Cada decisión tiene que minimizar el tiempo de mantenimiento y el gasto fijo.

## Objetivos

- Una sola interfaz de juego, escrita una vez, publicada en iOS, Android y web.
- Juego en línea desde la primera versión, contra las mesas y el servidor existentes. Jugadores de app y de web comparten mesa.
- Paridad con lo que hoy ofrece el juego en línea en la web antes de retirar la pantalla actual: 1 contra 1, 2 contra 2 (con señas privadas `pairs-private-senas`), 3 contra 3 cuando el servidor lo habilita, mesas públicas y salón en vivo, espectador, historial y reporte de jugada, resumen de tantos, voces de los cantos, enlaces de voz por Discord.
- Rediseño de la mesa pensado para el teléfono (se define en su propia etapa, con maquetas).
- Gasto en efectivo del primer año cercano a US$125 (Apple Developer Program y alta en Google Play).

## No objetivos

- Reemplazar el sitio Astro. Las páginas de contenido (aprender, reglas, baraja, fuentes, privacidad, eliminación de datos, perfil) siguen en Astro.
- Juego sin conexión contra la computadora en la v1.
- Voz entre jugadores en la v1 (etapa 6).
- Reescribir el motor o el servidor.

## Anti-objetivos

- Dos interfaces de juego que divergen (una web y otra nativa).
- Copias del motor de reglas en más de un lugar.
- Servicios pagos recurrentes para funcionar.
- Que un jugador web pierda una modalidad que hoy tiene.
- Que las señas lleguen a los rivales: rige la regla de AGENTS.md también en la app.

## Enfoques considerados

| Enfoque | A favor | En contra |
| --- | --- | --- |
| **Expo + React Native para iOS, Android y web (elegido)** | Una interfaz para tres plataformas; reutiliza el motor TypeScript y el cliente; animación y gestos nativos; módulos Swift/Kotlin puntuales si hicieran falta | La versión web es una SPA más pesada que la página actual; algunas librerías gráficas cuestan más en web |
| Envolver el sitio actual (Capacitor) | Días de trabajo, casi sin código nuevo | Se siente como un sitio; contradice el motivo del proyecto; riesgo de rechazo en App Store |
| Nativo puro (Swift + Kotlin) | Máximo pulido por plataforma | Dos bases nuevas más el motor en otros lenguajes; inviable para una sola persona |
| Web actual + app nativa separada | No toca la web | Dos interfaces de juego; todo se hace dos veces |
| Lógica compartida, pantallas por plataforma | Comparte estado y red | Las pantallas son la mayor parte del trabajo; casi el doble de costo |

Flutter y Kotlin Multiplatform se descartaron porque tiran el motor en TypeScript.

Se eligió Expo para las tres plataformas porque maximiza la reutilización con una sola persona y permite probar la mesa nueva en la web antes de que estén las apps de las tiendas.

## Decisiones tomadas

- **Plataforma:** Expo (SDK vigente al empezar; hoy SDK 58, React Native 0.88) con builds de desarrollo (no Expo Go), Expo Router, TypeScript.
- **Web:** la exportación web de Expo se sirve en `eltru.co/jugar/` desde el mismo origen, para que la cookie de sesión actual siga funcionando. Mientras no haya paridad, se publica en una dirección de prueba y la pantalla Astro actual sigue en `/jugar/`.
- **Repositorio:** monorepo con workspaces de npm. El motor (`src/motor/`) pasa a un paquete compartido que consumen el sitio Astro, `api/` y la app.
- **Servidor en vivo:** la app usa el mismo protocolo WebSocket `truco.v1` (`api/vivo.ts`) y los mismos endpoints HTTP que `src/components/jugar/cliente.ts`. El cliente se mueve a un paquete compartido o se adapta sin cambiar el protocolo.
- **Ingreso en la app:** el ingreso sigue pasando por Keycloak (`identidad`). La app abre el flujo en el navegador del sistema (sesión de autenticación web) y vuelve a la app por un enlace propio. La API emite su sesión y la app la guarda en almacenamiento seguro y la envía en un encabezado en HTTP y WebSocket. La web sigue usando la cookie.
- **Sign in with Apple:** se agrega como proveedor en Keycloak. Apple lo exige porque la app ofrece Google y Discord.
- **Eliminación de cuenta dentro de la app:** Apple la exige. Hoy `/eliminacion-de-datos/` es un pedido por correo que se atiende a mano, así que hay que construirla. Al pedirla se cierra la sesión y empieza un período de gracia de 30 días en el que el jugador puede arrepentirse al volver a ingresar. Al vencer, se borra todo lo personal (fila del jugador, sesiones, usuario de Keycloak) y se anonimizan el historial compartido (partidas, replays, reportes que involucran a otros jugadores) y los datos de entrenamiento. La política de privacidad y `/eliminacion-de-datos/` se actualizan para describirlo. La web ofrece el mismo botón.
- **Voz por Discord:** los enlaces de voz por Discord de la web (`VozDiscord`, `api/voz-discord.ts`) están en la v1 de la app, por paridad. La relación con LiveKit se decide en la etapa 6.
- **Escritorio:** la mesa se diseña primero para el teléfono, con una variante ancha simple para la web en computadora (la misma mesa con más aire y paneles laterales), no un diseño aparte.
- **Costos:** builds locales o el plan gratuito de EAS; actualizaciones OTA en el plan gratuito; sin servicios pagos nuevos.
- **Voz (etapa 6):** LiveKit autoalojado junto a la API, con un endpoint que emite tokens.

## Criterios propuestos durante la revisión (a confirmar)

- **Proveedores en la app:** Google, Discord, Apple y contraseña. Facebook sigue oculto mientras esté pausado en eltru.co.
- **Duración de la sesión en la app:** 30 días que se renuevan con el uso, para no mandar al jugador al navegador cada semana. La web mantiene sus 7 días.
- **Perfil en la app:** pantalla nativa de perfil en la v1 (ID de jugador, nombre, cerrar sesión, eliminar cuenta). Así la app no depende de la cookie de `/perfil/`.
- **Enlaces de invitación:** `/jugar/?invitacion=…`, `/volver/?mesa=…` y `?mirar=` abren la app si está instalada (universal links y app links). Requiere servir `apple-app-site-association` y `assetlinks.json` desde eltru.co. Sin la app, siguen abriendo la web.

## Etapas

Cada etapa es su propio issue, rama `codex/issue-<n>` y PR, según CONTRIBUTING.md.

1. **Paquete de reglas compartido.** Workspaces; `src/motor/` como paquete; Astro, `api/` y entrenamiento lo importan. Sin cambios visibles. `npm run check` y el entrenamiento siguen pasando.
2. **Servidor para la app.** Cliente Keycloak para la app con PKCE y retorno a la app; canje que entrega la sesión a la app sin exponerla en la URL de forma reutilizable; la API acepta la sesión por encabezado además de la cookie (HTTP y WebSocket); proveedor Apple; eliminación de cuenta con período de gracia y anonimización (API, Keycloak, esquema), usable desde la app y la web; actualización de la política de privacidad.
3. **Diseño de la mesa nueva.** Brainstorming propio con maquetas en el navegador. Incluye la variante ancha para escritorio. Resultado: un documento de diseño visual.
4. **App Expo.** Proyecto en el monorepo; mesa, salón, sala y espectador; animaciones, hápticos y sonido; exportación web en dirección de prueba; pruebas con el motor compartido.
5. **Lanzamiento.** TestFlight; prueba cerrada en Google Play (12 testers durante 14 días para cuentas personales nuevas); fichas de tienda; luego `/jugar/` pasa a la versión Expo y se retira la pantalla Astro.
6. **Más adelante: voz entre jugadores** con LiveKit autoalojado.

## Queda a criterio de quien construye

- Librerías de animación y gráficos, siempre que funcionen bien en web (evitar un costo de descarga grande en la web).
- Nombres y estructura de los paquetes del monorepo.
- Forma exacta del canje de sesión entre la API y la app, respetando que la sesión no quede en historiales ni registros.
- Cómo se sirve la exportación web dentro de la infraestructura actual (Caddy, servicio `web`).
- Estrategia de pruebas de la app (unitarias sobre el motor compartido; de punta a punta en web con Playwright; en iOS con el simulador).
