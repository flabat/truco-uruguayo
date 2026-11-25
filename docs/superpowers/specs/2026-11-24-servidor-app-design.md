# Servidor para la app (etapa 2) — diseño

Fecha: 2026-11-24 · Estado: aprobado

Etapa 2 de [`2026-11-23-app-movil-design.md`](2026-11-23-app-movil-design.md). Rigen sus objetivos, anti-objetivos y restricciones de costo.

## Intención

La app de Expo (etapa 4) necesita ingresar, guardar su sesión y usar la API y el WebSocket igual que la web, sin depender de la cookie. Apple exige dos cosas para publicarla: Sign in with Apple, porque la app ofrece Google y Discord, y eliminación de cuenta desde la app. Esta etapa deja todo eso listo en el servidor, antes de que exista una pantalla de la app, para que la etapa 4 sea solo interfaz.

## Objetivos

- La app ingresa por el navegador del sistema y vuelve con una sesión propia, sin que la sesión pase por una URL.
- La API acepta la sesión por encabezado, además de la cookie, en HTTP y en WebSocket.
- Sesiones de la app de 30 días que se renuevan con el uso. La web mantiene 7 días.
- Sign in with Apple en Keycloak.
- Eliminación de cuenta con período de gracia de 30 días, usable desde la web ahora y desde la app en la etapa 4.
- Política de privacidad y `/eliminacion-de-datos/` actualizadas.

## No objetivos

- Pantallas de la app (etapa 4).
- `apple-app-site-association`, `assetlinks.json` y enlaces universales (etapa 4).
- Cambiar el protocolo `truco.v1` o el flujo de ingreso de la web.
- Facebook: sigue oculto mientras esté pausado.

## Anti-objetivos

- Que una sesión o un código de canje reutilizable quede en una URL, un historial o un registro.
- Tokens de Keycloak guardados en el teléfono.
- Que la eliminación deje datos que identifiquen a la persona, rompa el historial de los demás jugadores o deje una mesa trabada.
- Un secreto que vence en silencio y apaga un proveedor.
- Que un jugador web pierda algo de lo que hoy tiene.

## Estado actual (lo que se toca)

- `api/auth.ts` hace el ingreso OIDC con el cliente público `truco-web` (PKCE S256), guarda intentos en `juego.ingresos` y sesiones en `juego.sesiones` (clave = sha256 del secreto, vence a 7 días) y entrega la cookie `truco_sesion` con `Path=/api/`.
- Toda la autenticación pasa por `jugadorDeSesion(pool, req)`: la usan `perfil`, `salon`, `mesas`, `partidas`, `reportes` y el WebSocket (`autenticar` en `api/server.ts` → `api/vivo.ts`).
- `juego.jugadores` tiene `emisor`, `sujeto` (el `sub` de Keycloak) y `nombre`. Lo referencian `sesiones`, `mesas.creador`, `asientos.jugador` (`computadora = (jugador IS NULL)`) y `reporteros` (en cascada). `comandos` referencia `asientos(mesa, jugador)` sin acción en cascada, así que un asiento donde ya se jugó no puede quedar con `jugador = NULL`. No existe hoy una forma de dejar una mesa ni de cancelarla. Los replays no guardan IDs de jugador. El entrenamiento usa solo partidas entre computadoras, así que no hay datos de entrenamiento de personas.
- Keycloak 26.8.2 con una extensión propia (`infra/keycloak/proveedor`, `VerificarCorreo`). Los proveedores sociales se configuran con `scripts/configurar-ingreso-social.mjs` por la API de administración. La API no tiene hoy credenciales de administración.

## Enfoques considerados

### Cómo obtiene la app su sesión

| Enfoque | A favor | En contra |
| --- | --- | --- |
| **A. La API hace el ingreso y entrega un código de canje de un solo uso (elegido)** | Reusa el flujo actual; sin cliente nuevo en Keycloak; sin tokens de Keycloak en el teléfono; la sesión nunca está en una URL | Un endpoint de canje más en la API |
| B. La app es su propio cliente de Keycloak y la API canjea el token | Patrón OAuth más estándar | La API valida tokens; dos clientes y dos flujos que mantener |

### Sign in with Apple en Keycloak

| Enfoque | A favor | En contra |
| --- | --- | --- |
| **A. Extensión comunitaria de Apple para Keycloak, en versión fijada (elegido)** | Firma el secreto con la clave en cada ingreso: no vence | Hay que comprobarla en cada actualización de Keycloak |
| B. Proveedor OIDC genérico y una tarea que renueva el secreto | Sin código de terceros | El secreto vence a los 6 meses como máximo; si la tarea falla, Apple deja de andar sin aviso |

## Decisiones

### Ingreso desde la app

1. La app genera un verificador aleatorio y abre en el navegador del sistema `/api/auth/login?app=<desafío>`, donde el desafío es el SHA-256 en base64url del verificador. `volver` no se usa en este modo.
2. La API sigue el flujo actual con Keycloak y guarda el desafío en el intento (`juego.ingresos`).
3. En el callback, en lugar de la cookie, la API crea un código de canje aleatorio de un solo uso que vence en 60 segundos, guarda su hash junto al jugador y al desafío, y redirige a `eltruco://ingreso?codigo=<código>`.
4. La app llama `POST /api/auth/canje` con `{codigo, verificador}`. La API borra el código en la misma consulta que lo lee (un solo uso), comprueba que el verificador corresponda al desafío y responde `{sesion, jugador}`. Un código vencido, usado o con otro verificador responde 401 sin pistas.
5. La app guarda la sesión en almacenamiento seguro (etapa 4).

El código no sirve sin el verificador, que nunca sale de la app. Así, un código interceptado (otra app con el mismo esquema, un registro) no alcanza para obtener la sesión.

### Sesión por encabezado

- `jugadorDeSesion` acepta `Authorization: Bearer <sesion>` además de la cookie. Si vienen los dos, manda el encabezado.
- El WebSocket acepta el mismo encabezado en el upgrade (React Native permite encabezados en WebSocket; el navegador sigue con la cookie).
- Las comprobaciones de `Origin` que protegen acciones con cookie no se exigen cuando la sesión viene por encabezado, porque un sitio ajeno no puede enviarlo.
- `juego.sesiones` registra el tipo (`web` o `app`). Las de la app vencen a los 30 días y se extienden a 30 días desde el último uso; para no escribir en cada pedido, se extienden solo cuando les quedan menos de 15 días.
- `POST /api/auth/logout` con encabezado cierra esa sesión de la app.

### Sign in with Apple

- Extensión comunitaria de Apple para Keycloak, en versión fijada y compatible con Keycloak 26.8, agregada a la imagen de `infra/keycloak` junto a `VerificarCorreo`. *Decisión de diseño:* si ninguna extensión mantenida funciona con 26.8, se usa el enfoque B con una tarea de renovación, y la verificación de producción (`npm run check:production`) falla cuando al secreto le quedan menos de 30 días, para que nunca venza en silencio.
- `scripts/configurar-ingreso-social.mjs` (y `npm run auth:apple`) la habilita con el Services ID, el Team ID, el Key ID y la clave `.p8` del Apple Developer Program.
- Apple entrega el nombre solo en el primer ingreso y puede ocultar el correo (relay). El nombre visible sale de `given_name` como hoy; si falta, «Jugador».
- La pantalla «Entrá a jugar» muestra Apple junto a Google y Discord.
- Hasta tener la cuenta de Apple, la verificación del stack usa un proveedor falso local que reemplaza a Apple, para probar el ingreso de punta a punta.

### Eliminación de cuenta

**Pedido.** `POST /api/cuenta/eliminar` (con cookie y `Origin`, o con encabezado). La web lo ofrece en `/perfil/` con una confirmación que explica los 30 días; la app, en su pantalla de perfil (etapa 4). En una sola transacción:

- se registra la baja (`juego.bajas`: jugador, pedida, vence a 30 días);
- se borran todas sus sesiones, web y app, y se cierran sus conexiones WebSocket abiertas (lo mismo al cerrar sesión). Hoy el WebSocket autentica solo al conectarse, así que hace falta saber qué conexiones son de cada jugador;
- en cada mesa ya empezada (con al menos un reparto) y sin cierre del chico donde tiene asiento, una computadora juega ese asiento y la partida sigue para los demás. *Decisión de diseño (revisada durante la implementación):* el replay registra una sola vez por chico qué asientos son humanos y rechaza decisiones de computadora en un asiento humano. Por eso el asiento conserva su `jugador`, sigue siendo humano para las reglas y el replay, y se marca como cedido (`asientos.cedido`). El servidor lo juega con la política de la mesa como piloto automático, confirma sus jugadas como las de una persona (sin entregar la mano como una computadora) y las guarda sin datos de inferencia. Los demás lo ven como «Computadora N».

- en cada mesa que todavía espera jugadores (sin reparto), su asiento queda libre para otra persona. Si él la creó, la mesa se cierra: los demás jugadores sentados ven que se canceló y deja de aparecer en el salón. Como hoy no existe dejar ni cancelar una mesa, esta etapa agrega ese estado de mesa cancelada.

**Arrepentimiento.** Si vuelve a ingresar antes del vencimiento, el callback borra la baja y le avisa «Cancelamos la eliminación de tu cuenta». Los asientos cedidos siguen en manos de la computadora, pero las mesas siguen en su historial de Mi perfil, porque el asiento conserva su `jugador`.

**Al vencer.** Una tarea periódica dentro de la API (como la limpieza de voz) procesa las bajas vencidas:

- si ingresó con Apple, revoca sus tokens con el endpoint `/auth/revoke` de Apple, como exige Apple al eliminar cuentas. Para eso el proveedor de Apple en Keycloak guarda los tokens del proveedor y el cliente de servicio puede leerlos;
- borra el usuario de Keycloak (con sus identidades vinculadas y su contraseña) mediante un cliente de servicio nuevo con permiso solo para administrar usuarios del realm;
- borra `reporteros` y cualquier sesión o intento restante;
- conserva la fila de `juego.jugadores` como marcador anónimo: `nombre = 'Jugador'`, `emisor = 'eliminado'`, `sujeto` = un valor aleatorio. Así `mesas.creador`, `asientos.jugador` y `comandos` siguen siendo válidos para el historial de los demás, pero no identifican a nadie;
- es idempotente: si Keycloak falla, reintenta en la próxima pasada sin anonimizar a medias.

El historial muestra «Jugador» en lugar del nombre.

**Páginas.** La política de privacidad y `/eliminacion-de-datos/` describen el botón, los 30 días, qué se borra y qué queda anónimo. El pedido por correo sigue disponible para quien ya no puede ingresar.

## Criterios confirmados

- Proveedores en la app: Google, Discord, Apple y contraseña. Facebook oculto.
- Sesión de la app: 30 días renovables con el uso. La web: 7 días.
- Enlaces de invitación que abren la app: etapa 4.
- Mesas empezadas: una computadora juega el asiento. Mesas que esperan jugadores: el asiento se libera y, si la creó quien se va, la mesa se cancela.

## Queda a criterio de quien construye

- Nombres de tablas, columnas y endpoints, y el esquema exacto de la URL de retorno.
- La extensión de Apple concreta, siempre que esté fijada en versión y pase la verificación del stack.
- Cómo se simula Apple en el stack local.
- La frecuencia de la tarea de bajas.
- Cómo se resuelve el cambio de asiento a computadora en medio de una mano, dentro de lo descrito arriba.
