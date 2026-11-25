# Cliente compartido (etapa 4a) — plan de implementación

> **Para agentes:** se ejecuta tarea por tarea con `superpowers:executing-plans`. Los pasos usan casillas (`- [ ]`).

**Objetivo:** crear el workspace `paquetes/cliente` (`@eltruco/cliente`) con el cliente HTTP y WebSocket y la lógica de presentación sin DOM, para que la web Astro y la app Expo la compartan. La web pasa a importarlo sin ningún cambio visible.

**Arquitectura:** igual que `paquetes/motor`: TypeScript sin compilar, `exports: { "./*": "./src/*" }`, imports internos con `./archivo.ts` para que Node quite los tipos en las pruebas. Lo que toca el DOM (`window`, `document`, `HTMLImageElement`, JSX) queda en `src/components/jugar/`, que pasa a ser un adaptador fino. La URL base y la autenticación se inyectan con `crearCliente(opciones)`; la espera de imágenes y los avisos de red de `window` se inyectan en los hooks.

**Tecnología:** TypeScript con eliminación de tipos de Node 24, React 19 (hooks), `node:test`.

**Diseños:** [plan de la app](../specs/2026-11-23-app-movil-design.md), [servidor para la app](../specs/2026-11-24-servidor-app-design.md), plan de partes `2026-11-24-etapa-4-app-expo.md` y [mesa nueva](../specs/2026-11-24-mesa-nueva-design.md) (PR #358).

## Restricciones globales

- Mismo protocolo `truco.v1` y mismos endpoints. No cambia el servidor.
- Web: cookie `truco_sesion` en el mismo origen, sin encabezado. App: `Authorization: Bearer <sesion>` en HTTP y en el upgrade del WebSocket («Si vienen los dos, manda el encabezado»).
- El paquete no usa `window`, `document`, `location` ni JSX. Lee `globalThis.location` solo si no se le dio una base, y solo al abrir el WebSocket (la sala se renderiza en el servidor con `client:load`).
- Solo sintaxis que Node puede borrar: nada de propiedades en parámetros del constructor ni `enum`.
- Cero cambios visibles: mismos textos, mismas clases, mismos tiempos.
- No se tocan los textos de los cantos (#356 los cambia). Solo se mueve el archivo con `git mv` para que el rebase siga el renombre.
- `package.json` y `package-lock.json` de la raíz se comparten con #360: cambios mínimos.

## Estructura

`paquetes/cliente/src/`:

| Archivo | Responsabilidad | Viene de |
| --- | --- | --- |
| `cliente.ts` | Tipos de mesa, `ErrorMesa`, `crearCliente`, `mensajeDe`, `idComando` | `jugar/cliente.ts` |
| `use-mesa.ts` | Hook `useMesa(cliente, id, recienCreada, avisos?)` | `jugar/cliente.ts` |
| `cartas.ts` | Catálogo de nombres de naipes | `src/lib/cartas.ts` (`git mv`) |
| `cantos.ts` | Textos de los cantos | `src/lib/cantos.ts` (`git mv`) |
| `cobros.ts` | `motivoDelCobro` | `src/lib/cobros.ts` (`git mv`) |
| `textos.ts` | `nombrar`, `tantos`, `descripcionDeJugada`, `vozDeIndicacion`, `descripcionDeIndicacion` | `HistorialDeMano.tsx` |
| `voces.ts` | `Voz`, `pausaDeVoz`, `vocesEnAccion`, `vocesEnReposo`, `useVozDelPie` | `Voz.tsx` |
| `vuelta-en-mesa.ts` | `vueltaEnMesa` | `jugar/vuelta-en-mesa.ts` |
| `turno.ts` | `tituloDeRespuesta`, `estadoDelTurno`, `palabraDeTercetos`, `tanteador` (datos) | `Tablero.tsx`, `Tercetos.tsx` |
| `secuencia-de-mesa.ts` | `useSecuenciaDeMesa` con espera inyectable, `entreCartas`, `vueltaCompleta`, `Paso` | `jugar/secuencia-de-mesa.ts` |
| `presentacion-vueltas.ts` | `pasosDeVueltas` | `jugar/presentacion-vueltas.ts` |
| `presentacion-tercetos.ts` | `pasosDeTercetos` | `jugar/presentacion-cantos-tercetos.ts` |

La API importa `cartas.ts` y `cantos.ts`: `api/Dockerfile` copia `paquetes/cliente` y lo enlaza como hace con el motor.

## Foco de revisión

1. App sin base y sin `location` (React Native): `vivo()` debe fallar con un error claro, no armar `ws://undefined`.
2. Sesión vacía o `null` en la app: no mandar `Authorization: Bearer ` vacío; caer al modo cookie.
3. Base con barra final (`https://eltru.co/`): no duplicar la barra en `https://eltru.co//api/...`.
4. Base `https:` → `wss:` y `http:` → `ws:` también cuando la base trae un camino.
5. Render en el servidor de Astro: importar el paquete no debe leer `window` ni `location`.

Cada punto tiene su prueba en la tarea 1 o en la guardia de la tarea 2.

---

### Tarea 1: workspace y cliente con autenticación inyectable

**Archivos:**
- Crear: `paquetes/cliente/package.json`, `paquetes/cliente/src/cliente.ts`
- Prueba: `tests/unit/paquete-cliente.test.ts`

**Interfaces producidas:**

```ts
export interface OpcionesCliente {
  base?: string;                                 // origen de la API; vacío: rutas relativas (web)
  sesion?: () => string | null | undefined;      // con valor: Authorization: Bearer
  fetch?: typeof fetch;
  WebSocket?: new (url: string, protocolos: string | string[], opciones?: { headers: Record<string, string> }) => WebSocket;
}
export interface Cliente {
  pedir<T>(ruta: string, datos?: object, signal?: AbortSignal): Promise<T>;
  vivo(ruta: string): WebSocket;                 // protocolo "truco.v1"
}
export function crearCliente(opciones?: OpcionesCliente): Cliente;
export class ErrorMesa extends Error { readonly status: number }
export const mensajeDe: (error: unknown) => string;
export function idComando(): string;
// Tipos: Modo, Jugador, Asiento, EdicionModelo, VersionesMesa, Mesa, Tipo, Eleccion, Partida, PartidaTercetos
```

- [ ] **Paso 1:** pruebas que fallan: `pedir` en modo cookie no manda `Authorization` y usa la ruta relativa; con `base` y `sesion` llama `https://eltru.co/api/x` con `Authorization: Bearer abc`; `sesion` vacía no manda encabezado; base con barra final; error HTTP → `ErrorMesa` con `status` y el `error` del cuerpo, o «No se pudo abrir la mesa.»; `vivo` convierte `https`→`wss` y `http`→`ws`, pasa `"truco.v1"` y el encabezado solo con sesión; sin base ni `location`, `vivo` lanza; `idComando` tiene forma de UUID v4.
- [ ] **Paso 2:** `node --test tests/unit/paquete-cliente.test.ts` falla porque falta el módulo.
- [ ] **Paso 3:** `package.json` (`@eltruco/cliente`, `private`, `type: module`, `exports`), agregar el workspace al lock con `npm install`, implementar `cliente.ts`. `EdicionModelo` se define acá y `src/lib/modelos.ts` la reexporta como tipo.
- [ ] **Paso 4:** la prueba pasa.
- [ ] **Paso 5:** commit.

### Tarea 2: mover textos, cantos, cobros y presentación pura

**Archivos:**
- Mover: `src/lib/{cartas,cantos,cobros}.ts` → `paquetes/cliente/src/`
- Crear: `textos.ts`, `voces.ts`, `vuelta-en-mesa.ts`, `turno.ts`
- Prueba: `tests/unit/paquete-cliente.test.ts`, `tests/unit/presentacion-mesa.test.ts`; actualizar imports de `tests/unit/cobros.test.ts` y `cartas.test.ts`

**Interfaces producidas:**

```ts
export function tituloDeRespuesta(mesa: Mesa, vista: Pick<VistaOnline, "pendiente" | "legales">, participantes: readonly number[]): string;
export function estadoDelTurno(mesa: Mesa, partida: Partida, vista: VistaOnline): { titulo: string; indicacion: string };
export function palabraDeTercetos(mesa: Mesa, partida: PartidaTercetos): string;
export interface Tanteador { meta: string; detalle: string; equipos: { equipo: number; nombre: string; puntos: number; cuenta: string }[] }
export function tanteador(meta: number, puntos: readonly [number, number], propio: number, equipo: (n: number) => string): Tanteador;
```

- [ ] **Paso 1:** pruebas que fallan: guardia de que `paquetes/cliente/src` solo importa `./x.ts`, `@eltruco/motor/x.ts` o `react`, y no menciona `window`, `document` ni `location` salvo `globalThis.location` en `cliente.ts`; `tituloDeRespuesta` en duelo («Responde Ana») y parejas; `estadoDelTurno` para resultado, flor, pendiente, turno propio y ajeno; `palabraDeTercetos` en chico terminado; `tanteador(30, [3, 16], 1, ...)` ordena el equipo propio primero con `cuentaDelChico`; `vueltaEnMesa` con vuelta parda y ganada; `vocesEnReposo` tras una flor querida.
- [ ] **Paso 2:** fallan.
- [ ] **Paso 3:** `git mv` de los tres archivos; mover las funciones sin cambiar textos; actualizar todos los importadores (web, `api/`, `scripts/`, `tests/`, `video/`) a `@eltruco/cliente/<archivo>.ts`; `api/Dockerfile` y su `.dockerignore` copian y enlazan el paquete.
- [ ] **Paso 4:** pasan, junto con `npm run test:unit`.
- [ ] **Paso 5:** commit.

### Tarea 3: hooks compartidos y adaptadores web

**Archivos:**
- Crear: `paquetes/cliente/src/{use-mesa,secuencia-de-mesa,presentacion-vueltas,presentacion-tercetos}.ts`
- Modificar: `src/components/jugar/{cliente.ts,secuencia-de-mesa.ts,presentacion-vueltas.ts,presentacion-cantos-tercetos.ts,Voz.tsx,HistorialDeMano.tsx,Tablero.tsx,Tercetos.tsx,VisorEspectador.tsx,...}`; borrar `vuelta-en-mesa.ts`

**Interfaces:**

```ts
export type AvisosDeRed = (al: { leer: () => void; sinRed: () => void }) => () => void;
export function useMesa(cliente: Cliente, id: string, recienCreada?: boolean, avisos?: AvisosDeRed):
  { ruta: string; mesa?: Mesa; partida?: PartidaJugador; conectada: boolean; reconexion: number; error: ErrorMesa | null; refrescar: RefObject<() => Promise<void>> };
export type EsperaDeNaipes = () => { listos: () => boolean; escuchar: (alCambiar: () => void) => () => void };
export function useSecuenciaDeMesa<T>(actual: T, presencioReparto: boolean, reconexion: number, pasosNuevos: ..., esperar?: EsperaDeNaipes):
  { partida: T; mostrandoCartas: boolean; voz?: Voz };
export function pasosDeVueltas(anterior, actual, presencioReparto, pendientes?): Paso<Partida | undefined>[];
export function pasosDeTercetos(anterior, actual, presencioReparto, pendientes?): Paso<PartidaTercetos>[];
```

- [ ] **Paso 1:** prueba que falla: `pasosDeVueltas` produce un paso por carta con `entreCartas` y `vueltaCompleta` al cerrar la vuelta, y un paso de voz con `pausaDeVoz` para un canto rival.
- [ ] **Paso 2:** falla.
- [ ] **Paso 3:** mover los hooks. La web conserva `useMesa(id, recienCreada)` (pasa `clienteWeb` y los avisos `online`/`offline`/`pageshow` de `window`), `useSecuenciaDeMesa` con la ref del tablero y la espera de `.j-jugada img`, y los componentes con JSX (`Tanteador` renderiza `tanteador(...)`).
- [ ] **Paso 4:** `npm run test:unit` y `npm run build` pasan.
- [ ] **Paso 5:** commit.

### Tarea 4: verificación completa y PR

- [ ] `npm ci`, `CHECK_STACK=1 npm run check` (con `TEST_PORT=4326` si 4322 está ocupado) y `git diff --check` sobre el último commit.
- [ ] PR listo con `Closes #359` y los resultados.
