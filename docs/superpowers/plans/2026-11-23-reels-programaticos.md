# Programmatic Reels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run reel -- video/episodios/<serie>/<id>.yaml` turns one small episode file into a finished 1080×1920 teaching reel (MP4 + `.es.srt` + cover + contact sheet + posting draft), using the site's rules engine and card components.

**Architecture:** A separate npm package in `video/` (Remotion 4) imports the site's code from `../src`. Pure logic lives in `video/src/lib` and the template's `guion.ts`, and is unit-tested with `node --test`: numbers to words, the narration timeline, episode parsing, the narration script and the voice cache. React compositions in `video/src/plantillas` draw frames. A Node CLI (`video/scripts/reel.ts`) runs validate → voice → render → QA.

**Tech Stack:** Remotion 4.0.540 (`remotion`, `@remotion/cli`, `@remotion/bundler`, `@remotion/renderer`, `@remotion/captions`, `@remotion/media`), React 19.3.1, zod 3, yaml 2.9.1, sharp 0.35.5, Node 24 (type stripping), ElevenLabs REST API.

**Spec:** `docs/superpowers/specs/2026-11-23-reels-programaticos-design.md`

**Reference material (not in the repo):**
- Spike, throwaway but working: `/private/tmp/claude-501/-Users-flabat--claude-spares-spare-bg5qoI/d01dff88-6082-47b6-88d1-09af853a6dde/scratchpad/remotion-spike/`. Useful files: `src/linea.ts`, `src/Voz.tsx`, `src/Lamina.tsx`, `remotion.config.ts`. It may be gone after a reboot; everything needed is restated below.
- Codex sources (Noemí audio, word timings, manifests, the old Python): `~/Downloads/El Truco - Codex fuentes/{envido,flor}/{02..06}/`, `referencia/`, `codex-scripts/`, `valores.json`.
- Codex reels to compare against: `~/Downloads/El Truco - Nuevas manos/{Envido,Flor}/Contar {envido,flor} 0N.mp4`.

## Global Constraints

- Repo workflow (AGENTS.md, CONTRIBUTING.md): open an issue, reserve it by creating `codex/issue-<n>` from `main` with an exclusive create, work in a separate worktree, integrate by PR, and run `npm ci` and `npm run check` before asking for review, recording the results in the PR.
- Remotion packages are pinned **exactly** to `4.0.540`. Every other dependency in `video/package.json` gets an exact version published at least two weeks before install.
- `video/` has its own `package.json` and `package-lock.json`. The root `package.json` gains only delegating scripts, never Remotion dependencies. The site's `npm run check` is not changed.
- Pure modules (`video/src/lib/*.ts`, `video/src/plantillas/*/guion.ts`, `video/scripts/*.ts`) import site code by **relative path with the `.ts` extension** (for example `../../../src/motor/tantos.ts`) so `node --test` can load them. React files may use the `@site/*` alias.
- The webpack config aliases `react`, `react-dom` and `react/jsx-runtime` to `video/node_modules` so site components and Remotion share one React instance.
- Compositions are 360×640 at 30 fps, rendered with `scale: 3` to 1080×1920 H.264 + AAC.
- All motion is driven by `useCurrentFrame()`. No CSS transitions or animations.
- The bottom 20% of the frame (y > 512 in composition pixels) holds decoration only, because platform UI covers it.
- The voice is ElevenLabs "Noemí Suave Reflexiva", model `eleven_v4`. The key comes from `ELEVENLABS_API_KEY` and the voice id from `ELEVENLABS_VOICE_ID`, read from the environment or the root `.env`. Neither is ever committed or logged.
- Voice audio is normalized to −16 LUFS integrated, −1.5 dBTP, LRA 9, 48 kHz mono, in two passes, using the ffmpeg Remotion bundles (`npx remotion ffmpeg`).
- Gitignored: `video/public/voz/`, `video/public/preparado/`, `video/salida/`, `video/node_modules/`.
- User-facing text (narration, captions, on-screen copy, CLI messages, docs) is in Rioplatense Spanish with voseo ("Contá", "Probá", "tenés").

## Review Focus

1. **An override line that doesn't name a card's rank word.** If a card's rank word isn't found in its line, the card must still appear at the start of that line, not crash or stay hidden. The test is in Task 7, as the `momentosDeCartas` fallback.
2. **Text that doesn't match the timings on import.** Importing Codex audio for an episode whose lines differ must fail before rendering and name the first line that differs. The test is in Task 6, as `importarVoz` with a mismatch.
3. **A flor hand in an envido episode, or the reverse.** A `modalidad: envido` hand that the engine scores as flor must be rejected with a clear message. The test is in Task 4.
4. **A misspelled or wrong-skill family.** For example `familia: una-pieza` in a flor episode, or `familia: dos-palos`. The error must name the family and list the valid ones for that `modalidad`. The test is in Task 4.
5. **A missing API key or voice id when a re-voice is needed.** The CLI must stop before rendering, say which variable is missing, and not print the other one. A cache hit needs no key. The test is in Task 6.

---

### Task 1: Reserve the work and scaffold `video/`

**Files:**
- Create: `video/package.json`, `video/package-lock.json`, `video/tsconfig.json`, `video/remotion.config.ts`, `video/src/index.ts`, `video/src/Root.tsx`, `video/src/plantillas/prueba/Prueba.tsx`, `video/.gitignore`, `video/public/img` (symlink to `../../public/img`)
- Modify: `package.json` (scripts), `.gitignore`
- Add: `docs/superpowers/specs/2026-11-23-reels-programaticos-design.md` and this plan (already written, uncommitted on `main`)

**Interfaces:**
- Produces:
  - the `@site/*` alias resolving to `<repo>/src/*`;
  - the `Prueba` composition (id `"Prueba"`, 360×640, 30 fps, 30 frames);
  - root scripts `reel`, `reel:studio` and `reel:instalar`;
  - `video` scripts `test` (`node --test "test/*.test.ts"`), `typecheck` (`tsc --noEmit`), `reel` (`node scripts/reel.ts`) and `studio` (`remotion studio src/index.ts`).

- [ ] **Step 1: Reserve the issue.** Search the existing issues, PRs and branches for "reel", "video" and "remotion". Then create the issue "Generar reels desde plantillas con Remotion", linking the spec. Create `codex/issue-<n>` from `main` and a worktree for it. Move the two uncommitted docs into the worktree.
- [ ] **Step 2: Write `video/package.json`** with `"type": "module"`, `"private": true` and the four scripts above. Dependencies (exact): `remotion`, `@remotion/cli`, `@remotion/bundler`, `@remotion/renderer`, `@remotion/captions` and `@remotion/media` all at `4.0.540`; `react` and `react-dom` at `19.3.1`; `@fontsource/dm-sans` and `@fontsource/dm-serif-text` at `5.3.0`; `yaml` at `2.9.1`; `sharp` at `0.35.5`; `zod` 3.x. Dev dependency: `typescript` 5.x. Run `npm install` in `video/`.
- [ ] **Step 3: Write the config.** `video/tsconfig.json`: `moduleResolution: "bundler"`, `jsx: "react-jsx"`, `strict`, `allowImportingTsExtensions`, `noEmit`, `resolveJsonModule`, and `paths: {"@site/*": ["../src/*"]}`. `video/remotion.config.ts`: `Config.setVideoImageFormat("jpeg")`, plus `Config.overrideWebpackConfig` adding the alias `@site` → `path.resolve("../src")` and the React aliases from Global Constraints.
- [ ] **Step 4: Write the `Prueba` composition.** It imports `site.css` and the fonts and draws `<Naipe base={staticFile("img").slice(0, -3)} id="oros-02" />` next to the text `evaluarTantos(["copas-04","copas-07","espadas-01"], "bastos-06").total`. Register it in `Root.tsx`.
- [ ] **Step 5: Verify that rendering works.** Run `cd video && npx remotion still src/index.ts Prueba salida/prueba.png --scale=3`. Expected: a 1080×1920 PNG showing the 2 de oros and "31". Read the image to confirm.
- [ ] **Step 6: Verify a single React instance.** Temporarily give `Prueba` a `useState` call and render it from a site component that also uses hooks (`ZonaJugador` from `@site/components/jugar/ZonaJugador`). Expected: no "Invalid hook call" error. Then remove the temporary code.
- [ ] **Step 7: Add root scripts and ignores.** Root scripts: `"reel": "npm --prefix video run reel --"`, `"reel:studio": "npm --prefix video run studio --"`, `"reel:instalar": "npm ci --prefix video"`. Add the Global Constraints paths to `video/.gitignore`. Confirm `npm run check` at the root still passes and doesn't touch `video/`.
- [ ] **Step 8: Commit** the docs, the scaffold and the scripts: `Preparar el paquete de video con Remotion`.

### Task 2: Text helpers and numbers in words

**Files:**
- Create: `video/src/lib/texto.ts`, `video/src/lib/numeros.ts`
- Test: `video/test/numeros.test.ts`

**Interfaces:**
- Produces:
  - `plano(s: string): string`: lowercase, NFD with diacritics removed, only `[a-z0-9 ]` kept, spaces collapsed.
  - `aPalabras(n: number): string`: integers 0–99, lowercase, accents as in Rioplatense writing. Throws `RangeError` outside that range.
  - `palabraDeRango(rango: Rango): string`: 1 → "as", 2–7 → "dos"…"siete", 10 → "sota", 11 → "caballo", 12 → "rey".
  - `nombreHablado(carta: CardId): string`: `"siete de copas"`, `"as de espadas"`.

- [ ] **Step 1: Write the failing tests**

```ts
test("aPalabras cubre los tantos posibles", () => {
  const casos = { 0: "cero", 1: "uno", 7: "siete", 16: "dieciséis", 20: "veinte", 21: "veintiuno",
    22: "veintidós", 23: "veintitrés", 26: "veintiséis", 29: "veintinueve", 30: "treinta",
    31: "treinta y uno", 33: "treinta y tres", 38: "treinta y ocho", 44: "cuarenta y cuatro", 47: "cuarenta y siete" };
  for (const [n, palabras] of Object.entries(casos)) assert.equal(aPalabras(Number(n)), palabras);
  assert.throws(() => aPalabras(100), RangeError);
});
test("plano iguala mayúsculas, tildes y signos", () => {
  assert.equal(plano("¿Cuánto  CANTÁS?"), "cuanto cantas");
});
test("nombreHablado usa as, sota, caballo y rey", () => {
  assert.equal(nombreHablado("espadas-01"), "as de espadas");
  assert.equal(nombreHablado("bastos-11"), "caballo de bastos");
});
```

- [ ] **Step 2: Run and see them fail.** `cd video && npm test`. Expected: FAIL (the modules don't exist yet).
- [ ] **Step 3: Implement** the four functions in the files listed. `nombreHablado` uses `rangoDe` and `paloDe` from `../../../src/motor/cartas.ts`.
- [ ] **Step 4: Run and see them pass.** `cd video && npm test`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `Agregar números en palabras para la narración`.

### Task 3: Narration timeline (`linea.ts`)

**Files:**
- Create: `video/src/lib/linea.ts`
- Test: `video/test/linea.test.ts`, with the fixture `video/test/fixtures/envido-03.json` (copied from `~/Downloads/El Truco - Codex fuentes/envido/03/`: its `manifest.json` cues plus `words.json`)

**Interfaces:**
- Consumes: `plano` (Task 2).
- Produces:

```ts
export interface Palabra { text: string; start: number; end: number }          // seconds, in the voice file
export interface LineaGuion { id: string; texto: string; pausa?: boolean }     // pausa: viewer counts after this line
export interface Tramo { id: string; desde: number; hasta: number; inicio: number } // audio span → video start (s)
export interface Linea {
  tramos: Tramo[];
  pausas: { id: string; desde: number; hasta: number }[];   // video seconds
  subtitulos: Caption[];                                     // from @remotion/captions, video ms
  cuando(id: string, palabra: string, ocurrencia?: number): number | null; // video seconds, null if absent
  inicio(id: string): number;
  fin(id: string): number;                                  // end of that line's speech, video seconds
  duracion: number;                                         // seconds
}
export function armarLinea(lineas: LineaGuion[], palabras: Palabra[],
  opciones?: { pausa?: number; respiro?: number; cola?: number }): Linea; // defaults 3, 0.35, 0.8
```

Algorithm (from the spike, with corrections):
- Group the words by each line's word count, and throw if `plano` of the joined group differs from `plano(texto)` (the message names the line id).
- Cut between lines at the midpoint between the last word's `end` and the next line's first `start`.
- After a line, add `pausa` seconds if `pausa: true`, or `respiro` otherwise. After the last line, add `cola`.
- `subtitulos` puts a leading space on each word and sets `pageBreakAfter` when the word ends in `.`, `?` or `!`.

- [ ] **Step 1: Write the failing tests.**
  - `"arma tramos contiguos y respeta las pausas marcadas"`: with the envido 03 fixture and `pausa: true` on lines 1 and 3 only, `pausas.length === 2`, each lasting 3 s ± 0.01. Line 0 ends with "?" but gets no pause.
  - `"cuando devuelve el tiempo en el video"`: `cuando("respuesta1", "treinta")` equals `tramos[2].inicio + (words[i].start - tramos[2].desde)` for that word, and `cuando("respuesta1", "nunca")` is `null`.
  - `"los subtítulos cortan al final de cada oración"`: no `createTikTokStyleCaptions` page contains both "cantás?" and "Treinta".
  - `"un texto que no coincide nombra la línea"`: changing line 2's text throws a message containing `"respuesta1"`.
  - `"la duración suma voz, pausas y cola"`.
- [ ] **Step 2: Run and see them fail.** `cd video && npm test`.
- [ ] **Step 3: Implement `armarLinea`** in `video/src/lib/linea.ts`.
- [ ] **Step 4: Run and see them pass.** `cd video && npm test`.
- [ ] **Step 5: Commit** with the message `Armar la línea de tiempo desde la narración`.

### Task 4: Episode files and hand resolution

**Files:**
- Modify: `src/aprendizaje/generadores/index.ts` (export the existing `cartasDe` as `cartasDeFamilia`, with no behavior change)
- Create: `video/src/lib/episodio.ts`
- Test: `video/test/episodio.test.ts`

**Interfaces:**
- Consumes: `evaluarTantos` (`src/motor/tantos.ts`), `esCardId` and `type CardId` (`src/motor/cartas.ts`), `crearAzar` (`src/motor/reparto.ts`), `cartasDeFamilia(familia, muestra, cantidad, azar)` and `pertenece`.
- Produces:

```ts
export type ManoSpec = CardId[] | { cambio: { de: CardId; a: CardId } } | { familia: string; semilla: number };
export interface Episodio {
  plantilla: "contar-tantos"; serie: string; id: string; modalidad: "envido" | "flor";
  muestra: CardId; manos: ManoSpec[]; gancho: string; lineas?: Record<string, string | null>;
}
export interface Mano { cartas: CardId[]; tantos: ResultadoTantos; cambio?: { de: CardId; a: CardId } }
export function leerEpisodio(ruta: string): Episodio;   // YAML → zod-validated object
export function resolverManos(ep: Episodio): Mano[];
```

Rules:
- `contar-tantos` needs exactly 3 hands, and the second must be a `cambio` of the first.
- A `cambio` replaces `de` in the previous hand, in the same position. `de` must be in that hand, and `a` must not already be in it or be the muestra.
- `{familia, semilla}` uses `cartasDeFamilia(familia, ep.muestra, 3, crearAzar(semilla))`. The family must belong to `contar-envido` or `contar-flor`, matching `modalidad`.
- Each resolved hand's `tantos.modalidad` must equal `ep.modalidad`. Otherwise throw `"La mano N es <x>, pero el episodio es de <y>."`
- `zod` messages are re-thrown with the YAML path, for example `manos.1.cambio.a`.

- [ ] **Step 1: Write the failing tests.**
  - `"resuelve una mano escrita, un cambio y una generada"`: muestra `espadas-03`; hands `[oros-05, oros-07, copas-02]`, `{cambio: {de: oros-05, a: espadas-05}}`, `{familia: tres-palos-distintos, semilla: 41}`. Totals 32 and 35, and the third hand's `forma` is `"tres-palos-distintos"`.
  - `"la misma semilla da la misma mano"`.
  - `"rechaza una flor en un episodio de envido"`: `[copas-01, copas-02, copas-03]` with muestra `bastos-06` throws `/es flor, pero el episodio es de envido/`.
  - `"una familia ajena a la modalidad lista las válidas"`: `{familia: "una-pieza", semilla: 1}` in a flor episode throws a message containing `una-pieza` and `dos-piezas`.
  - `"toda familia de contar tantos se resuelve"`: every family in `familiasPorHabilidad["contar-envido"]` and `["contar-flor"]` resolves for muestra `espadas-03`, seeds 1–5.
  - `"un cambio con una carta ausente falla"`.
- [ ] **Step 2: Run and see them fail.** `cd video && npm test`.
- [ ] **Step 3: Implement.** Add the `export` in `generadores/index.ts` and write `episodio.ts`. Confirm the site's tests still pass: `npm run test:unit` at the root.
- [ ] **Step 4: Run and see them pass.** `cd video && npm test`.
- [ ] **Step 5: Commit** with the message `Leer episodios y resolver sus manos con el motor`.

### Task 5: Narration script for `contar-tantos`

**Files:**
- Create: `video/src/plantillas/contar-tantos/guion.ts`
- Test: `video/test/guion.test.ts`

**Interfaces:**
- Consumes: `Episodio` and `Mano` (Task 4); `aPalabras`, `nombreHablado`, `palabraDeRango` and `plano` (Task 2); `LineaGuion` (Task 3).
- Produces: `guionContarTantos(ep: Episodio, manos: Mano[]): LineaGuion[]`, plus `idsContarTantos(modalidad): readonly string[]`.

Line ids, in order:
- envido: `pregunta`, `cartas`, `respuesta1`, `cambio`, `respuesta2`, `tercera`, `valores`, `cierre`
- flor: `pregunta`, `cartas`, `respuesta1`, `cambio`, `respuesta2`, `tercera`, `respuesta3`, `valores`, `cierre`

`pausa: true` goes on `cartas` and `cambio`, and on flor's `tercera`.

Default text (each `respuesta*` begins with the total in words, capitalized, followed by a period):

| id | envido | flor |
|---|---|---|
| pregunta | `{gancho} La muestra es el {muestra}.` | same |
| cartas | `{cards, grouped}. ¿Cuánto cantás?` | `{cards}. ¿Cuántos tantos tenés?` |
| respuesta1 | `{Total}. {explanation}` | same |
| cambio | `Cambiá el {de} por el {a}. {Ahora es pieza. \| ""}¿Cuánto te da?` | same |
| respuesta2 | `{Total}. {explanation}` | same |
| tercera | `{cards}. {explanation, ending with the total}` | `{cards}. ¿Cuánto da esta flor?` |
| respuesta3 | — | `{Total}. {explanation}` |
| valores | `Guardate estos valores para la próxima mano.` | same |
| cierre | `Probá otra mano en El Truco.` | same |

"Grouped" means adjacent cards of the same suit share it: `["oros-05","oros-07","copas-02"]` becomes "Cinco y siete de oros, y dos de copas". The explanation depends on `tantos.forma`:
- `dos-del-mismo-palo`: "Veinte por {suit}, más {a}, más {b}. El {other} queda afuera."
- `una-pieza`: "El {pieza} vale {value}. Sumale el {best}. Los veinte ya están incluidos."
- `tres-palos-distintos`: "Tres palos distintos. Te quedás con el {best}." Add "{Figure} común vale cero." when a figure is present.
- `tres-del-mismo-palo` (flor): "Veinte más {a} más {b} más {c}." Common figures are named as worth zero.
- flor with piezas: "Contá veinte una sola vez. Sumale …" with each pieza's flor contribution (2 → diez, 4 → nueve, 5 → ocho, 10/11 → siete).

Overrides: `ep.lineas[id]` replaces the text, and `null` removes the line. An unknown id throws `"Línea desconocida: <id>"`. After overrides, every remaining `respuesta*` line must have `plano(first sentence) === plano(aPalabras(total))`. Otherwise throw `"La línea <id> dice <x>, pero el motor da <total>."`

- [ ] **Step 1: Write the failing tests.**
  - `"el guion de envido 03 da los totales del motor"`: the Task 4 hands. `respuesta1` starts "Treinta y dos.", `respuesta2` starts "Treinta y cinco.", and `cartas` is "Cinco y siete de oros, y dos de copas. ¿Cuánto cantás?"
  - `"las pausas caen en cartas y cambio"`: envido gives `[cartas, cambio]`; flor gives `[cartas, cambio, tercera]`.
  - `"cada forma tiene explicación"`: for every family in `contar-envido` and `contar-flor`, generate seeds 1–5 with muestra `espadas-03`. Each line is non-empty and has no `undefined`.
  - `"un override con total equivocado falla"`: `lineas: {respuesta1: "Treinta. ..."}` throws `/motor da 32/`.
  - `"null quita la línea y un id desconocido falla"`.
- [ ] **Step 2: Run and see them fail.** `cd video && npm test`.
- [ ] **Step 3: Implement `guionContarTantos`.**
- [ ] **Step 4: Run and see them pass.** `cd video && npm test`.
- [ ] **Step 5: Commit** with the message `Escribir el guion de contar tantos desde el motor`.

### Task 6: Voice: ElevenLabs, cache and import

**Files:**
- Create: `video/src/lib/voz.ts`, `video/src/lib/entorno.ts`
- Test: `video/test/voz.test.ts`, with the fixture `video/test/fixtures/alineacion.json` (a short hand-written ElevenLabs response)

**Interfaces:**
- Consumes: `LineaGuion` and `Palabra` (Task 3); `plano` (Task 2).
- Produces:

```ts
export interface Voz { archivo: string; palabras: Palabra[] }      // archivo: path relative to video/public (e.g. "voz/<hash>.wav")
export function claveVoz(lineas: LineaGuion[], ajustes: { vozId: string; modelo: string }): string; // sha256 hex
export function palabrasDesdeAlineacion(a: { characters: string[];
  character_start_times_seconds: number[]; character_end_times_seconds: number[] }): Palabra[];
export async function generarVoz(lineas: LineaGuion[], o: { raiz: string; fetch?: typeof fetch;
  entorno?: Record<string, string | undefined> }): Promise<Voz>;   // cache hit: no network, no key needed
export async function importarVoz(lineas: LineaGuion[], wav: string, palabrasJson: string, raiz: string): Promise<Voz>;
export function leerEntorno(raizRepo: string): Record<string, string | undefined>; // process.env over root .env
```

Behavior:
- The cache key hashes `{vozId, modelo, texto}`, where `texto` is the lines joined with a single space. Files are `video/public/voz/<key>.wav` and `<key>.json` (the words).
- On a miss, it sends `POST https://api.elevenlabs.io/v1/text-to-speech/{vozId}/with-timestamps?output_format=mp3_44100_192` with the header `xi-api-key` and the body `{text, model_id: "eleven_v4"}`. It decodes `audio_base64` to a temp mp3, then runs two-pass `loudnorm` through `npx remotion ffmpeg` (the Global Constraints values) into a 48 kHz mono wav. Words come from `alignment` via `palabrasDesdeAlineacion`, which splits on whitespace and takes the first character's start and the last character's end.
- A missing key or voice id on a miss throws `"Falta ELEVENLABS_API_KEY"` or `"Falta ELEVENLABS_VOICE_ID"`. The message never contains the other variable's value.
- `importarVoz` requires `plano(words joined) === plano(lines joined)`. Otherwise it throws `"La voz importada no coincide desde la línea <id>: <expected first words>"`. It normalizes the audio like a generated voice and stores it under the same key scheme, so later renders hit the cache.

- [ ] **Step 1: Write the failing tests** (no network: the tests inject a fake `fetch` that returns the fixture plus a tiny base64 mp3 made by `npx remotion ffmpeg -f lavfi -i anullsrc -t 0.5`, committed as part of the fixture).
  - `"palabrasDesdeAlineacion agrupa por espacios"`
  - `"la segunda llamada usa la caché sin red ni clave"`
  - `"sin clave falla nombrando solo la variable faltante"`: set `ELEVENLABS_VOICE_ID: "secreto-id"` and no key. The error says `ELEVENLABS_API_KEY` and does not contain `secreto-id`.
  - `"importar una voz que no coincide nombra la línea"`: the envido 03 words from Task 3's fixture against the default script from Task 5, which differs. The error contains `pregunta`.
  - `"la clave cambia si cambia el texto"`
- [ ] **Step 2: Run and see them fail.** `cd video && npm test`.
- [ ] **Step 3: Implement** `voz.ts` and `entorno.ts`.
- [ ] **Step 4: Run and see them pass.** `cd video && npm test`.
- [ ] **Step 5: Find the voice id once.** Run `curl -s -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/voices`, find "Noemí", and ask the user to add `ELEVENLABS_VOICE_ID` to the root `.env`. Don't write keys into any file yourself.
- [ ] **Step 6: Commit** with the message `Generar y guardar la voz con ElevenLabs`.

### Task 7: The lámina composition

**Files:**
- Create:
  - `video/src/lib/escena.ts`
  - `video/src/piezas/{Cabecera,BandaPano,ManoGrande,Subtitulos,PieGrabado,TablaValores,Cierre}.tsx`
  - `video/src/piezas/piezas.css`
  - `video/src/plantillas/contar-tantos/Lamina.tsx`
  - `video/public/marca/{favicon.svg,mesa-criolla.webp}` (copied from `public/favicon.svg` and `src/assets/mesa-criolla.webp`, not symlinked)
- Modify: `video/src/Root.tsx`
- Test: `video/test/escena.test.ts`

**Interfaces:**
- Consumes: `armarLinea`, `Linea` (Task 3); `Mano` (Task 4); `LineaGuion` (Task 5); `Voz` (Task 6); site `Naipe`, `nombrar`, `evaluarTantos`, `pieza`, `rangosPieza`.
- Produces:
  - `type PropsLamina = { modalidad: "envido" | "flor"; muestra: CardId; gancho: string; manos: Mano[]; lineas: LineaGuion[]; voz: Voz }`, which must be JSON-serializable;
  - the composition `id="ContarTantos"`, whose `calculateMetadata` returns `durationInFrames = Math.ceil(armarLinea(props.lineas, props.voz.palabras).duracion * 30)`;
  - in `escena.ts`, the pure helper `momentosDeCartas(linea: Linea, id: string, cartas: CardId[]): number[]`. It returns the time each card's rank word is spoken, matching in order (a repeated rank takes the next occurrence). It falls back to `linea.inicio(id) + 0.15 * index` when the word is absent.

Layout (composition pixels, from the approved mockup; `Lamina.tsx` in the spike shows the markup):
- Masthead at y 26: favicon 24 px, "El Truco" in DM Serif 19 px, "TRUCO URUGUAYO" in 9 px / 700 / letter-spacing .14em / `--accent`.
- Title at y ~70, DM Serif 44/1. It shows `gancho` through `pregunta` and `cartas`, "Cambiá una carta." from `cambio`, the hand-type label on `tercera`, and from each answer's total word until the next line it shows `terms.join(" + ") + " = " + total` with the total in `--accent`.
- Felt band, `#274838` (cream text `#faf3df`, gold `#ffe099`):
  - the muestra over the turned deck (48 px card);
  - "MUESTRA" and the name in DM Serif 28;
  - a teaching note in 12 px;
  - a divider row with the hand label ("ENVIDO · SIN PIEZA", "ENVIDO · UNA PIEZA", "ENVIDO · TRES PALOS"; "FLOR · UN SOLO PALO", "FLOR · UNA PIEZA", "FLOR · DOS PIEZAS") on the left. On the right, "TU MANO", or "TU TURNO N" during pauses, where N = `ceil(pausa.hasta - t)`.
  - three equal card slots with names and 3 px underline bars. Cards that count get a 2 px gold outline and a gold bar; the others drop to 0.38 opacity.
- Caption block: a 4 px `--accent` bar and DM Sans 700 20/1.25. Words not yet spoken are `#a9ad9f`. Pages come from `createTikTokStyleCaptions({ captions: linea.subtitulos, combineTokensWithinMilliseconds: 4000 })`.
- Bottom ~128 px: the `mesa-criolla` engraving at opacity .28, `mix-blend-mode: multiply`, masked so it fades in from the top. Nothing readable goes there.
- `valores` line: `TablaValores` shows the five piezas of the muestra's suit (2, 4, 5, caballo, sota; the rey takes the place of the muestra's own rank) with their envido values (30, 29, 28, 27, 27) or flor values (+10, +9, +8, +7, +7), and "Las figuras comunes valen 0." Use `pieza()` so the rey rule comes from the engine.
- `cierre` line: "Probá otra mano." as the title, `eltru.co/aprender/` in gold DM Sans 700, and "Voz sintética en español de Uruguay" in 9 px `--muted`.

Motion:
- cards spring in (`damping: 14`) at `momentosDeCartas`;
- the changed card flips over 0.45 s, scaling X through 0 and swapping face at the midpoint, at the moment of its spoken name in `cambio`;
- the felt outline pulses gold over 0.13 s around the word "muestra" in `pregunta`.

Audio: one `<Sequence>` per `tramo`, containing `<Audio src={staticFile(voz.archivo)} trimBefore={round(desde*30)} trimAfter={round(hasta*30)} />` from `@remotion/media`. Render `<Artifact filename="subtitulos.es.srt" content={serializeSrt(...)} />` at frame 0 only.

Image sizing: add `.lamina img { width: 100%; height: auto; }` in `piezas.css`, because site `<img>` tags carry width and height attributes.

- [ ] **Step 1: Write the failing tests** for `momentosDeCartas`:
  - `"ordena por la palabra dicha"`;
  - `"un rango repetido toma la siguiente ocurrencia"`;
  - `"sin la palabra cae al inicio de la línea"` (Review Focus 1).
- [ ] **Step 2: Run and see them fail.** `cd video && npm test`.
- [ ] **Step 3: Implement** `escena.ts`, the pieces, `Lamina.tsx` and the registration in `Root.tsx`. For `defaultProps`, load `video/public/preparado/ejemplo.json` if it exists, or else use a 2-line silent placeholder so Studio opens.
- [ ] **Step 4: Run and see them pass.** `cd video && npm test` and `cd video && npm run typecheck`.
- [ ] **Step 5: Visual check.** It needs Task 6's imported voice, so prepare props by hand: run a short Node snippet that calls `resolverManos`, then `guionContarTantos` with `lineas` overridden to the envido 03 cue texts and `valores: null`, then `importarVoz` on `~/Downloads/El Truco - Codex fuentes/envido/03/`. Write the result to `video/public/preparado/ejemplo.json`. Then render stills at frames for `cartas` + 1 s, the first pause, `respuesta1` total, `cambio` flip, `respuesta2`, `tercera` and `cierre`:

```bash
npx remotion still src/index.ts ContarTantos salida/k.png --frame=<f> --scale=3 --props=public/preparado/ejemplo.json
```

Read each image. Check that the cards are big and never clipped, that nothing readable sits below y = 1536 px, that totals match the narration, and that "TU TURNO" counts down.
- [ ] **Step 6: Commit** with the message `Dibujar la lámina de contar tantos`.

### Task 8: The `reel` CLI

**Files:**
- Create: `video/scripts/reel.ts`, `video/scripts/prueba.ts` (the contact sheet), `video/scripts/controles.ts` (post-render checks)
- Test: `video/test/controles.test.ts`

**Interfaces:**
- Consumes: Tasks 3–7. From `@remotion/bundler`: `bundle`. From `@remotion/renderer`: `selectComposition`, `renderMedia`, `renderStill`.
- Produces: the command `npm run reel -- <episodio.yaml> [--importar <dir>] [--sin-render] [--studio]`. `<dir>` is a Codex folder holding `noemi-master.wav` and `words.json`.

Steps the CLI runs:
1. `leerEpisodio`.
2. `resolverManos`.
3. `guionContarTantos`.
4. `generarVoz`, or `importarVoz` with `--importar`.
5. Write the props to `video/public/preparado/<serie>-<id>.json`. With `--studio`, launch `remotion studio --props=<that file>` and stop. With `--sin-render`, stop here.
6. `bundle` once, with the webpack override from `remotion.config.ts`, by passing `webpackOverride`.
7. `renderMedia` with codec `h264`, `scale: 3`, `inputProps` and `onArtifact` writing the SRT. Output goes to `video/salida/<serie>/<id>/`.
8. `renderStill` at the `respuesta1` total → `portada.jpg`.
9. `prueba.jpg`: 10 stills at the named beats, composed 5×2 with sharp at 216×384 each, each labeled with its time.
10. `publicacion.md`: a caption (`gancho` + "Probá otra mano en eltru.co/aprender/ #TrucoUruguayo"), alt text (muestra + the three hands + totals) and the link.
11. `controles`.
12. Print the output folder.

The output file is named `"Contar envido " + id + ".mp4"` or `"Contar flor " + id + ".mp4"`, with the SRT next to it under the same name ending in `.es.srt`.

`controles.ts`:
- `verificarSalida({ mp4, srt, linea, lineas }): string[]` returns a list of problems, empty meaning OK. It checks:
  - duration (ffprobe) within 0.1 s of `linea.duracion`;
  - exactly one AAC stream at 48 kHz;
  - `silencedetect` (−45 dB, 0.8 s) finds one silence per `pausa` plus the tail, each starting within 0.3 s of its plan;
  - `plano(the SRT text joined) === plano(the lines joined)`.
- Factor the parsing into pure functions (`parsearSilencios(stderr: string)`, `textoDeSrt(srt: string)`) and unit-test those.
- Any problem makes the CLI exit with code 1 after printing the list.

- [ ] **Step 1: Write the failing tests:**
  - `"parsearSilencios lee inicio y fin"`, with this stderr sample from the spike, expecting `[{inicio: 8.321104, fin: 11.718458}, {inicio: 22.126, fin: 25.437625}]`:
    ```
    [silencedetect @ 0x7ae4ca4840] silence_start: 8.321104
    [silencedetect @ 0x7ae4ca4840] silence_end: 11.718458 | silence_duration: 3.397354
    [silencedetect @ 0x7ae4ca4840] silence_start: 22.126
    [silencedetect @ 0x7ae4ca4840] silence_end: 25.437625 | silence_duration: 3.311625
    ```
  - `"textoDeSrt une las líneas sin números ni tiempos"`;
  - `"verificarSalida informa una pausa faltante"`, using a fake ffprobe/silence result.
- [ ] **Step 2: Run and see them fail.** `cd video && npm test`.
- [ ] **Step 3: Implement** `controles.ts`, `prueba.ts` and `reel.ts`.
- [ ] **Step 4: Run and see them pass.** `cd video && npm test`.
- [ ] **Step 5: Run end to end.** Write `video/episodios/contar-envido/03.yaml`: muestra `espadas-03`; hands `[oros-05, oros-07, copas-02]`, `{cambio: {de: oros-05, a: espadas-05}}`, `[copas-01, oros-06, bastos-11]`; `lineas` overriding all seven to the Codex cue texts; `valores: null`. Then run:

```bash
npm run reel -- video/episodios/contar-envido/03.yaml --importar "$HOME/Downloads/El Truco - Codex fuentes/envido/03"
```

Expected: exit 0, no control problems, and the MP4, SRT, `portada.jpg`, `prueba.jpg` and `publicacion.md` in `video/salida/contar-envido/03/`. Read `prueba.jpg`.
- [ ] **Step 6: Commit** with the message `Agregar el comando reel con controles de salida`.

### Task 9: Parity, a fresh voice, the skill and the PR

**Files:**
- Create:
  - `video/episodios/contar-flor/03.yaml` (from `~/Downloads/El Truco - Codex fuentes/flor/03/manifest.json`, with all eight lines overridden and `valores: null`);
  - `video/episodios/contar-envido/07.yaml` (new: muestra `bastos-06`, hand `[copas-04, copas-07, espadas-01]`, change `copas-04` → `bastos-04`, third hand `{familia: tres-palos-distintos, semilla: 7}`, hook "¿Cuánto tenés de envido?", no overrides);
  - `video/README.md` (Spanish: install, the env vars, commands, how to add a template);
  - `.claude/skills/reel/SKILL.md`.

- [ ] **Step 1: Flor parity.** Run `npm run reel -- video/episodios/contar-flor/03.yaml --importar "$HOME/Downloads/El Truco - Codex fuentes/flor/03"`. Expected: exit 0.
- [ ] **Step 2: Side-by-side check.** Put the matching frames of `~/Downloads/El Truco - Nuevas manos/{Envido,Flor}/Contar * 03.mp4` (extract with `npx remotion ffmpeg -ss <t> -i … -frames:v 1`) next to `prueba.jpg`. Send it to the user and ask whether the new versions are at least as clear. This is the acceptance gate from the spec. Note in the PR that the valores scene is omitted in parity episodes, because the imported audio lacks that line.
- [ ] **Step 3: Fresh voice.** With `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in the root `.env`, run `npm run reel -- video/episodios/contar-envido/07.yaml`. Expected: one ElevenLabs request and exit 0. Running it again makes no request (log "voz en caché"). Listen-check: send the MP4 to the user.
- [ ] **Step 4: Write the skill** `.claude/skills/reel/SKILL.md` (frontmatter `name: reel`; the description says to use it when making a social-media reel or a new reel template). It covers:
  - **New reel:** agree on the idea → write `video/episodios/<serie>/<id>.yaml` (show the 07 example) → `npm run reel -- …` → read `prueba.jpg` → adjust the YAML → re-render. Never hand-type totals; let the engine and override checks catch mistakes.
  - **New template:** copy `plantillas/contar-tantos`, adapt `guion.ts` (with tests), the composition and the registration, preview with `npm run reel -- <ep> --studio`.
  - Posting is manual and uses `publicacion.md`.
- [ ] **Step 5: Write `video/README.md`** with the same content for people.
- [ ] **Step 6: Run the full checks.** At the root run `npm ci && npm run check`, then in `video/` run `npm ci && npm test && npm run typecheck`. Expected: all pass. Record the output for the PR.
- [ ] **Step 7: Commit and open the PR.** Commit with the message `Agregar episodios de paridad, la skill reel y la guía`. Push `codex/issue-<n>` and open a PR that closes the issue, with the check results and the side-by-side image linked, following CONTRIBUTING.md.
