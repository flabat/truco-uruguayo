# Servidor para la app (etapa 2) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar listo el servidor para la app: ingreso con código de canje, sesión por encabezado en HTTP y WebSocket, Sign in with Apple y eliminación de cuenta con 30 días de gracia, sin cambiar la experiencia web.

**Architecture:** Todo pasa por `api/auth.ts`, que suma la lectura de `Authorization: Bearer` y el canje. Un módulo nuevo, `api/retiro.ts`, saca a un jugador de sus mesas (cede asientos o cancela mesas en espera). Otro, `api/cuenta.ts`, atiende el pedido de baja. `api/bajas.ts` completa las bajas vencidas con un cliente de servicio de Keycloak y la revocación de Apple. Las migraciones siguen la numeración de `api/migrations/`.

**Tech Stack:** Node 24 (type stripping), `pg`, `ws`, `openid-client`, Keycloak 26.8.2, Astro/React, `node --test`, Playwright, scripts `verificar-*.mjs` dentro del stack de Docker.

**Spec:** `docs/superpowers/specs/2026-11-24-servidor-app-design.md` (y la etapa 2 de `docs/superpowers/specs/2026-11-23-app-movil-design.md`)

## Global Constraints

- La web no cambia: cookie `truco_sesion` de 7 días, mismas rutas, mismo flujo. `npm run check` y `CHECK_STACK=1 npm run check` pasan.
- Sesión de la app: 30 días; se extiende a 30 días desde el uso solo cuando le quedan menos de 15.
- Código de canje: aleatorio, un solo uso, 60 segundos, inútil sin el verificador. Ni la sesión ni un código reutilizable aparecen en una URL o un registro.
- Retorno a la app: `eltruco://ingreso?codigo=<código>`.
- Baja: 30 días de gracia. Mesas empezadas y sin cierre: la computadora juega el asiento. Mesas sin reparto: el asiento se libera; si la creó quien se va, la mesa se cancela.
- Al vencer: revocar Apple si corresponde, borrar el usuario de Keycloak, dejar `juego.jugadores` como marcador anónimo (`nombre = 'Jugador'`, `emisor = 'eliminado'`, `sujeto` aleatorio). Idempotente.
- Ningún servicio pago nuevo. Ninguna extensión sin versión fijada.
- Proceso de AGENTS.md y CONTRIBUTING.md: issue, rama `codex/issue-<n>` con la API de refs, worktree `../truco-issue-<n>`, PR con `Closes #<n>`, verificación local registrada en el PR.
- Textos de interfaz, commits y documentación en español rioplatense.

## Review Focus

1. **Ingreso durante una baja ya vencida que la tarea aún no procesó:** no debe resucitar una cuenta a medio borrar. El callback responde 403 «Tu cuenta se está eliminando.» (prueba en la tarea 4).
2. **Pedido de baja repetido o simultáneo desde la web y la app:** una sola baja y el vencimiento no se corre (prueba en la tarea 4).
3. **Ceder el asiento cuando es el turno de quien se va, en medio de una mano:** la computadora juega enseguida y el replay del chico se sigue reproduciendo (prueba en la tarea 3).
4. **Pedido con cookie de un jugador y `Bearer` de otro:** manda el encabezado (prueba en la tarea 1).
5. **Quien canceló la baja abre una mesa con su asiento cedido:** recibe 404 y no controla a la computadora (prueba en la tarea 3).

---

### Task 0: Reservar el issue y preparar el worktree

- [ ] **Step 1:** Buscá issues, PR y ramas relacionadas (`gh issue list --search "app OR Apple OR eliminación OR baja" --state all`, `gh pr list --state open`, `git ls-remote --heads origin 'codex/*'`). Revisá los PR abiertos que tocan `api/auth.ts`, `api/mesas.ts`, `api/partidas.ts`, `api/vivo.ts`, `infra/keycloak/` o `src/components/perfil/`. Si hay solapamiento, frená y coordiná.
- [ ] **Step 2:** Abrí el issue «Servidor para la app: ingreso, Apple y eliminación de cuenta (etapa 2)» con el problema, la decisión (diseño y este plan) y las rutas: `api/`, `api/migrations/`, `infra/keycloak/`, `infra/*realm.json`, `scripts/`, `src/components/perfil/`, `src/components/jugar/Sala.tsx`, `src/pages/privacidad.astro`, `src/pages/eliminacion-de-datos.astro`, `docs/`, `tests/`.
- [ ] **Step 3:** Reservá con el bloque de CONTRIBUTING.md. Expected: existe `../truco-issue-<n>` en `codex/issue-<n>`.
- [ ] **Step 4:** Copiá al worktree el diseño y este plan, borrá las copias sin versionar del checkout principal, commit «Documentar el diseño y el plan del servidor para la app», push, PR en borrador con `Closes #<n>`, comentario de reserva en el issue. `npm ci` en el worktree.

### Task 1: Sesión por encabezado

**Files:**
- Create: `api/migrations/022-sesiones-app.sql`, `tests/unit/sesion-encabezado.test.ts`, `scripts/verificar-sesion-app.mjs`
- Modify: `api/auth.ts`, `api/vivo.ts`, `api/server.ts`, `api/mesas.ts:213`, `api/partidas.ts:326`, `api/salon.ts:104`, `api/reportes.ts:79`, `scripts/verificar-stack.sh`

**Interfaces:**
- Produces (en `api/auth.ts`):
  - `sesionDe(req: IncomingMessage): { handle: string; via: "cookie" | "encabezado" } | null`: `Authorization: Bearer <handle>` gana sobre la cookie. Un encabezado `Authorization` mal formado cuenta como sin sesión, sin caer a la cookie.
  - `origenValido(req: IncomingMessage, web: URL): boolean`: `true` si la sesión viene por encabezado o si `Origin === web.origin`.
  - `jugadorDeSesion(pool, req)` mantiene su firma. Para sesiones `tipo = 'app'` a las que les quedan menos de 15 días, extiende `vence` a `now() + 30 days` en la misma consulta.
  - `crearAuth(pool, opciones)` acepta `cerrarConexiones(jugador: string): void` en `OpcionesOIDC`.
- Produces (en `api/vivo.ts`): `cerrarJugador(jugador: string): void` en el objeto que devuelve `crearVivo`; cierra con código 1008 y motivo «La sesión se cerró.» todas las conexiones de ese jugador.
- Migración: `juego.sesiones.tipo text NOT NULL DEFAULT 'web' CHECK (tipo IN ('web','app'))`.

- [ ] **Step 1: Pruebas unitarias** en `tests/unit/sesion-encabezado.test.ts` con pedidos falsos (`{ headers: {...} } as IncomingMessage`):
  - `"el encabezado gana sobre la cookie"`: `authorization: "Bearer aaa"`, `cookie: "truco_sesion=bbb"` → `{ handle: "aaa", via: "encabezado" }`.
  - `"sin encabezado usa la cookie"` → `{ handle: "bbb", via: "cookie" }`.
  - `"un encabezado mal formado no cae a la cookie"`: `authorization: "Basic x"` con cookie → `null`.
  - `"origen: encabezado sin Origin es válido; cookie sin Origin no"` y `"cookie con Origin del juego es válida"`.
- [ ] **Step 2:** `node --test tests/unit/sesion-encabezado.test.ts` → FAIL (no existen las funciones).
- [ ] **Step 3:** Implementá `sesionDe`, `origenValido`, la renovación en `jugadorDeSesion` y la migración. Reemplazá las cinco comparaciones `req.headers.origin !== web.origin` (auth logout, mesas, partidas, salón, reportes) y la del upgrade en `vivo.ts` por `!origenValido(req, web)`. `logout` con encabezado borra esa sesión y responde 204 sin `Set-Cookie`; con cookie sigue igual. Tras borrar sesiones en logout llamá `cerrarConexiones(jugador)`. En `server.ts`, pasá `cerrarConexiones: jugador => vivo.cerrarJugador(jugador)`.
- [ ] **Step 4:** `node --test tests/unit/sesion-encabezado.test.ts` → PASS; `npm run test:unit` → PASS.
- [ ] **Step 5: `scripts/verificar-sesion-app.mjs`** (dentro del contenedor de la API, como `verificar-mesas.mjs`; crea jugadores y sesiones directo en la base). Comprueba:
  - `GET /api/jugador` con `Authorization: Bearer` y sin cookie ni Origin → 200 con el id correcto.
  - Cookie de A y `Bearer` de B → responde B.
  - `POST /api/mesas` con `Bearer` sin Origin → 201; con cookie sin Origin → 403.
  - WebSocket a `/api/mesas/<id>/vivo` con `Bearer` y sin Origin → abre; con cookie y sin Origin → 403.
  - Sesión `app` con `vence = now() + 10 days` → tras un pedido, `vence` ≈ `now() + 30 days`; con `vence = now() + 20 days` → sin cambio. Una sesión `web` nunca se extiende.
  - `POST /api/auth/logout` con `Bearer` → 204; luego `/api/jugador` → 401 y el WebSocket abierto se cierra con 1008.
  Sumalo a `scripts/verificar-stack.sh` después de `verificar-mesas.mjs`.
- [ ] **Step 6:** `CHECK_STACK=1 TEST_PORT=4323 npm run check` → PASS. Commit «Aceptar la sesión por encabezado en la API y el WebSocket».

### Task 2: Ingreso de la app con código de canje

**Files:**
- Create: `api/migrations/023-ingreso-app.sql`, `tests/unit/ingreso-app.test.ts`, `scripts/verificar-ingreso-app.mjs`
- Modify: `api/auth.ts`, `scripts/verificar-stack.sh`, `docs/ingreso-social.md` (sección corta «Ingreso desde la app»)

**Interfaces:**
- Consumes: sesiones con `tipo` (tarea 1).
- Produces (en `api/auth.ts`):
  - `esDesafio(valor: string | null): valor is string`: `/^[A-Za-z0-9_-]{43}$/`.
  - `verificadorCorresponde(verificador: string, desafio: string): boolean`: SHA-256 en base64url sin relleno, comparación en tiempo constante.
  - `GET /api/auth/login?app=<desafío>`: guarda el desafío en `juego.ingresos.desafio_app`; ignora `volver`. Un `app` inválido → 400.
  - Callback de un intento con `desafio_app`: crea el código y redirige 303 a `eltruco://ingreso?codigo=<código>`, sin `Set-Cookie` de sesión.
  - `POST /api/auth/canje` con JSON `{ codigo, verificador }` → 200 `{ sesion: string, jugador: { id, nombre }, bajaCancelada: boolean }` y crea una sesión `tipo = 'app'`. Código vencido, usado o con otro verificador → 401 `{ error: "El ingreso venció. Volvé a ingresar." }`. El código se borra en la misma consulta que lo lee, también cuando el verificador no corresponde.
- Migración: `juego.ingresos.desafio_app text`; tabla `juego.canjes (clave text PRIMARY KEY, jugador uuid NOT NULL REFERENCES juego.jugadores(id), desafio text NOT NULL, baja_cancelada boolean NOT NULL DEFAULT false, vence timestamptz NOT NULL DEFAULT now() + interval '60 seconds')`.

- [ ] **Step 1: Pruebas unitarias** en `tests/unit/ingreso-app.test.ts`:
  - `"el verificador de RFC 7636 corresponde a su desafío"`: `verificadorCorresponde("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM") === true`; con un carácter cambiado → `false`.
  - `"esDesafio acepta 43 caracteres base64url"`: acepta el desafío anterior; rechaza `null`, 42 o 44 caracteres, `+`, `/` y `=`.
- [ ] **Step 2:** `node --test tests/unit/ingreso-app.test.ts` → FAIL.
- [ ] **Step 3:** Implementá las funciones, la migración, el modo `app` del login, el callback y `POST /api/auth/canje`. El canje no exige Origin (no usa cookie) y responde `Cache-Control: no-store`.
- [ ] **Step 4:** `node --test tests/unit/ingreso-app.test.ts` → PASS; `npm run test:unit` → PASS.
- [ ] **Step 5: `scripts/verificar-ingreso-app.mjs`** (desde el host con Playwright, como `verificar-jugadores.mjs`, usando el usuario local de contraseña de `ingreso-local-navegador.mjs`). Comprueba:
  - El navegador termina en `eltruco://ingreso?codigo=…` (capturalo con `page.route` o el evento de pedido) y no recibió cookie `truco_sesion`.
  - Canje con otro verificador → 401; el mismo código con el verificador correcto → 401 (ya se consumió).
  - Un ingreso nuevo → canje 200; `GET /api/jugador` con ese `Bearer` → mismo id que el ingreso web del mismo usuario.
  - Repetir ese canje → 401.
  - `GET /api/auth/login?app=corto` → 400.
  Y en `verificar-sesion-app.mjs` (contenedor), un código con `vence` en el pasado → 401. Sumá el script del host a `verificar-stack.sh` después de `verificar-jugadores.mjs`.
- [ ] **Step 6:** `CHECK_STACK=1 TEST_PORT=4323 npm run check` → PASS. Commit «Ingresar desde la app con un código de canje».

### Task 3: Sacar a un jugador de sus mesas

**Files:**
- Create: `api/retiro.ts`, `api/migrations/024-retiro.sql`, `scripts/verificar-retiro.mjs`
- Modify: `api/mesas.ts` (`leerMesa`, `VistaMesa`, unirse, computadoras), `api/partidas.ts` (inicio de partida y una función exportada para reanudar computadoras), `src/components/jugar/Sala.tsx`, un spec de Playwright existente de la sala (por ejemplo `tests/jugar.spec.mjs`), `scripts/verificar-stack.sh`

**Interfaces:**
- Produces:
  - `retirarJugador(db: PoolClient, jugador: string): Promise<string[]>` en `api/retiro.ts`. Corre dentro de la transacción de quien llama, bloquea las mesas en orden de id y devuelve los ids de las mesas que cambiaron:
    - con al menos un reparto y sin cierre del chico: el asiento queda `computadora = true` y conserva `jugador`; después llama `reanudarComputadoras`.
    - sin reparto: borra su asiento; si `creador = jugador`, además `cancelada = now()`.
    - terminadas: no las toca.
  - `reanudarComputadoras(db: PoolClient, mesa: string): Promise<void>` en `api/partidas.ts`: con la mesa bloqueada, si el turno es de un asiento que ahora es computadora, lo juega o lo programa como después de una jugada humana. En la mano en curso, las decisiones de un asiento que el replay registró como humano se guardan como decisiones sin `bot`; desde el reparto siguiente el asiento entra en la lista de computadoras.
  - `VistaMesa.cancelada: boolean`. `leerMesa` solo encuentra la mesa si el asiento propio no es de computadora (`AND NOT propio.computadora`).
  - Mesa cancelada: unirse, agregar computadoras y empezar responden 409 `{ error: "La mesa se canceló." }`.
- Migración: reemplazá el CHECK `computadora = (jugador IS NULL)` de `juego.asientos` por `CHECK (jugador IS NOT NULL OR computadora)`; `juego.mesas.cancelada timestamptz`.
- Texto en la sala cuando `cancelada`: «Se canceló la mesa: quien la creó dejó el juego.»

- [ ] **Step 1: Prueba de Playwright** de la sala con la API simulada, como los specs existentes: una vista con `lista: false, cancelada: true` muestra el texto exacto y no muestra «Esperando jugadores».
- [ ] **Step 2:** Corré ese spec → FAIL.
- [ ] **Step 3: `scripts/verificar-retiro.mjs`** (contenedor), escrito antes de `retiro.ts`. Comprueba:
  - 1v1 empezado con A y B, turno de A en medio de la mano: `retirarJugador(A)` → el asiento de A es computadora; la computadora juega enseguida; la mano y el chico siguen hasta el cierre cuando B juega; `reproducirChico` del replay pasa.
  - Mesa en espera creada por A con B sentado → `cancelada` no nula; el asiento de A no existe; B ve `cancelada: true`; unirse → 409.
  - Mesa en espera creada por B con A sentado → el asiento de A queda libre y otra persona puede ocupar ese asiento.
  - Mesa con cierre → sin cambios.
  - Después del retiro, `leerMesa(mesa empezada, A)` → `null` y su WebSocket a esa mesa → 404.
  - `GET /api/perfil` de A sigue listando la mesa empezada.
  Corrélo contra el código actual → FAIL (no existe `retiro.ts`).
- [ ] **Step 4:** Implementá la migración, `retirarJugador`, `reanudarComputadoras`, los cambios de `leerMesa` y las respuestas 409, y el texto en `Sala.tsx`.
- [ ] **Step 5:** El spec de Playwright → PASS; `CHECK_STACK=1 TEST_PORT=4323 npm run check` con `verificar-retiro.mjs` sumado a `verificar-stack.sh` → PASS. Commit «Ceder asientos a la computadora y cancelar mesas en espera al retirar un jugador».

### Task 4: Pedido de baja y arrepentimiento

**Files:**
- Create: `api/cuenta.ts`, `api/migrations/025-bajas.sql`, `scripts/verificar-bajas.mjs`, `scripts/verificar-baja-ingreso.mjs`, un spec de Playwright del perfil (por ejemplo `tests/perfil-baja.spec.mjs`)
- Modify: `api/server.ts` (ruta `/api/cuenta/eliminar`), `api/auth.ts` (callback), `src/components/perfil/Perfil.tsx`, `src/components/perfil/perfil.css`, `scripts/verificar-stack.sh`

**Interfaces:**
- Consumes: `retirarJugador` (tarea 3), `origenValido` y `cerrarConexiones` (tarea 1), `juego.canjes.baja_cancelada` (tarea 2).
- Produces:
  - `crearCuenta(pool: Pool, web: URL, cerrarConexiones: (jugador: string) => void, alCambiar: (mesa: string) => void)` en `api/cuenta.ts`; atiende `POST /api/cuenta/eliminar`. En una transacción: `INSERT … ON CONFLICT DO NOTHING` en `juego.bajas`, borra todas las sesiones y canjes del jugador y llama `retirarJugador`. Después del commit: `cerrarConexiones`, `alCambiar` por cada mesa, y respuesta 200 `{ vence: string }` (ISO, el de la baja existente si ya había una) con la cookie de sesión vencida. Sin sesión → 401; origen inválido → 403.
  - Callback: si el jugador tiene una baja con `vence > now()`, la borra. En la web redirige a `/perfil/?baja=cancelada` (en lugar del regreso pedido); en la app marca `baja_cancelada` en el canje. Si la baja ya venció → 403 «Tu cuenta se está eliminando.» sin crear sesión.
- Migración: `juego.bajas (jugador uuid PRIMARY KEY REFERENCES juego.jugadores(id), pedida timestamptz NOT NULL DEFAULT now(), vence timestamptz NOT NULL DEFAULT now() + interval '30 days')`.
- Textos en `/perfil/`:
  - Botón: «Eliminar mi cuenta».
  - Confirmación: «Vas a cerrar sesión en todos tus dispositivos. En las partidas empezadas, una computadora juega en tu lugar; las mesas que creaste y todavía esperan jugadores se cancelan. Tenés 30 días para arrepentirte: si volvés a ingresar, cancelamos la eliminación. Después borramos tu cuenta y tus datos personales.» Botones «Eliminar mi cuenta» y «Volver».
  - Tras pedirla: «Pediste eliminar tu cuenta. Se elimina el <fecha> si no volvés a ingresar.»
  - Con `?baja=cancelada`: «Cancelamos la eliminación de tu cuenta.»

- [ ] **Step 1: Spec de Playwright del perfil** con la API simulada: el botón abre la confirmación con el texto exacto; «Volver» no llama a la API; confirmar hace `POST /api/cuenta/eliminar` y muestra el mensaje con la fecha; `?baja=cancelada` muestra su aviso.
- [ ] **Step 2: `scripts/verificar-bajas.mjs`** (contenedor):
  - Pedido con cookie y Origin → 200; todas las sesiones del jugador (web y app) dan 401; existe una baja con `vence` ≈ 30 días; su mesa empezada quedó con computadora.
  - Pedido con `Bearer` sin Origin → 200. Con cookie sin Origin → 403.
  - Dos pedidos simultáneos → una sola fila y el mismo `vence` en ambas respuestas.
- [ ] **Step 3: `scripts/verificar-baja-ingreso.mjs`** (host, Playwright, usuario local):
  - Pedir la baja desde `/perfil/`, volver a ingresar → termina en `/perfil/?baja=cancelada` con el aviso, y la baja no existe.
  - Con la baja vencida (`UPDATE … SET vence = now() - interval '1 minute'` por `docker compose exec db psql`) → el ingreso responde 403 «Tu cuenta se está eliminando.» y no hay sesión.
- [ ] **Step 4:** Corré los tres → FAIL.
- [ ] **Step 5:** Implementá la migración, `api/cuenta.ts`, la ruta, el callback y el perfil.
- [ ] **Step 6:** Los tres → PASS; sumá los scripts a `verificar-stack.sh`; `CHECK_STACK=1 TEST_PORT=4323 npm run check` → PASS. Commit «Pedir la eliminación de la cuenta con 30 días para arrepentirse».

### Task 5: Sign in with Apple

**Files:**
- Modify: `infra/keycloak/Dockerfile`, el tema `infra/keycloak/truco-oriental/login` (si lista proveedores por nombre), `scripts/configurar-ingreso-social.mjs`, `scripts/ingreso-social-local.sh`, `package.json` (`auth:apple`), `scripts/verificar-ingreso-social.mjs`, `scripts/verificar-stack.sh`, `docs/ingreso-social.md`

**Interfaces:**
- Alcance de la prueba local: el diseño pedía un proveedor falso de punta a punta, pero la extensión habla con `appleid.apple.com`. La prueba local cubre la configuración y el botón; la revocación se prueba con un servidor falso en la tarea 6. El ingreso real con Apple se prueba al tener la cuenta del Apple Developer Program (etapa 5) y queda anotado en el PR.
- Produces: proveedor de Keycloak con alias `apple`, `storeToken: true`, configurado con `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID` y `APPLE_PRIVATE_KEY` (contenido del `.p8`). Botón «Continuar con Apple» en «Entrá a jugar».

- [ ] **Step 1: Elegí la extensión.** Candidata: `klausbetz/apple-identity-provider-keycloak`. Verificá en su repositorio qué versión declara compatible con Keycloak 26.8 y su licencia. Antes de descargar el `.jar`, pedí permiso a la persona en el chat con nombre, origen y tamaño. Si ninguna versión mantenida sirve, aplicá la alternativa del diseño (OIDC genérico, tarea de renovación y `check:production` que falla con menos de 30 días) y registrala como ruling.
- [ ] **Step 2:** Extendé `verificar-ingreso-social.mjs` para aceptar `apple` (botón `#social-apple` con el texto «Continuar con Apple», después de Discord). Corré `node scripts/verificar-ingreso-social.mjs "$web" google facebook discord apple` contra el stack → FAIL.
- [ ] **Step 3:** Sumá el `.jar` a la imagen con su versión y su `--checksum=sha256:` fijos. Agregá `apple` a `configurar-ingreso-social.mjs` y a `ingreso-social-local.sh` (`-e APPLE_CLIENT_ID -e APPLE_TEAM_ID -e APPLE_KEY_ID -e APPLE_PRIVATE_KEY`) y `"auth:apple"` a `package.json`. En `verificar-stack.sh`, generá una clave EC P-256 de prueba con `openssl` y exportá valores de prueba antes de `npm run auth:apple`.
- [ ] **Step 4:** El paso 2 → PASS; `CHECK_STACK=1 TEST_PORT=4323 npm run check` → PASS.
- [ ] **Step 5:** Documentá en `docs/ingreso-social.md` cómo crear el Services ID, el retorno de Keycloak y la clave en Apple Developer. Commit «Agregar Sign in with Apple al ingreso».

### Task 6: Completar las bajas vencidas

**Files:**
- Create: `api/bajas.ts`, `tests/unit/bajas.test.ts`, `scripts/configurar-cliente-api.mjs`, `scripts/verificar-bajas-vencidas.mjs`
- Modify: `api/server.ts`, `infra/mesa-local-realm.json`, `infra/truco-local-realm.json` (si el stack lo usa), `compose.yaml`, `compose.production.yaml`, `infra/produccion/env.ejemplo`, `package.json` (`auth:api`), `scripts/verificar-stack.sh`, `docs/produccion.md`

**Interfaces:**
- Consumes: `juego.bajas` (tarea 4), proveedor `apple` con tokens guardados (tarea 5).
- Produces (en `api/bajas.ts`):
  - `interface ServiciosBaja { borrarUsuario(sujeto: string): Promise<void>; tokenApple(sujeto: string): Promise<string | null>; revocarApple(token: string): Promise<void> }`. `borrarUsuario` trata un 404 como éxito; `revocarApple` trata como éxito un 200 y un 400 `invalid_grant`.
  - `completarBaja(pool: Pool, jugador: string, servicios: ServiciosBaja): Promise<boolean>`: en orden, token y revocación de Apple, borrado en Keycloak y, en una transacción, borrar `reporteros`, `sesiones`, `canjes` e `ingresos` pendientes, anonimizar `jugadores` y borrar la baja. Si un paso externo falla, devuelve `false` sin tocar la base.
  - `procesarBajas(pool: Pool, servicios: ServiciosBaja, cadaMs = 3_600_000): () => void`: recorre `juego.bajas` con `vence <= now()`, como `procesarEnsayos`; devuelve la función que la detiene.
  - `crearServiciosBaja(env: NodeJS.ProcessEnv): ServiciosBaja | null`: usa el cliente de servicio `truco-api` (`KEYCLOAK_API_CLIENT_SECRET`, `OIDC_BACKEND`) y, para Apple, `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` y `APPLE_REVOKE_URL` (por omisión `https://appleid.apple.com/auth/revoke`). El `client_secret` de la revocación es un JWT ES256 con `iss` = Team ID, `sub` = Services ID, `aud` = `https://appleid.apple.com` y vencimiento de 5 minutos. Sin `KEYCLOAK_API_CLIENT_SECRET` devuelve `null`, la API registra una advertencia y no procesa bajas.
- Cliente `truco-api`: confidencial, solo cuenta de servicio, con los roles de `realm-management` necesarios para borrar usuarios y leer sus identidades federadas. Se crea en el realm local por JSON y en producción con `scripts/configurar-cliente-api.mjs` (`npm run auth:api`), igual que los proveedores sociales.

- [ ] **Step 1: Cómo leer el token de Apple.** En el stack, probá si la cuenta de servicio puede obtener el token guardado de un usuario federado (API de administración o intercambio de tokens de Keycloak 26.8). Si no se puede sin funciones en vista previa, la API guarda el refresh token de Apple al ingresar, cifrado con `APPLE_TOKENS_KEY` en una tabla propia que se borra con la baja, y `tokenApple` lo lee de ahí. Registrá la opción elegida como ruling.
- [ ] **Step 2: Pruebas unitarias** en `tests/unit/bajas.test.ts` con `ServiciosBaja` falsos y una base simulada mínima, o con funciones puras extraídas:
  - `"un fallo de Keycloak no anonimiza"` y `"un fallo de Apple no borra en Keycloak"`.
  - `"un 404 de Keycloak cuenta como borrado"`.
  - `"el JWT de revocación lleva iss, sub, aud y vence en 5 minutos"` (decodificá el JWT y verificá su firma con la clave pública de prueba).
- [ ] **Step 3:** `node --test tests/unit/bajas.test.ts` → FAIL.
- [ ] **Step 4: `scripts/verificar-bajas-vencidas.mjs`** (contenedor, con un servidor HTTP local como `APPLE_REVOKE_URL` que registra los pedidos):
  - Un jugador local con baja vencida → tras `completarBaja`, el usuario de Keycloak da 404, `jugadores` tiene `nombre = 'Jugador'` y `emisor = 'eliminado'`, la baja no existe y la mesa compartida sigue en el perfil del otro jugador.
  - Repetir `completarBaja` → `true` sin errores.
  - Con la URL de administración apuntando a un puerto cerrado → `false` y la fila de `jugadores` intacta.
  - Un jugador con token de Apple → el servidor falso recibió un `POST` con `token` y `client_secret`.
  Corrélo → FAIL.
- [ ] **Step 5:** Implementá `api/bajas.ts`, el cliente en los realms locales, `configurar-cliente-api.mjs`, las variables en los compose y en `env.ejemplo`, y el arranque en `server.ts` (detenerlo en `SIGTERM`).
- [ ] **Step 6:** Unitarias y el script → PASS; `CHECK_STACK=1 TEST_PORT=4323 npm run check` → PASS. Documentá en `docs/produccion.md` `npm run auth:api` y las variables nuevas. Commit «Completar las bajas vencidas en Keycloak, Apple y la base».

### Task 7: Política de privacidad y eliminación de datos

**Files:**
- Modify: `src/pages/privacidad.astro`, `src/pages/eliminacion-de-datos.astro`, y el spec de Playwright que cubra esas páginas (o uno nuevo, `tests/privacidad.spec.mjs`)

- [ ] **Step 1: Prueba de Playwright:** `/eliminacion-de-datos/` menciona «Eliminar mi cuenta» en Mi perfil, los 30 días, que una computadora ocupa tu lugar en partidas empezadas, que el historial compartido queda como «Jugador», y conserva la dirección de correo para quien no puede ingresar. `/privacidad/` menciona Apple como proveedor, la eliminación desde el juego y la revocación de Apple.
- [ ] **Step 2:** Corréla → FAIL.
- [ ] **Step 3:** Reescribí ambas páginas en español rioplatense con esos puntos, sin prometer más de lo que hace el código (el historial queda anónimo; los respaldos se rotan según `docs/produccion.md`).
- [ ] **Step 4:** → PASS; `npm run check` → PASS. Commit «Describir la eliminación de cuenta en la política de privacidad».

### Task 8: Verificación final y PR

- [ ] **Step 1:** `npm ci && CHECK_STACK=1 TEST_PORT=4323 npm run check` y `git diff --check` sobre el último commit. Guardá el resumen.
- [ ] **Step 2:** Completá la descripción del PR: qué cambió, cómo se usa desde la app (login con desafío, retorno, canje, `Bearer`), qué falta configurar en producción (`npm run auth:apple`, `npm run auth:api` y sus variables) y los resultados reales. Línea de atribución de Claude Code. Marcá el PR como listo para revisión.
