# App de El Truco

App Expo (SDK 58, Expo Router, TypeScript) para iOS, Android y web. Usa builds de desarrollo, no Expo Go. Diseño: [plan general](../docs/superpowers/specs/2026-11-23-app-movil-design.md) y [etapa 4](../docs/superpowers/plans/2026-11-24-etapa-4-app-expo.md).

## Estructura

- `src/app/`: rutas de Expo Router. `index.tsx` es el ingreso o el perfil; `mesa.tsx` es provisoria hasta la parte 4d.
- `src/api/cliente.ts`: rutas de ingreso y perfil sobre el cliente compartido `@eltruco/cliente` (`paquetes/cliente`), que pone `Authorization: Bearer` en HTTP y en el WebSocket `truco.v1`. Expone `pedir` y `vivo` para el salón y la mesa.
- `src/ingreso/`: PKCE, retorno `eltruco://ingreso`, canje y almacenamiento de la sesión. Lo puro se prueba en `tests/unit/app-ingreso.test.ts`; `plataforma.ts` lo une con `expo-crypto`, `expo-web-browser` y `expo-secure-store`.
- `src/tema.ts`: paleta y tipografías de la mesa nueva.

## Ingreso

- **iOS y Android:** abre `/api/auth/login?app=<desafío>` en el navegador del sistema, vuelve por `eltruco://ingreso?codigo=…`, canjea el código con `POST /api/auth/canje` y guarda la sesión en el almacenamiento seguro. Cada pedido lleva `Authorization: Bearer`.
- **Web:** se sirve en `/app/` del mismo origen que la API y usa la cookie `truco_sesion`.

## Comandos (desde la raíz)

```sh
npm run app:tipos      # TypeScript
npm run app:exportar   # exportación web en app/dist, con base /app
npm --workspace app run ios       # build de desarrollo en el simulador (requiere Xcode)
npm --workspace app run android   # build de desarrollo en Android (requiere Android Studio)
```

En las apps, la API es `https://eltru.co`. Para la pila local, definí `EXPO_PUBLIC_API_URL=http://localhost:8081` (en Android, `http://10.0.2.2:8081`) y usá otro puerto para Metro, que también toma el 8081: `npm --workspace app run ios -- --port 8082`. La web exportada se prueba con la pila: `docker compose up --build` y `http://localhost:8081/app/`.

## Versión, íconos y pantalla de inicio

- **Versión:** la visible (`version`) está en `app.json` y se cambia a mano. El número de build (`ios.buildNumber` y `android.versionCode`) lo agrega `app.config.ts` con `git rev-list --count HEAD`, así que crece con cada commit de `main`. En un checkout sin historia completa, definí `TRUCO_BUILD=<número>`; sin git (la imagen de Docker de la web) queda en 1 y no se usa.
- **Íconos:** `npm run app:iconos` (desde la raíz) genera `assets/icono/` a partir de `public/favicon.svg` con `scripts/app-iconos.mjs` y sharp, sin servicios externos. Salen el ícono de iOS (1024×1024, opaco), el adaptativo de Android (frente, fondo y monocromático), el favicon de la web y la carta de la pantalla de inicio. Si cambia la marca, editá el SVG y volvé a generar; `tests/unit/app-builds.test.ts` comprueba tamaños y transparencia.
- **Pantalla de inicio:** `expo-splash-screen` muestra la carta sobre el papel crema y `src/app/_layout.tsx` la mantiene hasta que cargan las tipografías.
- **Permisos:** `android.blockedPermissions` saca almacenamiento, superposición, micrófono, cámara, ubicación y biometría; `expo-audio` va sin micrófono ni audio en segundo plano y `expo-secure-store` sin Face ID. En Release, Android queda con `INTERNET`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK`, `VIBRATE` (hápticos) y `MODIFY_AUDIO_SETTINGS` (sonido), que no piden confirmación; el build de depuración agrega los del cliente de desarrollo. Para revisar lo que pide un build: `npx expo prebuild --clean` en una copia descartable y mirá `AndroidManifest.xml` e `Info.plist`.
- Si `pod install` falla con `Unicode Normalization not appropriate for ASCII-8BIT`, exportá `LANG=en_US.UTF-8`.
