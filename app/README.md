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
npm run app:nativo -- ios                  # cliente de desarrollo en el simulador de iOS, API de eltru.co
npm run app:nativo -- android --api local  # en el emulador de Android, API de la pila local
```

`app:nativo` calcula la huella nativa con `@expo/fingerprint` (dependencias nativas, `app.json`, plugins). Si ya hay un build con esa huella en `~/.cache/truco/builds/<plataforma>-<huella>`, lo instala en segundos; si no, compila con `expo run:<plataforma>` (requiere Xcode o Android Studio) y lo guarda. Cambios solo de JavaScript no cambian la huella. Después arranca Metro y abre la app contra él.

- **Dispositivo:** usa el simulador de iPhone encendido o el primero disponible, y el emulador de Android en marcha o el primer AVD. Para elegir uno, `--dispositivo "iPhone 17"` (nombre o UDID) o `--dispositivo Pixel_API_36` (AVD o serie de adb). `--recompilar` compila aunque haya un build guardado.
- **API:** `--api vps` (predeterminado) usa `https://eltru.co`; `--api local` usa la pila de `docker compose up --build` en `http://localhost:8081` (o `WEB_PORT` de `.env.trabajo`). Llega a la app por `EXPO_PUBLIC_API_URL`, que Metro incrusta en el JavaScript: no cambia la huella. En Android la app traduce `localhost` a `10.0.2.2`, así un mismo Metro sirve las dos plataformas.
- **Metro:** escucha en `METRO_PORT` de `.env.trabajo` o en el 8082, porque la web local ocupa el 8081. Si ya hay un Metro en ese puerto, el comando lo reusa (con la API con la que arrancó) y solo instala y abre la app. Ese mismo Metro sirve la web en `http://localhost:8082`.

La web exportada se prueba con la pila: `docker compose up --build` y `http://localhost:8081/app/`.
