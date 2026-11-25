# App de El Truco

App Expo (SDK 58, Expo Router, TypeScript) para iOS, Android y web. Usa builds de desarrollo, no Expo Go. Diseño: [plan general](../docs/superpowers/specs/2026-11-23-app-movil-design.md) y [etapa 4](../docs/superpowers/plans/2026-11-24-etapa-4-app-expo.md).

## Estructura

- `src/app/`: rutas de Expo Router. `index.tsx` es el ingreso o el perfil; `mesa.tsx` es provisoria hasta la parte 4d.
- `src/api/cliente.ts`: rutas de ingreso y perfil sobre el cliente compartido `@eltruco/cliente` (`paquetes/cliente`), que pone `Authorization: Bearer` en HTTP y en el WebSocket `truco.v1`. Expone `pedir` y `vivo` para el salón y la mesa.
- `src/ingreso/`: PKCE, retorno `eltruco://ingreso`, canje y almacenamiento de la sesión. Lo puro se prueba en `tests/unit/app-ingreso.test.ts`; `plataforma.ts` lo une con `expo-crypto`, `expo-web-browser` y `expo-secure-store`.
- `src/tema.ts`: paleta y tipografías de la mesa nueva.

## Ingreso

- **iOS y Android:** abre `/api/auth/login?app=<desafío>` en el navegador del sistema, vuelve por `eltruco://ingreso?codigo=…`, canjea el código con `POST /api/auth/canje` y guarda la sesión en el almacenamiento seguro. Cada pedido lleva `Authorization: Bearer`.
- **Web:** se sirve en `/jugar/` del mismo origen que la API y usa la cookie `truco_sesion`.
- **Ingreso de prueba:** si la API anuncia `GET /api/auth/dev` (`AUTH_DEV=1`, activo en la pila local), la pantalla de ingreso muestra **Entrar como…** con los seis jugadores del realm local. En iOS y Android pide el código con el desafío y lo canjea en `/api/auth/canje`; en la web recibe la cookie. Ver [el entorno local](../docs/entorno-local.md#ingreso-de-prueba-sin-keycloak).

## Comandos (desde la raíz)

```sh
npm run app:tipos      # TypeScript
npm run app:exportar   # exportación web en app/dist, con base /jugar
npm run app:nativo -- ios                  # cliente de desarrollo en el simulador de iOS, API de eltru.co
npm run app:nativo -- android --api local  # en el emulador de Android, API de la pila local
```

`app:nativo` calcula la huella nativa con `@expo/fingerprint` (dependencias nativas, `app.json`, plugins). Si ya hay un build con esa huella en `~/.cache/truco/builds/<plataforma>-<huella>`, lo instala en segundos; si no, compila con `expo run:<plataforma>` (requiere Xcode o Android Studio) y lo guarda. Cambios solo de JavaScript no cambian la huella. Después arranca Metro y abre la app contra él.

- **Dispositivo:** usa el simulador de iPhone encendido o el primero disponible, y el emulador de Android en marcha o el primer AVD. Para elegir uno, `--dispositivo "iPhone 17"` (nombre o UDID) o `--dispositivo Pixel_API_36` (AVD o serie de adb). `--recompilar` compila aunque haya un build guardado.
- **API:** `--api vps` (predeterminado) usa `https://eltru.co`; `--api local` usa la pila de `docker compose up --build` en `http://localhost:8081` (o `WEB_PORT` de `.env.trabajo`). Llega a la app por `EXPO_PUBLIC_API_URL`, que Metro incrusta en el JavaScript: no cambia la huella. En Android la app traduce `localhost` a `10.0.2.2`, así un mismo Metro sirve las dos plataformas.
- **Metro:** escucha en `METRO_PORT` de `.env.trabajo` o en el 8082, porque la web local ocupa el 8081. Si ya hay un Metro en ese puerto, el comando lo reusa (con la API con la que arrancó) y solo instala y abre la app. Ese mismo Metro sirve la web en `http://localhost:8082`.

La web exportada se prueba con la pila: `docker compose up --build` y `http://localhost:8081/jugar/`.

## Enlaces que abren la app

Con la app instalada, estos enlaces de `https://eltru.co` abren su pantalla en la app; sin la app siguen abriendo la web. El mapeo está en `rutaDelSistema` (`src/ingreso/retorno.ts`), que usa `+native-intent.tsx`, y se prueba en `tests/unit/app-enlaces-universales.test.ts`.

| Enlace | Pantalla |
| --- | --- |
| `/jugar/?invitacion=<token>`, `/app/?invitacion=…`, `/app/invitacion/<token>` | `/invitacion/<token>` |
| `/jugar/?mesa=<id>`, `/volver/?mesa=<id>`, `/app/sala/<id>` | `/sala/<id>` |
| `/jugar/?mirar=<id>`, `/app/?mirar=…`, `/app/mirar/<id>` | `/mirar/<id>` |

Las rutas profundas valen también bajo `/jugar/` para cuando la exportación web se mude ahí. `/aprender/`, `/reglas/`, `/api/`, `/realms/` y el resto del sitio no abren la app. En iOS, `/jugar/` y `/volver/` sin parámetros tampoco; los filtros de Android no distinguen la consulta, así que en Android esos enlaces abren el salón. Un enlace del dominio con datos inválidos abre el inicio. Safari y Chrome no entregan a la app la navegación dentro del mismo sitio: el enlace tiene que llegar desde otra app (WhatsApp, correo, notas).

- **iOS:** `ios.associatedDomains` (`applinks:eltru.co`) en `app.json`, y `/.well-known/apple-app-site-association`.
- **Android:** `android.intentFilters` con `autoVerify` para `/jugar`, `/volver` y `/app`, y `/.well-known/assetlinks.json`.

### Cargar los datos de las cuentas

La imagen web genera los dos archivos al construirse con `scripts/enlaces-app.mjs`, a partir de dos variables del archivo de entorno del servidor (`infra/produccion/env.ejemplo`). Sin una variable no existe el archivo de esa plataforma: el servidor responde 404 y los enlaces abren la web. `npm run check:production` avisa mientras falten.

1. **`APPLE_TEAM_ID`:** el Team ID de 10 caracteres de la cuenta de Apple Developer (developer.apple.com → Membership details). Es el mismo que usa Sign in with Apple. El identificador `co.eltru.app` tiene que tener la capacidad Associated Domains; EAS Build la activa al firmar con el `app.json`.
2. **`ANDROID_CERT_SHA256`:** las huellas SHA-256 de los certificados que firman la app, separadas por comas, con o sin `:`. La de Play sale de Play Console → Prueba y lanzamiento → Integridad de la app → Firma de apps (certificado de la clave de firma de apps). Si se distribuyen builds firmados con la clave de subida o con la de EAS (`eas credentials`), agregá esa huella. Para probar un build de desarrollo, la de la clave de depuración:

   ```sh
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep SHA256
   ```

3. Reconstruí la imagen web: `docker compose -f compose.production.yaml up -d --build web`.
4. Comprobá que el servidor los entrega directo y como JSON:

   ```sh
   curl -sSI https://eltru.co/.well-known/apple-app-site-association
   curl -sS https://eltru.co/.well-known/assetlinks.json
   ```

   Apple los lee a través de su CDN, que puede tardar en actualizarse: `curl -sS https://app-site-association.cdn-apple.com/a/v1/eltru.co`. Google: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://eltru.co&relation=delegate_permission/common.handle_all_urls`.

`CHECK_STACK=1 npm run check` construye la imagen con datos inventados y comprueba los dos archivos en nginx y en Caddy (`scripts/verificar-enlaces-app.mjs`).

### Probarlos en el simulador y el emulador

El esquema `eltruco://` no depende de las cuentas:

```sh
xcrun simctl openurl booted "eltruco://invitacion/abc"
```

```sh
adb shell am start -a android.intent.action.VIEW -d "eltruco://mirar/<id>"
```

En Android, un enlace `https://` dirigido al paquete prueba el filtro y el mapeo aunque el dominio no esté verificado:

```sh
adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://eltru.co/jugar/?invitacion=abc" co.eltru.app
```

Con los datos cargados, sin nombrar el paquete (lo resuelve el sistema) y revisando la verificación:

```sh
adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://eltru.co/volver/?mesa=<id>"
```

```sh
adb shell pm verify-app-links --re-verify co.eltru.app
```

```sh
adb shell pm get-app-links co.eltru.app
```

`get-app-links` tiene que mostrar `eltru.co: verified`. En iOS, con el Team ID cargado y la app firmada por ese equipo:

```sh
xcrun simctl openurl booted "https://eltru.co/jugar/?invitacion=abc"
```

Para no esperar la CDN de Apple durante el desarrollo, se puede usar temporalmente `applinks:eltru.co?mode=developer` en un build de desarrollo, con Ajustes → Desarrollador → Associated Domains Development activado en el dispositivo.

## Versión, íconos y pantalla de inicio

- **Versión:** la visible (`version`) está en `app.json` y se cambia a mano. El número de build (`ios.buildNumber` y `android.versionCode`) lo agrega `app.config.ts` con `git rev-list --count HEAD`, así que crece con cada commit de `main`. En un checkout sin historia completa, definí `TRUCO_BUILD=<número>`; sin git (la imagen de Docker de la web) queda en 1 y no se usa.
- **Íconos:** `npm run app:iconos` (desde la raíz) genera `assets/icono/` a partir de `public/favicon.svg` con `scripts/app-iconos.mjs` y sharp, sin servicios externos. Salen el ícono de iOS (1024×1024, opaco), el adaptativo de Android (frente, fondo y monocromático), el favicon de la web y la carta de la pantalla de inicio. Si cambia la marca, editá el SVG y volvé a generar; `tests/unit/app-builds.test.ts` comprueba tamaños y transparencia.
- **Pantalla de inicio:** `expo-splash-screen` muestra la carta sobre el papel crema y `src/app/_layout.tsx` la mantiene hasta que cargan las tipografías.
- **Permisos:** `android.blockedPermissions` saca almacenamiento, superposición, micrófono, cámara, ubicación y biometría; `expo-audio` va sin micrófono ni audio en segundo plano y `expo-secure-store` sin Face ID. En Release, Android queda con `INTERNET`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK`, `VIBRATE` (hápticos) y `MODIFY_AUDIO_SETTINGS` (sonido), que no piden confirmación; el build de depuración agrega los del cliente de desarrollo. Para revisar lo que pide un build: `npx expo prebuild --clean` en una copia descartable y mirá `AndroidManifest.xml` e `Info.plist`.
- Si `pod install` falla con `Unicode Normalization not appropriate for ASCII-8BIT`, exportá `LANG=en_US.UTF-8`.
