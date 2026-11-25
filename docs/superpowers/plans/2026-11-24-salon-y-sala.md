# Salón, creación de mesa y sala de espera en la app (etapa 4c): plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: superpowers:executing-plans (o subagent-driven-development). Los pasos usan casillas (`- [ ]`).

**Objetivo:** llevar a la app Expo (`app/`) el salón en vivo, la creación de mesa, la sala de espera con invitación, la entrada de espectador, el ingreso por invitación y la vuelta a una mesa en curso, con los enlaces `?invitacion=`, `?mesa=` y `?mirar=`.

**Arquitectura:** la lógica sin React Native (cuerpo de la mesa nueva, enlaces, textos de asientos, consulta periódica, memoria de la última mesa, precarga) vive en módulos puros de `app/src/salon/`, probados con `node --test` en `tests/unit/app-salon.test.ts`. Las pantallas de Expo Router solo conectan esos módulos con `@eltruco/cliente` (`useMesa`, `pedir`), `Share`, `AppState` y `expo-asset`. La entrada a la mesa y al visor de espectador está en un solo archivo, `app/src/mesa/entrada.tsx`, que la parte 4d reemplaza.

**Tecnología:** Expo SDK 58, Expo Router, React Native `Share`/`AppState`/`Image`, `expo-asset`, `@eltruco/cliente`, `@eltruco/motor`; Playwright sobre la exportación web `/app/` con la pila local.

**Diseños:** [plan de la etapa 4](2026-11-24-etapa-4-app-expo.md), [mesa nueva](../specs/2026-11-24-mesa-nueva-design.md) (lenguaje visual, señas, precarga) y [base de la app](2026-11-24-app-base.md).

## Restricciones globales

- Mismos endpoints que la web: `GET /api/salon/mesas` (15 s), `GET /api/salon/mesas/<id>` (2 s), `GET /api/modalidades`, `POST /api/mesas`, `GET /api/invitaciones/<token>`, `POST /api/invitaciones/<token>/unirse`, `POST /api/mesas/<id>/computadoras`, `GET /api/mesas/<id>` y su WebSocket. Sin cambios en el servidor.
- 2 contra 2 se crea siempre con `formato: "pairs-private-senas"` y `versionSenas: versionSenasPie`. Nunca se ofrece la seña elegida a mano ni una casilla de señas.
- 3 contra 3 solo aparece si `/api/modalidades` incluye `"3v3"`; lleva `formato: "triples"` y `versionSenas: versionSenasPie` si `senasPie` incluye `"3v3"`. Nunca es pública.
- Pública solo si `jugador.salonHabilitado` y la modalidad no es 3 contra 3. La meta se manda solo si difiere de `metaPorModalidad[modo]` y es válida según `esMetaDeChico`.
- Un enlace con `mirar` jamás se interpreta como invitación ni como mesa propia (igual que `Sala.tsx`).
- Memoria de la última mesa en la clave `truco.ultima-mesa.<jugador>`, la misma que usa `/jugar/`: en la web, `localStorage`; en las apps, `expo-secure-store`.
- Lenguaje visual de la mesa nueva: paño `#3a614a → #1c392d`, papel `#faf8f0`, píldoras redondeadas, hojas; DM Serif Text en títulos y DM Sans en el texto (`app/src/tema.ts`).
- App fijada en vertical (`orientation: "portrait"`): sin sugerencia de girar el teléfono.
- Textos en español rioplatense.

## Revisión: casos que ninguna prueba cubre por sí sola

1. Alguien sin sesión abre `/app/?invitacion=…` en la web: tras ingresar vuelve a la invitación, no al salón vacío. → el destino se guarda en `sessionStorage` (`truco.app.destino`) antes de ir al ingreso y se retoma al volver; prueba de `destinoPendiente`.
2. Un enlace `?mirar=<id>&invitacion=<token>` (alguien pegó dos parámetros): abre el visor y no ocupa un asiento. → prueba de `destinoDeEnlace`.
3. La última mesa recordada ya no existe o el jugador fue retirado (403/404): «Volver a mi mesa» desaparece y la sala muestra el error con «Volver al salón». → prueba de `crearMemoriaDeMesa.olvidar` solo si coincide el id.
4. La app pasa a segundo plano en el salón: la consulta se suspende y retoma al volver, sin acumular pedidos. → prueba de `crearConsulta` con `suspender`/`reanudar`.
5. El navegador no tiene `navigator.share` o el jugador cancela la hoja: copiar al portapapeles, y cancelar no muestra error. → pruebas de `compartirInvitacion`.

---

### Tarea 1: lógica pura del salón y la sala (TDD)

**Archivos:**
- Crear: `paquetes/cliente/src/salon.ts` (mueve `ResumenMesa` y `participantesMesa` de `src/components/jugar/resumen-salon.ts`; `SalonEnVivo.tsx` y `VisorEspectador.tsx` lo importan de ahí)
- Crear: `app/src/salon/mesa-nueva.ts`, `app/src/salon/enlaces.ts`, `app/src/salon/asientos.ts`, `app/src/salon/memoria.ts`, `app/src/salon/consulta.ts`, `app/src/salon/compartir.ts`
- Prueba: `tests/unit/app-salon.test.ts`

**Interfaces (producidas):**
- `modalidadesOfrecidas(modos: Modo[]): Modo[]` — orden 1v1, 2v2, 3v3; 3v3 solo si está en `modos`.
- `cuerpoDeMesaNueva({ modo, meta, publica, salonHabilitado, senasPie }: { modo: Modo; meta: number; publica: boolean; salonHabilitado: boolean; senasPie: Modo[] }): Record<string, unknown>`
- `textoDeMeta(texto: string): { meta: number; valida: boolean; ayuda: string }` — ayuda = `mitadesDelChico(meta)` o «Elegí un número par desde 2.»
- `type Destino = { tipo: "mirar"; id: string } | { tipo: "invitacion"; token: string } | { tipo: "mesa"; id: string }`
- `destinoDeEnlace(params: Record<string, string | string[] | undefined>): Destino | null` — `mirar` y `mesa` exigen un UUID; `invitacion` exige `[A-Za-z0-9_-]{1,80}`.
- `rutaDe(destino: Destino): string` — `/mirar/<id>`, `/invitacion/<token>`, `/sala/<id>`.
- `tokenDeInvitacion(enlace: string): string | null`
- `enlaceParaCompartir(invitacion: string, origenWeb: string | null): string` — con origen web: `<origen>/app/?invitacion=<token>`; sin él (apps): el enlace del servidor tal cual (`/jugar/?invitacion=`), que abre cualquiera.
- `destinoPendiente(guardado: { leer(): string | null; guardar(v: string | null): void }, actual: Destino | null): Destino | null` — guarda el actual si hay; si no, devuelve y borra el guardado.
- `faltanParaRepartir(faltan: number): string` — «Falta un jugador para repartir.», «Faltan N jugadores para repartir.», «La mesa está completa.»
- `papelDelAsiento(mesa: Pick<Mesa, "modo" | "miAsiento">, asiento: Asiento): string` — «Equipo N» en parejas y tercetos; «Tu asiento»/«Rival» en duelo.
- `crearMemoriaDeMesa(guardado: Guardado)` → `{ leer(jugador): Promise<string | null>; recordar(jugador, id): Promise<void>; olvidar(jugador, id): Promise<void> }` (`Guardado` de `app/src/ingreso/almacen.ts`).
- `crearConsulta<T>({ leer, intervalo, alCambiar, programar? }: { leer: (etag: string | null, signal: AbortSignal) => Promise<Lectura<T>>; intervalo: number; alCambiar: (v: VistaConsulta<T>) => void; programar?: { setTimeout; clearTimeout } })` → `{ iniciar(); suspender(); reanudar(); reintentar(); detener() }`, con `Lectura<T> = { estado: 200; datos: T; etag: string | null } | { estado: 304 | 401 | 404 }` y `VistaConsulta<T> = { datos: T | null; estado: "cargando" | "listo" | "error" | "no-disponible" | "sin-sesion" }`. Misma máquina que `useConsultaSalon.ts`.
- `compartirInvitacion({ enlace, compartir, copiar }: { enlace: string; compartir?: (e: string) => Promise<"compartida" | "cancelada">; copiar?: (e: string) => Promise<void> }): Promise<string>` — «» si se compartió o canceló, «Invitación copiada.» si copió, «Copiá el enlace para compartirlo.» si nada anduvo.

- [ ] Pruebas que fallan:
  - `cuerpoDeMesaNueva` en 2v2 da `formato: "pairs-private-senas"` y `versionSenas: versionSenasPie` aunque `senasPie` esté vacío; en 1v1 no lleva ni formato ni versión; en 3v3 lleva `formato: "triples"`, `publica: false` y la versión solo con `senasPie: ["3v3"]`; `publica` es `false` sin salón; `meta` solo aparece si difiere de la de la modalidad.
  - `modalidadesOfrecidas(["1v1","2v2"])` no incluye 3v3; con 3v3 la incluye al final.
  - `textoDeMeta("31")` es inválida con «Elegí un número par desde 2.».
  - `destinoDeEnlace({ mirar: uuid, invitacion: "abc" })` es `mirar`; `{ mesa: "x" }` es `null`; `{ invitacion: "a_b-1" }` es invitación; arreglos toman el primer valor.
  - `enlaceParaCompartir("https://eltru.co/jugar/?invitacion=T", "http://localhost:18081")` da `http://localhost:18081/app/?invitacion=T`; con `null` devuelve el original.
  - `destinoPendiente` guarda, devuelve una sola vez y después `null`.
  - `faltanParaRepartir(0|1|3)` y `papelDelAsiento` en duelo y parejas.
  - `crearMemoriaDeMesa`: recordar y leer por jugador; `olvidar` con otro id no borra.
  - `crearConsulta` con temporizadores falsos: 200 → listo y reprograma; 304 conserva los datos; 401 → `sin-sesion` y no reprograma; error → `error` con los datos previos; `suspender` cancela el temporizador y `reanudar` lee de inmediato; manda el `etag` recibido.
  - `compartirInvitacion`: compartida → «»; cancelada → «»; `compartir` falla → copia; sin `compartir` → copia; ambas fallan → «Copiá el enlace para compartirlo.».
- [ ] Implementar; `npm run test:unit` y `npm run app:tipos` en verde; commit.

### Tarea 2: precarga de cartas y gancho de CanvasKit (TDD)

**Archivos:**
- Crear: `app/src/cartas/imagenes.ts` (41 `require` estáticos de `public/img/cartas/tatu/`: 40 cartas de `mazo` y `reverso`), `app/src/precarga/precarga.ts` (puro), `app/src/precarga/usePrecargaDeMesa.ts`
- Modificar: `app/package.json` (`expo-asset`), `app/metro.config.js` si Metro no ve `public/`, `infra/web.Dockerfile` y `.dockerignore` (copiar `public/img/cartas/tatu` a la etapa `app`)
- Prueba: `tests/unit/app-salon.test.ts`

**Interfaces:**
- `imagenesDeCartas: Record<CardId | "reverso", number>`
- `crearPrecarga(tareas: () => Array<() => Promise<unknown>>)` → `precargar(): Promise<void>` que corre una sola vez y, si falla, permite reintentar.
- `registrarPrecargaWeb(tarea: () => Promise<unknown>): void` — el gancho que conecta 4d con CanvasKit; solo corre en la web.
- `usePrecargaDeMesa(): void` — se llama en el salón, la creación y la sala.

- [ ] Pruebas que fallan: las claves de `imagenesDeCartas` (leídas del texto del archivo) son exactamente `mazo` + `reverso` (41) y cada archivo existe; `crearPrecarga` corre cada tarea una vez aunque se llame dos veces, y reintenta tras un fallo.
- [ ] Implementar: nativo con `Asset.loadAsync`; web con `Image.prefetch(Asset.fromModule(m).uri)` más las tareas registradas.
- [ ] `npm run app:exportar` deja las imágenes bajo `app/dist/` y bajo `/app/` en las URL; commit.

### Tarea 3: pantallas y rutas

**Archivos:**
- Crear: `app/src/app/perfil.tsx` (el perfil que hoy está en `index.tsx`), `app/src/app/crear.tsx`, `app/src/app/sala/[id].tsx`, `app/src/app/invitacion/[token].tsx`, `app/src/app/mirar/[id].tsx`, `app/src/mesa/entrada.tsx`, `app/src/salon/useConsulta.ts`, `app/src/salon/plataforma.ts` (memoria, `AppState`, `Share`, portapapeles), `app/src/componentes/` (píldora, hoja de asiento)
- Modificar: `app/src/app/index.tsx` (ingreso o salón; resuelve `?invitacion=`, `?mesa=`, `?mirar=`), `app/src/app/mesa.tsx` (recibe `?id=` y delega en `entrada.tsx`), `app/src/api/cliente.ts` (`jugador()` conserva `salonHabilitado`; agrega `consultar(ruta, etag, signal)` con `If-None-Match`)

- [ ] Salón: «Mesas en juego», «Crear mesa», «Volver a mi mesa» si la memoria tiene una, enlace «Tu perfil». Cada mesa en una píldora de paño: «Duelo»/«Parejas», `participantesMesa`, «Mano N · A a B de M» y «Mirar». Estados «Buscando mesas…», «Todavía no hay mesas en juego.», «No se pudo cargar la lista de mesas.»/«Reconectando con el salón…» con «Reintentar». Sin salón habilitado: el texto «El salón está cerrado. Podés crear una mesa privada.»
- [ ] Crear: radios de modalidad («1 contra 1 · Mano a mano», «2 contra 2 · En parejas · con señas automáticas al pie», «3 contra 3 · En tercetos»), campo «Tantos para ganar el chico», casilla «Mostrar en el salón» (si corresponde) con el texto de visibilidad de la web, botones «Crear mesa» y «Jugar con computadoras». Al crear: `router.replace("/sala/<id>")`.
- [ ] Sala de espera: «Esperando jugadores» / «Repartiendo las cartas…» / «Mesa cancelada», chico a M tantos, señas al pie si corresponde, `faltanParaRepartir`, invitación con el enlace seleccionable y «Compartir invitación», asientos con `papelDelAsiento` y «Agregar computadora» para quien creó la mesa. Con `mesa.lista`: `entrarALaMesa(id)`. Recuerda la mesa; con 403/404 la olvida.
- [ ] Invitación: «Te invitaron a una mesa», visibilidad, «Ocupar mi asiento» y «Volver al salón»; si ya está sentado, va a la sala.
- [ ] `entrada.tsx`: `entrarALaMesa(id)` (`router.replace("/mesa?id=<id>")`), `mirarMesa(id)` (`router.push("/mirar/<id>")`), `MesaEnJuego({ id })` y `VisorDeEspectador({ id })` provisorios: la mesa provisoria dice «Mesa en juego» y enlaza la mesa en la web; el visor consulta `/api/salon/mesas/<id>` cada 2 s y muestra participantes, mano y tanteador con «Volver al salón». 4d reemplaza solo este archivo.
- [ ] Sin sesión con un destino: el título dice «Te invitaron a una mesa» o «Ingresá para mirar la mesa»; en la web se guarda el destino antes de ingresar.
- [ ] `npm run app:tipos` y `npm run app:exportar` pasan; commit.

### Tarea 4: recorrido en la pila local

**Archivos:**
- Crear: `scripts/verificar-app-salon.mjs`
- Modificar: `scripts/verificar-app-navegador.mjs` (el perfil está en «Tu perfil» y la mesa provisoria se abre con `?id=`), `scripts/verificar-stack.sh`. Las 41 cartas se comprueban en el recorrido: responden 200 desde `/app/assets/` mientras el jugador está en el salón.

- [ ] `verificar-app-salon.mjs` con ana (anfitriona), bruno (invitado) y clara (espectadora), en teléfono: ana crea 2 contra 2 pública desde `/app/`; `/api/mesas/<id>` tiene `formato: "pairs-private-senas"` y `versionSenas` igual a `versionSenasPie`; la sala muestra el enlace `/app/?invitacion=`; bruno lo abre sin sesión, ingresa, vuelve a la invitación y ocupa su asiento; ana ve a bruno; clara ve la mesa en el salón y «Mirar» abre `/app/mirar/<id>`; ana agrega dos computadoras, todos pasan a `/app/mesa?id=<id>`; ana vuelve al salón y ve «Volver a mi mesa». En escritorio: 1 contra 1 con computadoras llega a la mesa.
- [ ] `CHECK_STACK=1 npm run check` pasa; commit.

### Tarea 5: PR

- [ ] `npm ci` y `CHECK_STACK=1 npm run check` sobre el último commit; PR con `Closes #366`, resultados y capturas. Sin Xcode: anotarlo.
