# App de El Truco

App Expo (SDK 58, Expo Router, TypeScript) para iOS, Android y web. Usa builds de desarrollo, no Expo Go. Diseño: [plan general](../docs/superpowers/specs/2026-11-23-app-movil-design.md) y [etapa 4](../docs/superpowers/plans/2026-11-24-etapa-4-app-expo.md).

## Estructura

- `src/app/`: rutas de Expo Router. `index.tsx` es el ingreso o el perfil; `mesa.tsx` es provisoria hasta la parte 4d.
- `src/api/cliente.ts`: único archivo que conoce la API. Lo reemplaza `paquetes/cliente` (parte 4a).
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
