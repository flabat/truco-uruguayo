# Geometría de la mesa nueva: plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usá superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** un módulo puro que, dado el tamaño de pantalla y el estado visible de la mesa, devuelve dónde va cada cosa de la mesa nueva. Es la única fuente de posiciones para la capa Skia y para la de vistas.

**Arquitectura:** paquete `paquetes/mesa-geometria` (`@eltruco/mesa-geometria`), TypeScript que Node.js 24 ejecuta sin compilar (solo sintaxis borrable: sin `enum` ni propiedades de parámetro, imports con `.ts`). La función `calcularMesa(entrada)` arma la pantalla por franjas verticales (barra, etiqueta del lance, paño, estado, mano, fila inferior, tira). Dentro del paño, cada lugar de la mesa cae en una fila y una columna fijas. Las medidas de las cartas salen de una búsqueda binaria: la carta de la mano más grande con la que el contenido del paño entra en la altura que queda. El mazo se ubica buscando el hueco libre más cercano a quien dio, del lado de su derecha.

**Tecnologías:** TypeScript, `node:test`, `node:assert/strict`. Sin dependencias.

**Diseño:** [Mesa nueva](../specs/2026-11-24-mesa-nueva-design.md) (PR #358) y sus maquetas `mesa-nueva/disposicion-v2.html`, `tercetos-v2.html`, `escritorio.html` y `hoja-cantar.html`. Plan de partes: [etapa 4](2026-11-24-etapa-4-app-expo.md), parte 4d. Issue #361.

## Restricciones globales

- Sin React, Expo ni DOM. Solo funciones puras y tipos.
- Unidades: puntos. Ángulos de rotación en grados, sentido horario, alrededor del centro del rectángulo.
- Proporción de carta Tatú: 384 × 596 (alto = ancho × 1,552).
- Una sola pantalla sin scroll desde 360 × 640.
- Corte de ancho: por debajo de 1024, tira inferior; desde 1024, paneles laterales y mesa en la columna central.
- Orden de asientos antihorario como `Tapete.tsx`: con `n` jugadores, el asiento a distancia `k = (asiento − abajo + n) % n` de quien está abajo va en `posiciones[n][k]` (2: abajo, frente; 4: abajo, derecha, frente, izquierda; 6: abajo, cerca-derecha, lejos-derecha, frente, lejos-izquierda, cerca-izquierda).
- Equipos por paridad del asiento (`equipoDelAsiento` del motor).
- El mazo va a la derecha de quien dio, desde su punto de vista, del lado de quien es mano.
- Ninguna hoja tapa la mano: con hoja abierta, la mano sube y se achica.
- Textos, nombres y comentarios en español rioplatense.

## Review Focus

1. Hoja con un alto mayor que la pantalla: el alto se recorta y la mano sigue entera a la vista.
2. Mano propia con 0, 1 o 2 cartas (ya jugó): el abanico se arma con las que quedan y no se sale.
3. Pico a pico sin que quien mira juegue el duelo (espera su turno o es espectador): el compañero activo tiene su lugar y no pisa nada.
4. Anchos justo en el corte (1023 y 1024): cambia la disposición sin superposiciones.
5. Entradas imposibles (asiento fuera de rango, `cartas` de otro largo, duelo de dos compañeros): error claro en vez de geometría rota.

Cada uno tiene su prueba en la tarea que lo implementa.

---

## Archivos

- `paquetes/mesa-geometria/package.json`: workspace, `exports` a `src/index.ts`.
- `src/tipos.ts`: tipos de entrada y salida.
- `src/rect.ts`: `cajaDeCarta`, `seCortan`, `unir`, `contiene`.
- `src/asientos.ts`: lugares por modalidad, validación de la entrada y forma de cada asiento en el pico a pico.
- `src/mesa.ts`: `calcularMesa`.
- `src/index.ts`: reexporta lo público.
- `test/rect.test.ts`, `test/asientos.test.ts`, `test/mesa.test.ts`, `test/barrido.test.ts`.
- `package.json` (raíz): `test:unit` suma `paquetes/*/test/*.test.ts`.

## Tipos (fijos para todas las tareas)

```ts
export type Modalidad = "1v1" | "2v2" | "3v3";
export type Lance = { tipo: "redondilla" } | { tipo: "pico"; activos: readonly [number, number] };
export interface EntradaMesa {
  ancho: number; alto: number;
  modalidad: Modalidad;
  lance?: Lance;              // solo 3v3; por defecto redondilla
  propio: number | null;      // null = espectador
  vistaDesde?: number;        // espectador: asiento que queda abajo (por defecto 0)
  dador: number; mano: number;
  cartas: readonly number[];  // cartas en mano por asiento, 0 a 3; largo = jugadores
  hoja?: { alto: number } | null;
}
export interface Rect { x: number; y: number; ancho: number; alto: number }
export interface Carta extends Rect { rotacion: number }
export type Lugar = "abajo" | "frente" | "derecha" | "izquierda" | "cerca-derecha" | "lejos-derecha" | "lejos-izquierda" | "cerca-izquierda";
export type Forma = "completo" | "circulo" | "punto";
export interface GeometriaAsiento {
  asiento: number; lugar: Lugar; forma: Forma; activo: boolean;
  rotulo: Rect | null;        // nombre y papel (vistas); null solo el propio con hoja abierta
  dorsos: Carta[];            // vacío para el propio jugador (ve su mano) y para los puntos
  jugada: Carta | null;       // dónde cae su carta de esta vuelta
  ancla: { x: number; y: number }; // origen de las animaciones de ese asiento
}
export interface Geometria {
  disposicion: "telefono" | "escritorio";
  pantalla: Rect; columna: Rect; barra: Rect; lance: Rect | null;
  pano: Rect;                 // destino del arrastre
  asientos: GeometriaAsiento[]; // índice = número de asiento
  mazo: { muestra: Carta; mazo: Carta; rotulo: Rect };
  estado: Rect;
  mano: Carta[];              // vacío para el espectador
  cantos: Rect | null; espectador: Rect | null;
  tira: Rect | null; paneles: { izquierdo: Rect; derecho: Rect } | null;
  hoja: Rect | null;
}
```

---

### Tarea 1: paquete y geometría de rectángulos

**Archivos:** crear `paquetes/mesa-geometria/{package.json,src/tipos.ts,src/rect.ts,src/index.ts,test/rect.test.ts}`; modificar `package.json` (`test:unit`).

**Interfaces producidas:** `cajaDeCarta(c: Carta): Rect` (caja alineada a los ejes de la carta rotada), `seCortan(a: Rect, b: Rect): boolean` (intersección de área positiva; tocarse no cuenta), `unir(rs: readonly Rect[]): Rect`, `contiene(afuera: Rect, adentro: Rect): boolean` (con tolerancia de 0,5).

- [ ] Prueba: `cajaDeCarta({x:0,y:0,ancho:100,alto:155.2,rotacion:90})` da `{x:-27.6,y:27.6,ancho:155.2,alto:100}` (a 1e-9); con rotación 0 da el mismo rectángulo; `seCortan` es falso para rectángulos que solo comparten un borde; `unir` de dos rectángulos da su caja; `contiene` acepta 0,4 de desborde y rechaza 1.
- [ ] Correr `node --test paquetes/mesa-geometria/test/` y ver que falla (módulo inexistente).
- [ ] Implementar `rect.ts`, `tipos.ts`, `index.ts` y `package.json` (`"name": "@eltruco/mesa-geometria"`, `"type": "module"`, `"exports": {".": "./src/index.ts"}`). Sumar `"paquetes/*/test/*.test.ts"` a `test:unit` y correr `npm install` para que el lockfile registre el workspace.
- [ ] Correr las pruebas y `npm run test:unit`: pasan.
- [ ] Commit «Crear el paquete de geometría de la mesa».

### Tarea 2: asientos, lugares y validación

**Archivos:** crear `src/asientos.ts`, `test/asientos.test.ts`.

**Interfaces producidas:**
- `jugadores(m: Modalidad): 2 | 4 | 6`.
- `asientoDeAbajo(e: EntradaMesa): number` (`propio`, o `vistaDesde ?? 0` si es espectador).
- `lugarDe(asiento: number, abajo: number, n: number): Lugar` con la tabla de las restricciones globales.
- `formaDe(e: EntradaMesa, asiento: number): { forma: Forma; activo: boolean }`: 1v1 y 2v2 son `completo` y activos; 3v3 redondilla, `circulo` (el de abajo, `completo`); pico a pico, los dos activos `completo` y los demás `punto` inactivos.
- `rivalDelDuelo(e): number | null`: en el pico a pico, el activo del equipo contrario al de abajo (va arriba, grande); si no, null.
- `validar(e: EntradaMesa): void`: `RangeError` en español si ancho o alto no son positivos y finitos; si `lance` aparece fuera de 3v3; si `propio`, `vistaDesde`, `dador`, `mano` o un activo no son asientos; si `cartas` no tiene un elemento por asiento o alguno no es entero de 0 a 3; si los activos se repiten o son del mismo equipo; si `hoja.alto` es negativo.

- [ ] Pruebas: en 2v2 con abajo 0, `lugarDe` da derecha, frente, izquierda para 1, 2, 3; en 3v3 con abajo 3, el asiento 4 es cerca-derecha y el 2 cerca-izquierda; los rivales de quien está abajo en 3v3 quedan en cerca-derecha, frente y cerca-izquierda, y los compañeros en las dos esquinas lejanas (para cada asiento de abajo); pico con activos [1, 4] y propio 0: el 1 es el rival del duelo, el 4 queda `completo` activo, los demás `punto`; pico con activos [0, 3] y propio 0: rival 3; espectador con `vistaDesde` 5 queda abajo; `validar` tira con `cartas` de largo 3 en 2v2, con activos [0, 2], con `propio: 4` en 2v2 y con `lance` en 1v1.
- [ ] Ver que fallan.
- [ ] Implementar `asientos.ts`.
- [ ] Ver que pasan. Commit «Ubicar los asientos de cada modalidad».

### Tarea 3: `calcularMesa` en el teléfono, sin hoja

**Archivos:** crear `src/mesa.ts`, `test/mesa.test.ts`.

**Interfaces:** consume las de las tareas 1 y 2. Produce `calcularMesa(e: EntradaMesa): Geometria`.

Medidas (teléfono / escritorio): margen 8 / 16; barra 44 / 52; etiqueta del lance 24 (solo 3v3); estado 48 / 56; fila inferior 48 / 56 (rótulo propio a la izquierda de hasta 160 × 32, botón Cantos 116 × 40 a la derecha); tira 56 (solo teléfono); rótulo de asiento completo 104 × 32 / 132 × 36; asiento en círculo 76 × 44 (avatar de 28 y nombre); punto 64 × 30.

Franjas de arriba hacia abajo dentro de la columna: barra, lance, paño, estado, mano, fila inferior, tira.

Cartas, todas proporcionales al ancho `w` de carta de la mano:
- Abanico: separación 0,72 w; rotaciones −9, 0, 9 (tres cartas), −5, 5 (dos), 0 (una); las de los costados bajan 0,06 w. La franja de la mano mide el alto de la caja del abanico de tres más 8.
- Carta jugada `j = 0,45 w`; en los círculos de tercetos, `0,72 j`. Dorsos: ancho `0,6 j` (en círculos `0,45 j`), cada uno corrido el 55 % de su ancho.
- Muestra de ancho `0,8 j`; el mazo encima, rotado 90°, corrido 0,35 y 0,55 de ese ancho; rótulo de 22 de alto debajo.
- `w` = el mayor valor entre 56 y el tope (teléfono `min(150, 0,27 × columna, (columna − 2 margen) / 2,7)`, escritorio `min(140, 0,24 × columna)`) con el que la altura que pide el paño entra (búsqueda binaria de 20 pasos).

Filas del paño (cada asiento centrado en su celda; los laterales pegados al margen):
- Fila 0 (solo pico a pico): puntos de frente, lejos-izquierda y lejos-derecha que no sean el rival del duelo.
- Fila 1: frente (o el rival del duelo en pico a pico), lejos-izquierda y lejos-derecha.
- Fila 2: derecha, izquierda, cerca-derecha y cerca-izquierda (en pico a pico, sus puntos).
- Fila 3: la carta jugada de quien está abajo, centrada; en pico a pico, si el de abajo no juega, el compañero activo con su asiento completo. Su alto es al menos el del grupo del mazo.
- El sobrante de altura se reparte en partes iguales entre las filas.

Mazo: se recorre el paño en una grilla de 4 puntos y se elige la posición libre (sin cortar ningún asiento, ni la jugada de abajo, con 4 de aire) cuyo centro queda a la derecha de quien dio (`(c − ancla) · derecha > 0`, con `derecha = (−fy, fx)` y `f` la dirección del ancla del dador al centro del paño) que minimiza `distancia(c, dador) + 0,5 × distancia(c, mano)`. El ancla del asiento de abajo es el centro de la franja de la mano.

Espectador: sin mano, sin Cantos; el asiento de abajo ocupa la franja de la mano con rótulo y dorsos (o su punto si no juega el duelo), y la fila inferior es `espectador` (píldora «Mirando» y «Volver al salón»).

- [ ] Pruebas (390 × 844): en 2v2 con propio 0, el asiento 2 queda arriba y centrado, el 1 a la derecha y el 3 a la izquierda; la mano trae tres cartas con rotaciones −9, 0, 9 y la del medio mide al menos 90 de ancho; `cantos` está en la fila inferior, a la derecha, y `tira` mide 56 pegada abajo; con 2 cartas en mano trae dos con −5 y 5; en 2v2 con dador 2 y mano 3, el mazo queda en la mitad izquierda del paño y más cerca de 2 que de 0; el espectador no tiene mano ni Cantos y sí `espectador`; en 3v3 aparece `lance` entre la barra y el paño.
- [ ] Ver que fallan.
- [ ] Implementar `mesa.ts`.
- [ ] Ver que pasan. Commit «Calcular la mesa del teléfono».

### Tarea 4: hoja abierta y escritorio

**Archivos:** modificar `src/mesa.ts`, `test/mesa.test.ts`.

- Hoja: la mano usa `w_h = clamp(0,62 w, 56, 84)` y se apoya sobre la hoja; no hay fila inferior ni Cantos y el rótulo propio es null. La hoja va pegada abajo en la columna y tapa la tira (la tira se sigue informando). Su alto se recorta a lo que deja libre la pila barra + lance + paño mínimo (con `j` de 26) + estado + mano chica.
- Escritorio (ancho ≥ 1024): paneles de `clamp(0,2 × ancho, 240, 320)` a cada lado, de alto completo; la mesa en la columna central; sin tira.

- [ ] Pruebas: con `hoja: {alto: 320}` en 390 × 844, la mano no corta la hoja, queda arriba de ella y sus cartas son más angostas que sin hoja; con `hoja: {alto: 5000}` la hoja se recorta, la mano queda entera en pantalla y fuera de la hoja; en 1440 × 900, `disposicion` es «escritorio», hay dos paneles, no hay tira y la mano cae en la columna central; con 1023 de ancho es «telefono» y con 1024, «escritorio»; con hoja en escritorio, la hoja queda dentro de la columna central.
- [ ] Ver que fallan, implementar, ver que pasan. Commit «Achicar la mano con la hoja y armar la mesa de escritorio».

### Tarea 5: barrido de pantallas, modalidades y dadores

**Archivos:** crear `test/barrido.test.ts`.

Para 360 × 640, 390 × 844, 430 × 932, 768 × 1024 y 1440 × 900; cada modalidad (1v1, 2v2, 3v3 redondilla, 3v3 pico con cada par de activos de distinto equipo); cada dador (mano = dador + 1); jugador (asiento 0) y espectador; sin hoja y con hoja de 320:

- Todo rectángulo y la caja de cada carta quedan dentro de la pantalla.
- No se cortan entre sí estos bloques: cada asiento (unión de rótulo, dorsos y jugada), el grupo del mazo, la barra, el lance, el estado, la mano (unión de sus cartas), el rótulo propio, Cantos, `espectador`, la tira, los paneles y la hoja. Excepciones: la hoja tapa la tira y la fila inferior; dentro de un asiento, la jugada y los dorsos comparten lugar.
- Los asientos de arriba, el mazo y las jugadas quedan dentro del paño; la mano, fuera.
- El centro del mazo queda a la derecha de quien dio (producto con su vector derecha positivo).
- Sin hoja, la carta de la mano mide al menos 80 de ancho en 360 × 640.

- [ ] Escribir el barrido y correrlo. Si falla, corregir las medidas o la ubicación en `mesa.ts` (no la prueba) hasta que pase.
- [ ] `npm run test:unit` completo pasa. Commit «Probar la mesa en todas las pantallas y repartos».

### Tarea 6: verificación y PR

- [ ] `npm ci` y `npm run check` (con `TEST_PORT` libre). `git diff --check`.
- [ ] PR con `Closes #361`, resultados reales y la nota de que `CHECK_STACK=1` no corrió si no se corre.
