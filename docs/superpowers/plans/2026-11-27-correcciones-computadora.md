# Correcciones de la computadora: plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usá superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que en duelo la computadora nunca acepte un truco con la mano perdida y siempre suba cuando la tiene ganada (#460).

**Arquitectura:** un análisis puro, `desenlaceSeguro`, decide con lo que ve el asiento si la mano ya está ganada o perdida. Una lista ordenada de correcciones nombradas, `corregirDecision`, reescribe la decisión de la computadora. `confirmarComputadora` la aplica y el replay registra el nombre de la corrección.

**Tecnología:** TypeScript sobre Node.js 24, `node:test` y `node:assert/strict`, el motor en `paquetes/motor`.

**Diseño:** [docs/superpowers/specs/2026-11-27-correcciones-computadora-design.md](../specs/2026-11-27-correcciones-computadora-design.md)

## Restricciones generales

- Las correcciones solo actúan en duelo (`estado.mano.reparto.manos.length === 2`). En 2v2, tercetos y la computadora al pie, la decisión no cambia.
- Ni el análisis ni las correcciones leen las cartas sin jugar del rival (`estado.mano.restantes[rival]`, `reparto.manos[rival]` sin jugar).
- Una corrección solo devuelve acciones que figuran en `legalesOnline(estado, asiento)`.
- Las subidas no se corrigen con la mano perdida.
- Un asiento cedido (`humanos.includes(asiento)`) no pasa por las correcciones.
- Los nombres de las correcciones son exactamente `entregar-mazo`, `nunca-querer-perdida` y `subir-ganada`.
- Los comentarios, las pruebas y los commits van en español rioplatense.
- Durante el desarrollo, `npm run check:rapido`.

## Foco de la revisión

1. **Privacidad:** el resultado del análisis no puede depender de las cartas ocultas del rival. Dos estados que solo difieren en la carta sin jugar del rival dan el mismo resultado (Tarea 1).
2. **Canto lateral pendiente:** si se responde un envido o una flor, con `estado.lateral !== null`, el «quiero» se refiere al lateral y no se corrige (Tarea 2).
3. **Idempotencia:** volver a corregir una decisión ya corregida no la cambia. Los que llaman la corrigen y `confirmarAutomatica` la corrige otra vez (Tarea 2).
4. **Costo en la primera vuelta:** en un reparto recién hecho, sin cartas jugadas, el análisis termina en menos de 250 ms y devuelve `null` para una mano común (Tarea 1).
5. **Respuesta con envido a un truco:** si la política contesta un truco con envido («el envido va primero»), la decisión queda como está (Tarea 2).

---

### Tarea 1: análisis `desenlaceSeguro`

**Archivos:**
- Crear: `paquetes/motor/src/desenlace.ts`
- Modificar: `tests/fixtures/duelo-mazo.ts`: agregar `dueloVale` y mover ahí `primeraParda`, que hoy está en `tests/unit/duelo-mazo.test.ts`.
- Modificar: `tests/unit/duelo-mazo.test.ts`: importar `primeraParda` desde la fixture.
- Prueba: `tests/unit/desenlace.test.ts`

**Interfaces:**
- Usa: `jugarCarta` y `EstadoMano` de `mano.ts`, `compararCartas` de `jerarquia.ts`, `mazo` de `cartas.ts`, `equipoDelAsiento` de `reparto.ts`.
- Produce: `export function desenlaceSeguro(estado: EstadoOnline, asiento: Asiento): "ganada" | "perdida" | null`.

La fixture `dueloVale: Registro` reproduce la mano 16 del reporte #460:

- `puntos_inicio: [23, 24]`; reparto `online-1`, `dador: 0`, `mano: 1`, `muestra: "oros-07"`, `reglaFlor: "inmediata-v2"`.
- Manos: `[["bastos-07", "bastos-12", "oros-04"], ["bastos-01", "espadas-06", "espadas-01"]]`.
- Acciones: envido A1, flor A0, (`paso-flor` A1 si el motor lo pide), carta A1 `bastos-01`, carta A0 `bastos-07`, carta A1 `espadas-06`, carta A0 `bastos-12`, truco A0, quiero A1, carta A0 `oros-04`, retruco A1, vale-cuatro A0.

Si `restaurar(dueloVale, "duel")` rechaza la secuencia, ajustá solo lo que el motor exige (por ejemplo el `paso-flor`) y conservá el orden público del reporte. Para las variantes, exportá desde la fixture un ayudante `hasta(n: number, manoA1?: CardId[], manoA0?: CardId[]): ManoPublicable`. Recorta `acciones` a las primeras `n`, reemplaza las manos indicadas y devuelve `restaurar(..., "duel")`. `n` cuenta las acciones del registro: si hace falta un `paso-flor`, corré los índices de las pruebas en uno.

- [ ] **Paso 1: escribir las pruebas que fallan** en `tests/unit/desenlace.test.ts`

```ts
test("#460: con el vale cuatro pendiente y solo el as de espadas contra el 4 de oros, la mano está perdida", () => {
  assert.equal(desenlaceSeguro(restaurar(dueloVale, "duel").estado, 1), "perdida");
});
test("con el 2 de la muestra como última carta frente a una carta oculta, la mano está ganada", () => {
  // Truco de A0 pendiente, antes del 4 de oros. A1 tiene oros-02.
  assert.equal(desenlaceSeguro(hasta(7, ["bastos-01", "espadas-06", "oros-02"]).estado, 1), "ganada");
});
test("con una carta oculta que puede ganar o perder, el desenlace no es seguro", () => {
  assert.equal(desenlaceSeguro(hasta(7).estado, 1), null);
});
test("la carta oculta del rival no cambia el análisis", () => {
  // A0 con oros-04 (le gana al as de espadas) o copas-04 (pierde): el resultado es el mismo.
  // Mismo registro que hasta(7), con copas-04 en lugar de oros-04 en la mano de A0.
  const otra = hasta(7, undefined, ["bastos-07", "bastos-12", "copas-04"]);
  assert.equal(desenlaceSeguro(otra.estado, 1), desenlaceSeguro(hasta(7).estado, 1));
});
test("tras la primera parda, si las dos cartas pierden la segunda, la mano está perdida", () => {
  assert.equal(desenlaceSeguro(restaurar(primeraParda, "duel").estado, 1), "perdida");
});
test("en 2v2 el análisis no se aplica", () => { /* cualquier estado de cuatro asientos */ assert.equal(desenlaceSeguro(estado2v2, 0), null); });
test("en un reparto recién hecho termina en menos de 250 ms y no decide", () => {
  const inicio = performance.now();
  // repartoComun: dueloMazo.reparto, sin jugadas.
  assert.equal(desenlaceSeguro(iniciarOnline(dueloMazo.reparto), 1), null);
  assert.ok(performance.now() - inicio < 250);
});
```

- [ ] **Paso 2: correr las pruebas y ver que fallan**

Correr: `node --test tests/unit/desenlace.test.ts`
Esperado: FALLA porque no existe `desenlace.ts`.

- [ ] **Paso 3: implementar `desenlaceSeguro` en `paquetes/motor/src/desenlace.ts`**

El análisis es un juego de cartas sin cantos. Arranca de `estado.mano` y lo avanza con `jugarCarta`:

```
rival = el otro participante del duelo
vistas = reparto.manos[asiento] ∪ cartas jugadas en vueltas y vueltaActual ∪ {muestra}
pozo = mazo − vistas, agrupado por clases de fuerza: cartas con compararCartas(a, b, muestra) === 0,
       con su cantidad disponible
quedanRival = restantes[rival].length   // solo la cantidad: no se leen las cartas
estado inicial del juego: estado.mano con restantes[rival] = [] y un contador quedanRival

siguiente(e):
  si e.equipoGanador !== null → hoja: ganó o perdió el equipo del asiento
  si e.turno === asiento → mueve el asiento con una de e.restantes[asiento]
  si no → mueve el rival con un representante de cada clase con cantidad > 0
          (descuenta la cantidad y lo inyecta en restantes[rival] justo antes de jugarCarta)

puedeGanar(e) = ∃ jugada del asiento ∃ jugada del rival … llega a una hoja ganada
ganaSiempre(e) = ∃ jugada del asiento ∀ jugada del rival … todas las hojas son ganadas

perdida si !puedeGanar(inicio); ganada si ganaSiempre(inicio); si no, null
```

El rival elige cada carta del pozo en el momento de jugarla. Eso equivale a cualquier mano oculta en cualquier orden. La estrategia del asiento solo depende de las cartas ya mostradas, así que `ganaSiempre` respeta lo que sabe el asiento. Agrupar por clases de fuerza conserva las pardas y reduce el árbol. Devolvé `null` si no es duelo, si `estado.resultado` existe o si `estado.mano.vueltaActual === null`.

- [ ] **Paso 4: correr las pruebas y ver que pasan**

Correr: `node --test tests/unit/desenlace.test.ts tests/unit/duelo-mazo.test.ts`
Esperado: PASA todo.

- [ ] **Paso 5: commit**

```bash
git add paquetes/motor/src/desenlace.ts tests/unit/desenlace.test.ts tests/fixtures/duelo-mazo.ts tests/unit/duelo-mazo.test.ts
git commit -m "Decidir con lo que ve el asiento si la mano de duelo ya está ganada o perdida (#460)"
```

### Tarea 2: lista de correcciones

**Archivos:**
- Crear: `paquetes/motor/src/correcciones.ts`
- Prueba: `tests/unit/correcciones.test.ts`

**Interfaces:**
- Usa: `desenlaceSeguro` de la Tarea 1; `segundaPerdidaEnDuelo` de `mesa-online.ts`; `legalesOnline` de `cantos-online.ts`; `esCardId` de `cartas.ts`; `ActionId` de `training/contracts`.
- Produce:
  - `export type Correccion = { nombre: string; corregir(estado: EstadoOnline, asiento: Asiento, decision: ActionId): ActionId | null }`
  - `export const correcciones: readonly Correccion[]`, en este orden: `entregar-mazo`, `nunca-querer-perdida`, `subir-ganada`.
  - `export function corregirDecision(estado: EstadoOnline, asiento: Asiento, decision: ActionId): { decision: ActionId; correccion?: string }`

Reglas, con `trucoAbierto = estado.lateral === null && estado.trucoPendiente !== null` y `subida = legalesOnline(estado, asiento).find(t => t === "truco" || t === "retruco" || t === "vale-cuatro")`:

- `entregar-mazo`: la condición actual de `confirmarComputadora`, sin cambios: `esCardId(decision) && restantes[asiento].includes(decision) && (estado.antesDeSalida === asiento || segundaPerdidaEnDuelo(estado, asiento))` → `"mazo"`.
- `nunca-querer-perdida`: `trucoAbierto && decision === "quiero" && desenlaceSeguro(...) === "perdida"` → `"no-quiero"`.
- `subir-ganada`: si `desenlaceSeguro(...) === "ganada"`:
  - Con `trucoAbierto` y `decision` igual a `"quiero"` o `"no-quiero"` → `subida ?? "quiero"`.
  - Sin canto pendiente (`estado.lateral === null && estado.trucoPendiente === null`), con `esCardId(decision)` y `subida` definida → `subida`.

Llamá a `desenlaceSeguro` solo cuando la decisión es candidata a corregirse. `corregirDecision` aplica la primera corrección que devuelve una acción legal distinta de la decisión. Para «mazo», es legal si lo acepta `aplicarOnline`.

- [ ] **Paso 1: escribir las pruebas que fallan** en `tests/unit/correcciones.test.ts`, con `dueloVale` y `hasta` de la Tarea 1

```ts
test("#460: el quiero al vale cuatro con la mano perdida pasa a no quiero", () => {
  assert.deepEqual(corregirDecision(restaurar(dueloVale, "duel").estado, 1, "quiero"),
    { decision: "no-quiero", correccion: "nunca-querer-perdida" });
});
test("con la mano perdida, la subida queda como está", () => {
  // Tras quiero de A1 y el 4 de oros: A1 propone retruco.
  assert.deepEqual(corregirDecision(hasta(9).estado, 1, "retruco"), { decision: "retruco" });
});
test("con la mano ganada y un truco pendiente, quiero y no quiero pasan a retruco", () => {
  const e = hasta(7, ["bastos-01", "espadas-06", "oros-02"]).estado;
  for (const d of ["quiero", "no-quiero"] as const)
    assert.deepEqual(corregirDecision(e, 1, d), { decision: "retruco", correccion: "subir-ganada" });
});
test("con la mano ganada y el vale cuatro pendiente, no quiero pasa a quiero", () => {
  const e = restaurar({ ...dueloVale, reparto: conManoA1(["bastos-01", "espadas-06", "oros-02"]) }, "duel").estado;
  assert.deepEqual(corregirDecision(e, 1, "no-quiero"), { decision: "quiero", correccion: "subir-ganada" });
});
test("con la mano ganada en su turno, la carta pasa al retruco", () => {
  // Truco querido y 4 de oros jugado. A1 tiene oros-02 y propone jugarlo.
  assert.deepEqual(corregirDecision(hasta(9, ["bastos-01", "espadas-06", "oros-02"]).estado, 1, "oros-02"),
    { decision: "retruco", correccion: "subir-ganada" });
});
test("sin desenlace seguro no se corrige nada", () => {
  assert.deepEqual(corregirDecision(hasta(7).estado, 1, "quiero"), { decision: "quiero" });
});
test("con un envido pendiente, el quiero no se corrige", () => {
  // Estado con estado.lateral !== null y la mano perdida o ganada según el análisis.
  assert.equal(corregirDecision(conEnvidoPendiente, asiento, "quiero").correccion, undefined);
});
test("si la política responde el truco con envido, la decisión queda", () => {
  assert.equal(corregirDecision(trucoConEnvidoLegal, asiento, "envido").correccion, undefined);
});
test("corregir dos veces da lo mismo que corregir una", () => {
  for (const [e, d] of casosDeArriba) {
    const una = corregirDecision(e, 1, d).decision;
    assert.equal(corregirDecision(e, 1, una).decision, una);
  }
});
test("la regla del #452 se conserva como entregar-mazo", () => {
  assert.deepEqual(corregirDecision(restaurar(dueloMazo, "duel").estado, 1, "oros-07"),
    { decision: "mazo", correccion: "entregar-mazo" });
});
```

Para `conEnvidoPendiente` y `trucoConEnvidoLegal`, armá con `aplicarOnline` un duelo con tres cartas por lado: un truco con respuesta de envido en el primer caso, un truco pendiente en el segundo.

- [ ] **Paso 2: correr las pruebas y ver que fallan**

Correr: `node --test tests/unit/correcciones.test.ts`
Esperado: FALLA porque no existe `correcciones.ts`.

- [ ] **Paso 3: implementar `correcciones.ts` con las reglas de arriba**

- [ ] **Paso 4: correr las pruebas y ver que pasan**

Correr: `node --test tests/unit/correcciones.test.ts tests/unit/desenlace.test.ts`
Esperado: PASA todo.

- [ ] **Paso 5: commit**

```bash
git add paquetes/motor/src/correcciones.ts tests/unit/correcciones.test.ts
git commit -m "Reunir las correcciones de la computadora y sumar no querer perdida y subir ganada (#460)"
```

### Tarea 3: conexión con los turnos y el replay

**Archivos:**
- Modificar: `api/turnos.ts`: `confirmarComputadora` y `jugarComputadoras`; nueva `decidirComputadora`.
- Modificar: `api/bot-pendiente.ts`: `aplicar` en `decidirTurno`, rama 1v1/2v2.
- Modificar: `api/partidas.ts:102`: pasar la corrección a `decisionReplay`.
- Modificar: `api/replay-db.ts`: `decisionReplay`.
- Modificar: `api/replay-chico.ts`: `DecisionBotV1` y `verificarBot`.
- Prueba: `tests/unit/duelo-mazo.test.ts` (casos nuevos) y la prueba existente del replay que valida `verificarBot` (buscala con `git grep -l verificarBot tests`).

**Interfaces:**
- Usa: `corregirDecision` de la Tarea 2.
- Produce:
  - `export function decidirComputadora(mano: ManoPublicable, asiento: Asiento, decision: ActionId): { decision: ActionId; correccion?: string }` en `api/turnos.ts`. Delega en `corregirDecision(mano.estado, asiento, decision)`.
  - `confirmarComputadora` mantiene su firma y confirma `decidirComputadora(...).decision`.
  - `jugarComputadoras`: `alConfirmar?: (mano: ManoPublicable, propuesta: ActionId, correccion?: string) => void`.
  - `DecisionBotV1.correccion?: string`.
  - `decisionReplay(mano, propuesta?, bot?, correccion?: string)`: si `correccion` está definida, se escribe en `decision.bot` junto con `propuesta`.
  - `verificarBot` acepta `correccion` solo si es texto y si hay `propuesta`.

- [ ] **Paso 1: escribir las pruebas que fallan**

```ts
test("#460: la computadora no quiere el vale cuatro y el replay registra la corrección", () => {
  const mano = restaurar(dueloVale, "duel");
  const fin = confirmarComputadora(mano, "duel", 1, "quiero");
  assert.deepEqual(fin.estado.resultado, { equipo: 0, tantos: 3, motivo: "rechazo" });
  const d = decisionReplay(fin, "quiero", undefined, "nunca-querer-perdida");
  assert.equal(d.bot?.propuesta, "quiero");
  assert.equal(d.bot?.correccion, "nunca-querer-perdida");
});
test("un asiento cedido conserva su quiero", () => {
  const fin = confirmarAutomatica(restaurar(dueloVale, "duel"), "duel", 1, "quiero", [1]);
  assert.equal(fin.turnos.at(-1)?.action.tipo, "quiero");
});
test("verificarBot rechaza una corrección sin propuesta", () => { /* replay con bot.correccion y sin bot.propuesta → lanza */ });
```

- [ ] **Paso 2: correr las pruebas y ver que fallan**

Correr: `node --test tests/unit/duelo-mazo.test.ts`
Esperado: FALLA. El vale cuatro se acepta y `decisionReplay` no tiene el cuarto parámetro.

- [ ] **Paso 3: implementar la conexión**

En `bot-pendiente.ts` y `jugarComputadoras`, calculá `decidirComputadora` antes de confirmar solo si `!humanos.includes(asiento)`. Pasá la corrección al replay y seguí llamando a `confirmarAutomatica` con la propuesta original. La idempotencia de la Tarea 2 garantiza el mismo resultado.

- [ ] **Paso 4: correr la verificación rápida**

Correr: `npm run check:rapido`
Esperado: termina sin fallas.

- [ ] **Paso 5: commit**

```bash
git add api/turnos.ts api/bot-pendiente.ts api/partidas.ts api/replay-db.ts api/replay-chico.ts tests/unit/duelo-mazo.test.ts
git commit -m "Aplicar las correcciones al confirmar la computadora y registrarlas en el replay (#460)"
```

La reserva, el PR, `python3 infra/ci/verificar_pr.py NUMERO` y la integración siguen [CONTRIBUTING.md](../../../CONTRIBUTING.md). No forman parte de este plan.
