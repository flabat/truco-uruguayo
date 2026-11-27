# Notificaciones de Apple — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:executing-plans (o superpowers:subagent-driven-development). Los pasos usan casillas (`- [ ]`).

**Objetivo:** `POST /api/auth/apple/notificaciones` recibe las notificaciones de servidor a servidor de Sign in with Apple, las verifica y las conecta con las bajas que ya existen (#468).

**Arquitectura:** un módulo nuevo, `api/notificaciones-apple.ts`, verifica el JWS con `node:crypto` y una caché de las claves de Apple, busca al jugador por la identidad federada `apple` de Keycloak y aplica cada evento. Las llamadas a la administración de Keycloak salen de un ayudante compartido con las bajas (`adminKeycloak` en `api/bajas.ts`). El comienzo de la baja se extrae de `api/cuenta.ts` para que lo usen el perfil y las notificaciones. Una tabla de avisos ya aplicados hace que repetir un evento no cambie nada.

**Tecnología:** Node 24 con TypeScript sin compilar, `node:crypto`, `pg`, la API de administración de Keycloak 26.8, `node --test`.

**Diseño:** [`docs/superpowers/specs/2026-11-27-sign-in-with-apple-tienda-design.md`](../specs/2026-11-27-sign-in-with-apple-tienda-design.md), sección «2. Notificaciones de servidor a servidor de Apple».

## Restricciones globales

- Sin dependencias nuevas. `jose` llega solo como dependencia de `openid-client` y no está en `node_modules` de la raíz, donde corren las unitarias: la firma RS256 se verifica con `node:crypto`, como ya firma `jwtRevocacion`.
- Los módulos que importan las unitarias no pueden cargar `openid-client` ni `pg` en tiempo de ejecución (solo `import type`). `cuenta.ts`, `retiro.ts` y `partidas.ts` cargan `auth.ts`: `notificaciones-apple.ts` recibe el comienzo de la baja como dependencia.
- No se tocan `infra/keycloak/` ni `scripts/configurar-ingreso-social.mjs` (#467).
- La migración nueva es `031`: el PR #458 ya usa `030`.
- Español rioplatense en el código, los mensajes, los commits, el PR y la documentación.
- Valores fijos: emisor `https://appleid.apple.com`; destinatarios `APPLE_CLIENT_ID` y `co.eltru.app`; claves en `https://appleid.apple.com/auth/keys` salvo `APPLE_KEYS_URL`; `iat` de hasta 24 horas atrás y 5 minutos adelante; solo `RS256`.

## Puntos de revisión

- Apple reenvía un evento ya aplicado después de que el jugador volvió a entrar: sus sesiones y su token nuevos siguen. Lo prueba el paso 3 de la tarea 4.
- Keycloak o las claves de Apple no responden: 503 (no 400), sin marcar el aviso como aplicado, para que Apple reintente. Tareas 1 y 3.
- Una cuenta con contraseña u otro proveedor recibe `account-delete`: nunca empieza la baja. Tarea 4.
- `events` llega como texto JSON (lo normal) o como objeto, y `aud` como texto o lista. Tarea 1.
- Un JWS con `alg` `none` o `HS256` firmado con la clave pública no pasa. Tarea 1.

---

### Task 1: verificación del JWS y caché de claves

**Archivos:**
- Crear: `api/notificaciones-apple.ts`
- Prueba: `tests/unit/notificaciones-apple.test.ts`

**Interfaces que produce:**
- `export class NotificacionInvalida extends Error` — firma, claims o eventos que no valen (→ 400).
- `export interface EventoApple { tipo: string; sub: string; momento: string }` — `momento` es `event_time` como texto.
- `export type ClavesApple = (kid: string) => Promise<KeyObject | null>`
- `export function crearClavesApple(url?: string, opciones?: { vigenciaMs?: number; pausaMs?: number; esperaMs?: number }): ClavesApple` — por omisión `https://appleid.apple.com/auth/keys`, 24 h y 5 s. Guarda las claves RSA por `kid`. Vuelve a bajarlas si vencieron o si falta el `kid`, salvo dentro de `pausaMs` (60 s) desde la última bajada. Si la bajada falla usa la caché vencida; sin caché, lanza un `Error` común (→ 503).
- `export async function verificarNotificacion(jws: string, opciones: { claves: ClavesApple; audiencias: string[]; ahora?: number }): Promise<EventoApple>`

- [ ] **Paso 1: pruebas que fallan.** Un par RSA generado en la prueba y un JWKS servido por `node:http` en `127.0.0.1:0`, que cuenta los pedidos. Casos, cada uno con su `test(...)`:
  - Válida con `aud` = `co.eltru.ingreso` y con `aud` = `["co.eltru.app"]` → `{ tipo: "consent-revoked", sub: "001.abc.0001", momento: "1795000000000" }`. `events` como objeto también vale.
  - Firma de otra clave con el mismo `kid`, y cuerpo alterado → `NotificacionInvalida`.
  - `iss` = `https://appleid.apple.com.otro`, `aud` = `otra.app` → `NotificacionInvalida`.
  - `iat` 24 h + 1 s atrás, 5 min + 1 s adelante, o ausente → `NotificacionInvalida`; 24 h − 10 s atrás vale.
  - `alg: "none"` sin firma, `alg: "HS256"` firmado con el `n` del JWK, y `kid` desconocido → `NotificacionInvalida`.
  - `events` que no es JSON, sin `type`, sin `sub` o sin `event_time` → `NotificacionInvalida`.
  - Caché: dos verificaciones → 1 pedido; un `kid` nuevo en el JWKS → 1 pedido más; otro `kid` desconocido enseguida → ningún pedido y `NotificacionInvalida`.
  - Con `vigenciaMs: 0` y el servidor cerrado, verifica con la caché vencida; sin caché y sin servidor, rechaza con un error que no es `NotificacionInvalida`.
- [ ] **Paso 2:** `node --test tests/unit/notificaciones-apple.test.ts` → falla porque el módulo no existe.
- [ ] **Paso 3:** implementar. La firma con `verify("sha256", datos, clave, firma)` sobre `cabecera.cuerpo`; la clave con `createPublicKey({ key: jwk, format: "jwk" })`, solo `kty: "RSA"`.
- [ ] **Paso 4:** la misma prueba pasa.
- [ ] **Paso 5:** commit «Verificar las notificaciones firmadas por Apple».

### Task 2: administración de Keycloak y comienzo de la baja compartidos

**Archivos:**
- Modificar: `api/bajas.ts` (extraer de `crearServiciosBaja` la base, el realm y `tokenServicio`)
- Modificar: `api/cuenta.ts`, `api/server.ts`

**Interfaces que produce:**
- `export function adminKeycloak(env: NodeJS.ProcessEnv): ((ruta: string, init?: RequestInit) => Promise<Response>) | null` en `bajas.ts` — `null` sin `KEYCLOAK_API_CLIENT_SECRET` u `OIDC_BACKEND`. Pide `${base}/admin/realms/${realm}${ruta}` con el token del cliente de servicio y un plazo de 10 s.
- `export function crearInicioBaja(pool: Pool, cerrarConexiones: (jugador: string) => void, alCambiar: (mesa: string) => void): (jugador: string) => Promise<Date>` en `cuenta.ts` — la transacción que hoy está en `crearCuenta`, más `cerrarConexiones` y `alCambiar`. Devuelve el vencimiento; repetir conserva el primero.
- `crearCuenta(pool, web, iniciarBaja: (jugador: string) => Promise<Date>)`.

- [ ] **Paso 1:** refactorizar sin cambiar el comportamiento. `borrarUsuario` usa `adminKeycloak`.
- [ ] **Paso 2:** `npm run check:rapido` pasa (`tests/unit/bajas.test.ts`). `scripts/verificar-bajas.mjs` y `scripts/verificar-bajas-vencidas.mjs` cubren el comportamiento en la pila (tarea 4).
- [ ] **Paso 3:** commit «Compartir la administración de Keycloak y el comienzo de la baja».

### Task 3: endpoint y eventos

**Archivos:**
- Modificar: `api/notificaciones-apple.ts`, `api/server.ts`
- Crear: `api/migrations/031-avisos-apple.sql` — `juego.avisos_apple (clave text PRIMARY KEY, recibido timestamptz NOT NULL DEFAULT now())`
- Prueba: `tests/unit/notificaciones-apple.test.ts`

**Interfaces que consume:** `adminKeycloak`, `crearInicioBaja` (tarea 2); `verificarNotificacion`, `crearClavesApple` (tarea 1).

**Interfaces que produce:**
- `export const rutaNotificacionesApple = "/api/auth/apple/notificaciones"`
- `export interface CuentasKeycloak { usuarioDeApple(sub: string): Promise<string | null>; tieneOtroIngreso(usuario: string): Promise<boolean>; desvincularApple(usuario: string): Promise<void>; cerrarSesiones(usuario: string): Promise<void> }`
- `export function crearCuentasKeycloak(env: NodeJS.ProcessEnv): CuentasKeycloak | null` — `GET /users?idpAlias=apple&idpUserId=<sub>`, confirmado con el vínculo del usuario; `GET /users/{id}/federated-identity` (otro proveedor) y `GET /users/{id}/credentials` (`type: "password"`); `DELETE /users/{id}/federated-identity/apple` (204 o 404); `POST /users/{id}/logout` (204 o 404).
- `export type ResultadoAviso = "sin-cambios" | "sin-jugador" | "repetido" | "consentimiento-revocado" | "apple-desvinculado" | "baja-iniciada"`
- `export function crearNotificacionesApple(pool: Pool, env: NodeJS.ProcessEnv, opciones: { emisor: string; iniciarBaja: (jugador: string) => Promise<unknown>; cerrarConexiones: (jugador: string) => void; claves?: ClavesApple; cuentas?: CuentasKeycloak | null; alAplicar?: (resultado: ResultadoAviso) => void }): (req: IncomingMessage, res: ServerResponse) => Promise<void>`

Orden de cada aviso, que hace idempotente un reintento a medio camino:
1. `email-disabled`, `email-enabled` y tipos desconocidos: se registran en el log (sin `sub` ni correo) → `sin-cambios`.
2. Sin `cuentas` → 503. Usuario de Keycloak y jugador (`emisor` = `OIDC_ISSUER`, `sujeto` = usuario); si falta alguno → `sin-jugador`.
3. `clave` = SHA-256 de `tipo`, `sub` y `momento`. Si está en `juego.avisos_apple` → `repetido`.
4. `consent-revoked`: `cerrarSesiones` en Keycloak, después borrar `sesiones`, `canjes` y `tokens_apple` del jugador y `cerrarConexiones`. Conserva el vínculo.
5. `account-delete` con `tieneOtroIngreso`: `desvincularApple`, `cerrarSesiones` y lo mismo que el punto 4 en la base. Sin otro ingreso: `cerrarSesiones`, `iniciarBaja` y borrar `tokens_apple`.
6. Recién entonces guardar la clave y borrar las de más de 30 días.

- [ ] **Paso 1: pruebas que fallan** (el handler en un `node:http` local; `pool` falso cuando el caso no toca la base):
  - Sin `APPLE_CLIENT_ID` → 404. `GET` → 405 con `Allow: POST`. Cuerpo sin `payload` o que no es JSON → 400. Firma ajena → 400.
  - `consent-revoked` válido y `usuarioDeApple` → `null` → 200 y `alAplicar("sin-jugador")`.
  - `email-disabled` → 200 sin llamar a `cuentas`. `consent-revoked` con `cuentas: null` → 503.
- [ ] **Paso 2:** la prueba falla.
- [ ] **Paso 3:** implementar, agregar la migración y la ruta en `server.ts`, antes de `auth`, con `emisor` = `new URL(process.env.OIDC_ISSUER!).href`. El cuerpo se lee con `leerCuerpo` (hasta 16 KB) sin exigir `Content-Type`.
- [ ] **Paso 4:** la prueba pasa.
- [ ] **Paso 5:** commit «Recibir las notificaciones de Apple sobre las cuentas».

### Task 4: integración sobre la base y Keycloak

**Archivos:**
- Crear: `scripts/verificar-notificaciones-apple.mjs` (dentro del contenedor de la API, como `verificar-bajas-vencidas.mjs`)
- Modificar: `scripts/verificar-stack.sh`, una línea después de `verificar-bajas-vencidas.mjs`, cuando ya existen `truco-api` y los proveedores `google` y `apple`.

- [ ] **Paso 1:** el script crea usuarios de Keycloak con el cliente `truco-api`, vincula `apple` (y `google`) con `POST /users/{id}/federated-identity/{proveedor}`, da contraseña con `PUT /users/{id}/reset-password` y abre una sesión de Keycloak con `grant_type=password` del cliente `admin-cli`. Sirve el handler con un JWKS propio (`APPLE_KEYS_URL`) y `APPLE_CLIENT_ID=co.eltru.prueba`.
- [ ] **Paso 2: casos.**
  - `consent-revoked` (Apple y contraseña): 200; sin sesiones, canjes ni token; sesiones de Keycloak cerradas; el vínculo `apple` sigue; sin baja; `cerrarConexiones` con el jugador.
  - `account-delete` con Google: 200; sin vínculo `apple`, con `google`; sin sesiones ni token; sin baja; el nombre sigue.
  - `account-delete` con contraseña: lo mismo y la sesión de Keycloak cerrada.
  - `account-delete` solo con Apple, sentado en una mesa sin reparto: 200; baja a 30 días; sin sesiones ni token; asiento libre y `alCambiar` con la mesa; el usuario de Keycloak y su vínculo siguen.
  - `email-disabled`: 200 y las sesiones siguen. `sub` desconocido: 200. Firma ajena: 400.
  - La API real, sin `APPLE_CLIENT_ID`: `POST /api/auth/apple/notificaciones` → 404.
- [ ] **Paso 3: repetición.** Reenviar cada aviso no cambia nada: la baja conserva el vencimiento. Después de `consent-revoked`, el jugador vuelve a tener sesión y token; el mismo aviso, con el mismo JWS o con otro `jti` e `iat`, los deja.
- [ ] **Paso 4:** con la pila local de la ranura (`docker compose up -d --build`, `npm run auth:api`, `auth:google`, `auth:apple`), `docker compose exec -T api node --input-type=module < scripts/verificar-notificaciones-apple.mjs` termina con «Notificaciones de Apple verificadas».
- [ ] **Paso 5:** commit «Probar las notificaciones de Apple sobre la base y Keycloak».

### Task 5: documentación, diseño y PR

**Archivos:**
- Modificar: `docs/ingreso-social.md` — sección «Notificaciones de Apple» dentro de «Habilitar Sign in with Apple»: la URL `https://<dominio>/api/auth/apple/notificaciones` (`https://eltru.co/...` en producción) en **Server-to-Server Notification Endpoint** del App ID; qué verifica; qué hace cada evento; las respuestas; `APPLE_KEYS_URL` para las pruebas. Una nota sobre el servicio de retransmisión de correo de Apple, porque Keycloak manda correos cuando tiene SMTP.
- Crear: `docs/superpowers/specs/2026-11-27-sign-in-with-apple-tienda-design.md` (cuerpo de #466 después de `---`).

- [ ] **Paso 1:** escribir la documentación; commit «Documentar las notificaciones de Apple».
- [ ] **Paso 2:** `npm run check:rapido` pasa. Abrir el PR con `Closes #468` y `Refs #466`.
- [ ] **Paso 3:** `python3 infra/ci/verificar_pr.py <PR>` y registrar en el PR la corrida, la cabeza, la base y el commit de integración probado.
