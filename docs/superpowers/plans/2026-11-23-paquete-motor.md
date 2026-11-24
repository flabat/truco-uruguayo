# Paquete de reglas compartido (etapa 1) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `src/motor/` en el paquete de workspace `@eltruco/motor`, sin dependencias de Node ni del servidor, consumido por el sitio Astro, `api/`, `training/`, `scripts/` y las pruebas, sin cambios visibles.

**Architecture:** Workspaces de npm en la raíz con `paquetes/*`. El paquete expone cada archivo con `"exports": {"./*": "./src/*"}` y se importa como `@eltruco/motor/<archivo>.ts`. Node resuelve el symlink del workspace a su ruta real (fuera de `node_modules`), así que la eliminación de tipos de Node sigue funcionando. Los dos replays que dependen de `api/` y `training/` se mudan a `api/`. `node:crypto` se reemplaza por Web Crypto para que el paquete corra en navegador y en React Native.

**Tech Stack:** Node 24 (type stripping), npm workspaces, Astro 7/Vite, `node --test`, Playwright, Docker.

**Spec:** `docs/superpowers/specs/2026-11-23-app-movil-design.md` (etapa 1)

## Global Constraints

- Sin cambios visibles: `npm run check` y `CHECK_STACK=1 npm run check` pasan igual que en `main`.
- El paquete solo importa archivos propios con especificadores relativos `./<archivo>.ts`. Nada de `node:*`, `../` ni paquetes externos.
- Especificadores con extensión `.ts`, como el resto del repositorio.
- Proceso de AGENTS.md y CONTRIBUTING.md: issue, rama `codex/issue-<n>` creada con la API de refs, worktree `../truco-issue-<n>`, PR con `Closes #<n>`, `npm ci` y `npm run check` antes de pedir revisión, resultados en el PR.
- Mensajes de commit y textos en español rioplatense, como el historial.

## Review Focus

1. **Un importador que quedó con la ruta vieja** (por ejemplo un `.mjs` en `docs/` o `scripts/`, o un especificador sin `.ts` como `../motor/cantos-online`): debe fallar una prueba, no recién en producción. Lo cubre la prueba de rutas viejas de la tarea 2.
2. **La imagen de la API sin el paquete:** el contenedor arranca y resuelve `@eltruco/motor`. Lo cubre el paso de Docker de la tarea 3.
3. **El dador y el mezclado siguen siendo uniformes y dentro de rango** tras dejar `randomInt`. Lo cubren las pruebas de `azar.ts` de la tarea 1.
4. **Un import futuro de `node:` o del servidor dentro del paquete:** lo cubre la prueba de pureza de la tarea 2.
5. **La compilación de Astro con el paquete enlazado** (Vite tiene que transpilar `.ts` del workspace): lo cubre `npm run build` dentro de `npm run check` en la tarea 2.

---

### Task 0: Reservar el issue y preparar el worktree

**Files:** ninguno en el repositorio.

- [ ] **Step 1:** Buscá issues, PR (incluidos borradores) y ramas sobre app móvil, monorepo o motor: `gh issue list --search "motor OR monorepo OR app" --state all`, `gh pr list --state all --search "motor"`, `git ls-remote --heads origin 'codex/*'`. Si hay trabajo relacionado, frená y coordiná.
- [ ] **Step 2:** Abrí el issue «Mover el motor a un paquete compartido (etapa 1 de la app móvil)» con el problema, la decisión (este plan) y las rutas que se tocan: `paquetes/motor/`, `src/`, `api/`, `training/`, `scripts/`, `tests/`, `docs/`, `package.json`, `package-lock.json`, `api/Dockerfile*`.
- [ ] **Step 3:** Reservá con el bloque de CONTRIBUTING.md (sección «Issues y coordinación») usando ese número. Expected: existe `../truco-issue-<n>` en la rama `codex/issue-<n>`.
- [ ] **Step 4:** Copiá al worktree el diseño y este plan (`docs/superpowers/specs/2026-11-23-app-movil-design.md`, `docs/superpowers/plans/2026-11-23-paquete-motor.md`), commit «Documentar el diseño de la app móvil y el plan de la etapa 1», push y PR en borrador con `Closes #<n>`. Comentá en el issue la rama y el alcance.

Todo lo que sigue se hace en `../truco-issue-<n>`.

### Task 1: Azar sin `node:crypto`

**Files:**
- Create: `src/motor/azar.ts` (se muda con el resto en la tarea 2)
- Modify: `src/motor/mesa-online.ts:2,26,32`
- Test: `tests/unit/azar.test.ts`

**Interfaces:**
- Produces: `enteroAleatorio(min: number, max?: number): number`, con la semántica de `crypto.randomInt`: un argumento → `[0, min)`; dos → `[min, max)`. Lanza `RangeError` si el rango está vacío, no es entero o supera 2^32.

- [ ] **Step 1: Escribí las pruebas**

```ts
test("un argumento devuelve enteros en [0, n)", () => {
  for (let i = 0; i < 10_000; i++) { const x = enteroAleatorio(4); assert.ok(Number.isInteger(x) && x >= 0 && x < 4); }
});
test("dos argumentos devuelven enteros en [min, max)", () => {
  for (let i = 0; i < 10_000; i++) { const x = enteroAleatorio(3, 40); assert.ok(x >= 3 && x < 40); }
});
test("reparte de forma pareja", () => {
  const cuentas = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 60_000; i++) cuentas[enteroAleatorio(6)]++;
  for (const c of cuentas) assert.ok(c > 9_400 && c < 10_600, String(cuentas));
});
test("rechaza rangos inválidos", () => {
  for (const args of [[0], [5, 5], [7, 2], [1.5], [0, 2 ** 33]]) assert.throws(() => enteroAleatorio(...args as [number, number]), RangeError);
});
test("el motor no importa node:crypto", async () => {
  const fuente = await readFile(new URL("../../src/motor/mesa-online.ts", import.meta.url), "utf8");
  assert.doesNotMatch(fuente, /node:crypto/);
});
```

(La ruta de la última prueba se actualiza en la tarea 2.)

- [ ] **Step 2:** `node --test tests/unit/azar.test.ts` → FAIL (no existe `azar.ts`).
- [ ] **Step 3:** Implementá `enteroAleatorio` en `src/motor/azar.ts` con `globalThis.crypto.getRandomValues(new Uint32Array(1))` y muestreo por rechazo (descartá valores ≥ `2^32 - (2^32 % rango)`), sin sesgo de módulo. En `mesa-online.ts`, reemplazá el import de `node:crypto` por `import { enteroAleatorio } from "./azar.ts";` y las dos llamadas a `randomInt` por `enteroAleatorio` con los mismos argumentos.
- [ ] **Step 4:** `node --test tests/unit/azar.test.ts` → PASS, y `npm run test:unit` → PASS.
- [ ] **Step 5:** Commit «Repartir con Web Crypto en lugar de node:crypto».

### Task 2: Mover el motor al paquete `@eltruco/motor`

**Files:**
- Move: `src/motor/*.ts` → `paquetes/motor/src/*.ts`, salvo `replay-chico.ts` y `replay-chico-online.ts`
- Move: `src/motor/replay-chico.ts` → `api/replay-chico.ts`, `src/motor/replay-chico-online.ts` → `api/replay-chico-online.ts`
- Create: `paquetes/motor/package.json`
- Modify: `package.json` (raíz), `package-lock.json`, cada importador en `src/`, `api/`, `training/`, `scripts/`, `tests/`, `video/` (pipeline de reels con Remotion, paquete propio con su `package.json`), `docs/**/*.mjs`, y las menciones de rutas en `docs/**/*.md`
- Test: `tests/unit/paquete-motor.test.ts`; ruta de `tests/unit/azar.test.ts`

**Interfaces:**
- Consumes: `enteroAleatorio` (tarea 1), que viaja con el paquete.
- Produces: especificador `@eltruco/motor/<archivo>.ts` para cada archivo del paquete, por ejemplo `@eltruco/motor/mesa-online.ts`. Los replays del chico se importan como `api/replay-chico.ts` y `api/replay-chico-online.ts` con rutas relativas.

- [ ] **Step 1: Escribí `tests/unit/paquete-motor.test.ts`**, que recorre archivos con `readdir` recursivo y comprueba:
  - `"el paquete solo importa archivos propios"`: cada `import`/`export … from` en `paquetes/motor/src/*.ts` coincide con `^\./[a-z0-9-]+\.ts$`.
  - `"nadie importa la ruta vieja del motor"`: ningún `.ts`, `.tsx`, `.astro`, `.mjs` en `src/`, `api/`, `training/`, `scripts/`, `tests/`, `video/` y `docs/` contiene `src/motor/` ni un especificador relativo que termine en `motor/<nombre>` (regex `/["'][./]+(?:[^"']*\/)?motor\/[a-z0-9-]+(\.ts)?["']/`). Excluí `node_modules`, `dist` y `runs`.
  - `"@eltruco/motor resuelve desde la raíz y desde api/"`: `await import("@eltruco/motor/mesa-online.ts")` exporta `iniciarOnline`, y `import.meta.resolve` del mismo especificador apunta a una ruta que contiene `/paquetes/motor/src/`.
- [ ] **Step 2:** `node --test tests/unit/paquete-motor.test.ts` → FAIL (el paquete no existe).
- [ ] **Step 3:** Creá el paquete: `paquetes/motor/package.json` con `{"name": "@eltruco/motor", "version": "0.0.0", "private": true, "type": "module", "exports": {"./*": "./src/*"}}`. Agregá `"workspaces": ["paquetes/*"]` al `package.json` de la raíz. Movelo con `git mv` para conservar el historial.
- [ ] **Step 4:** Reescribí los imports con un script descartable en el scratchpad (no se versiona):
  - especificadores relativos que terminan en `motor/<nombre>` o `motor/<nombre>.ts` → `@eltruco/motor/<nombre>.ts`;
  - los que apuntan a `replay-chico` y `replay-chico-online` → ruta relativa a `api/replay-chico.ts` o `api/replay-chico-online.ts`;
  - dentro de los dos replays mudados: `../../api/turnos.ts` → `./turnos.ts`, `../../training/contracts/index.ts` → `../training/contracts/index.ts`, hermanos `./x.ts` → `@eltruco/motor/x.ts`.

  En `docs/**/*.md`, cambiá `src/motor/` por `paquetes/motor/src/` (y `src/motor/replay-chico*.ts` por `api/replay-chico*.ts`). Actualizá la ruta de la última prueba de `tests/unit/azar.test.ts`.
- [ ] **Step 5:** `npm install` (actualiza `package-lock.json` con el workspace) y después `npm ci`. Expected: `node_modules/@eltruco/motor` es un symlink a `../../paquetes/motor`.
- [ ] **Step 6:** `node --test tests/unit/paquete-motor.test.ts` → PASS.
- [ ] **Step 7:** `npm run check` → PASS (unitarias, `tests/despliegue`, build de Astro, enlaces, cartas, Playwright). `git diff --check` limpio. Además, en `video/`: `npm ci`, `npm test` y `npm run typecheck` → PASS, y `npm run reel` con un episodio existente renderiza (Remotion tiene que resolver `@eltruco/motor` desde la raíz y transpilar sus `.ts`).
- [ ] **Step 8:** Commit «Mover el motor al paquete compartido @eltruco/motor».

### Task 3: Imagen de la API con el paquete

**Files:**
- Modify: `api/Dockerfile`, `api/Dockerfile.dockerignore`
- Test: verificación con Docker más `CHECK_STACK=1 npm run check`

- [ ] **Step 1:** Antes de cambiar nada, construí la imagen: `docker build -f api/Dockerfile -t truco-api:prueba .` y después `docker run --rm truco-api:prueba node --input-type=module -e "await import('./turnos.ts'); console.log('ok')"`. Expected: FAIL (`Cannot find package '@eltruco/motor'` o archivo faltante).
- [ ] **Step 2:** En `api/Dockerfile`, reemplazá `COPY src/motor /app/src/motor` por `COPY paquetes/motor /app/paquetes/motor`. Agregá `RUN mkdir -p /app/node_modules/@eltruco && ln -s ../../paquetes/motor /app/node_modules/@eltruco/motor` antes de `USER node`. Los replays mudados ya entran con `COPY api/*.ts`. En el `.dockerignore`, cambiá `!src/motor/` y `!src/motor/*.ts` por `!paquetes/`, `!paquetes/motor/`, `!paquetes/motor/package.json`, `!paquetes/motor/src/`, `!paquetes/motor/src/*.ts`.
- [ ] **Step 3:** Repetí los dos comandos del paso 1. Expected: imprime `ok`.
- [ ] **Step 4:** `CHECK_STACK=1 npm run check` → PASS (API, PostgreSQL y Keycloak juntos).
- [ ] **Step 5:** Commit «Incluir el paquete del motor en la imagen de la API».

### Task 4: Revisión y entrega del PR

- [ ] **Step 1:** `npm ci && npm run check && git diff --check` en el worktree. Guardá la salida resumida.
- [ ] **Step 2:** Actualizá la descripción del PR: qué cambió, por qué (etapa 1 del diseño), los comandos de las tareas 2 y 3 con sus resultados reales, y que no hay cambios visibles. Terminá con la línea de atribución de Claude Code. Marcá el PR como listo para revisión.
