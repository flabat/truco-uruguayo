# Sign in with Apple para la App Store — diseño

Fecha: 2026-11-27. Parte de la etapa 5 del [plan de la app](2026-11-23-app-movil-design.md) (#402). Se apoya en la etapa 2 ([diseño del servidor](2026-11-24-servidor-app-design.md), #349).

## Intención

El responsable ya tiene el Apple Developer Program (Team ID `3RG2P6A4P4`) y quiere publicar la app en la App Store. Apple exige Sign in with Apple porque la app ofrece Google y Discord (guía 4.8 de la revisión).

La etapa 2 dejó el ingreso con Apple listo en el servidor: la extensión de Apple en Keycloak, los tokens de Apple guardados y su revocación al eliminar la cuenta. Para que funcione de verdad y pase la revisión faltan tres cosas:

1. Un botón de Apple que siga las guías de Apple. Hoy el tema muestra Apple con el ícono genérico.
2. Recibir las notificaciones que Apple manda cuando alguien deja de usar su Apple ID con El Truco o elimina su cuenta de Apple.
3. Habilitarlo en producción y probarlo en un iPhone.

## Objetivos

- Un botón «Continuar con Apple» que siga las Human Interface Guidelines, en la pantalla de ingreso de Keycloak (tema `truco-oriental`). La misma pantalla sirve a la web y a la app.
- Un endpoint para las notificaciones de servidor a servidor de Apple, conectado con las bajas que ya existen.
- Apple habilitado en el realm `mesa` de producción y probado en un iPhone real.

## No objetivos

- El ingreso nativo con AuthenticationServices, es decir, el botón del sistema dentro de la app.
- Cambiar el flujo de ingreso de la app. Sigue siendo `openAuthSessionAsync` → `/api/auth/login?app=…` → Keycloak.
- Los íconos de los demás proveedores; Discord sigue con el genérico.

## Anti-objetivos

- Un botón de Apple más chico o menos visible que los demás, o con un ícono que no es el de Apple: la revisión lo rechaza.
- Borrar la cuenta de El Truco de alguien que todavía tiene otra forma de entrar.
- Servicios pagos nuevos o un SDK de Apple en el servidor.

## Enfoques

| Enfoque | A favor | En contra |
| --- | --- | --- |
| **A. Mantener el ingreso web por Keycloak y completar lo que falta (elegido)** | Ya está construido y probado (etapa 2). Un solo flujo para la web, Android e iOS. En iOS, la página de Apple abre la hoja del sistema con Face ID. | Un paso más que el botón nativo: la pantalla de Keycloak. |
| B. Ingreso nativo con `expo-apple-authentication` y canje del identity token (token exchange de Keycloak o endpoint propio) | Un solo toque con Face ID. | Un entitlement nuevo, un endpoint de canje y otro camino que mantener y que solo se prueba en iOS. La guía 4.8 no lo exige. |
| C. Sign in with Apple JS en la web | — | Duplica lo que ya hace Keycloak. |

Se eligió A; el responsable delegó el cómo en la sesión coordinadora. B queda para más adelante, si la revisión o los jugadores lo piden.

## Diseño

### 1. Botón de Apple

- En `infra/keycloak/truco-oriental/login/social-providers.ftl`, agregar un caso `apple`:
  - El logo oficial de Apple, tomado de los recursos de diseño de Apple para Sign in with Apple; no se dibuja a mano.
  - El texto «Continuar con Apple», y "Continue with Apple" en inglés.
  - Fondo negro con texto blanco en modo claro, y blanco con texto negro en modo oscuro.
  - El mismo alto, ancho y radio que los demás botones.
- Apple aparece primero en la lista (`guiOrder` del proveedor, que fija `scripts/configurar-ingreso-social.mjs`), así nunca queda debajo de los otros ni fuera de la vista.
- Pruebas: la verificación del stack (con el reemplazo local de Apple) comprueba que el botón de Apple tiene el logo, el texto y el estilo. El PR lleva capturas en claro y en oscuro, en el ancho de un teléfono.

### 2. Notificaciones de servidor a servidor de Apple

- `POST /api/auth/apple/notificaciones` recibe `{"payload": "<JWS>"}`.
- El endpoint verifica:
  - La firma, con las claves públicas de Apple (`https://appleid.apple.com/auth/keys`, en caché). `APPLE_KEYS_URL` las reemplaza en las pruebas, como `APPLE_REVOKE_URL`.
  - `iss` = `https://appleid.apple.com`.
  - `aud` = `APPLE_CLIENT_ID` (el Services ID) o el bundle `co.eltru.app`. Se aceptan los dos.
  - Que `iat` sea reciente.
- Del token lee `events`, un JSON en texto con `type`, `sub` y `event_time`.
- Busca al jugador así: identidad federada `apple` de Keycloak con ese `sub` → usuario de Keycloak → jugador. Si no hay jugador, responde 200 y no hace nada.
- Qué hace con cada evento:
  - `consent-revoked`: el jugador dejó de usar su Apple ID con El Truco. Cierra sus sesiones, en la API y en Keycloak, y borra el token de Apple guardado. Conserva el vínculo: si vuelve a entrar con Apple, Apple manda el mismo `sub` y recupera su jugador.
  - `account-delete`: eliminó su cuenta de Apple. Si Apple era su única forma de entrar, sin otro proveedor vinculado ni contraseña, empieza la misma baja que el botón «Eliminar mi cuenta»: 30 días de gracia y después se anonimiza. Si tiene otra forma de entrar, quita el vínculo con Apple, borra el token y cierra sus sesiones; la cuenta sigue.
  - `email-disabled` y `email-enabled`: se registran y no cambian nada.
- Respuestas: 200 para una notificación válida, aunque no haya jugador; 400 si la firma o los claims no valen. Repetir un evento no cambia el resultado. Sin `APPLE_CLIENT_ID`, el endpoint responde 404.
- Pruebas:
  - Unitarias de la verificación, con un par de claves generado en la prueba y un JWKS local: firma ajena, `iss` o `aud` incorrectos, token vencido.
  - De integración, sobre la base, para cada evento.
- `docs/ingreso-social.md` explica qué URL se carga en el App ID y qué hace cada evento.

### 3. Producción

La hace la sesión coordinadora junto con el responsable, después de integrar 1 y 2.

- **El responsable, en Certificates, Identifiers & Profiles:**
  1. El App ID `co.eltru.app`, con Sign in with Apple como App ID primario y con Associated Domains.
  2. En la configuración de Sign in with Apple del App ID, el endpoint de notificaciones `https://eltru.co/api/auth/apple/notificaciones`.
  3. El Services ID `co.eltru.ingreso`, con el dominio `eltru.co` y el Return URL `https://eltru.co/realms/mesa/broker/apple/endpoint`.
  4. Una clave con Sign in with Apple, de la que salen el `.p8` y el Key ID.
- **En el VPS:**
  1. Cargar `APPLE_CLIENT_ID`, `APPLE_TEAM_ID=3RG2P6A4P4`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` y `APPLE_TOKENS_KEY` en `/etc/truco-oriental/production.env`.
  2. Configurar el proveedor en el realm `mesa` con `scripts/configurar-ingreso-social.mjs apple`.
  3. Reconstruir `web`, para que `/.well-known/apple-app-site-association` deje de dar 404, y reiniciar la API.
- **Verificación:** ingresar con Apple en la web y en el iPhone, con nombre y con correo oculto; eliminar una cuenta de prueba y comprobar la revocación; correr `npm run check:production`.

## Restricciones

- AGENTS.md y CONTRIBUTING.md: un issue, la rama `codex/issue-<n>`, un worktree propio, PR y verificación remota.
- Las dos partes de código se hacen en paralelo y no tocan los mismos archivos:
  - El botón: `infra/keycloak/`, `scripts/configurar-ingreso-social.mjs` y las pruebas del stack del ingreso.
  - Las notificaciones: `api/`, sus pruebas y `docs/ingreso-social.md`.
- Sin dependencias nuevas, salvo que la verificación del JWS no se pueda hacer con lo que ya usa la API (`openid-client` 6).
- Los secretos van solo en el entorno del VPS, nunca en el repositorio.

## Queda a criterio de quien construye

- Cómo se reemplaza Apple en el stack local para probar el botón y los eventos.
- La caché de las claves de Apple y qué pasa si no se pueden bajar.
- Cómo se cierran las sesiones de Keycloak: la API de administración del cliente de servicio `truco-api`, que ya lee los tokens de Apple.
- Si Keycloak o la API mandan correos a cuentas de Apple. Si es así, documentar el paso de registrar el dominio remitente en el servicio de retransmisión de correo de Apple.

