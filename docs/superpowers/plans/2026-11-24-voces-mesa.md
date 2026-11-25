# Voces y efectos de la mesa (etapa 4e): plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usá superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que cada asiento de la mesa nueva tenga su propia voz rioplatense para cantos, frases del pie y declaraciones de tantos, con efectos de naipe, reparto, ficha y festejo, todo guardado en la app y sin llamadas durante el juego.

**Arquitectura:** un módulo puro (`app/src/sonido/frases.ts`) arma la lista de frases desde el código del motor y del cliente y fija el nombre de archivo de cada clip. Un script versionado (`scripts/voces/generar.ts`) la recorre, pide cada clip a ElevenLabs una sola vez (caché local ignorado por git), recorta silencios, iguala el volumen y escribe los MP3 en `app/assets/sonido/` junto con un manifiesto de `require` generado. Un reproductor con motor inyectable (`reproductor.ts`) resuelve preferencia, desbloqueo web y cola por asiento. `index.ts` lo une con `expo-audio`.

**Tecnología:** Node 24 (TypeScript sin compilar), API de ElevenLabs (`eleven_v4`, `mp3_44100_128`), el ffmpeg que trae Remotion en `video/` (solo `aresample`, `atrim`, `volume` y `libmp3lame` están disponibles), `expo-audio` ~58, `expo-asset`, `expo-secure-store`.

**Spec:** [`docs/superpowers/specs/2026-11-24-mesa-nueva-design.md`](../specs/2026-11-24-mesa-nueva-design.md), secciones «Movimiento, hápticos y sonido» y «Voces». Etapa: [`2026-11-24-etapa-4-app-expo.md`](2026-11-24-etapa-4-app-expo.md) (4e).

## Restricciones globales

- Sin costos recurrentes: las voces se generan una vez con las claves del usuario y se guardan en la app.
- Las claves llegan solo por entorno (`ELEVENLABS_API_KEY`, `OPENAI_API_KEY`). Nunca se imprimen ni se escriben en `.env`, en el repo ni en registros.
- El plan de ElevenLabs solo acepta `output_format=mp3_44100_128`.
- La voz depende del número de asiento (0 a 5), no de la cuenta. Las computadoras también hablan.
- Los textos que se dicen salen del código: `canto` de `paquetes/cliente/src/cantos.ts` (con «Me voy al mazo» para `mazo`, como `vocesEnAccion`), `textoFrasePie` de `paquetes/motor/src/senas-pie.ts` y los totales posibles de `evaluarTantos`. El PR #356 cambia los verbos de los avisos, no estas palabras.
- Rangos que permite el motor (enumerados sobre las 40 muestras y todas las manos): envido 0–7 y 20–37; flor 20–47.
- No se genera el lote completo hasta que el usuario apruebe la muestra (seis voces diciendo «¡Truco!», «Quiero» y «treinta y tres de envido», con la declaración entera y armada por partes).
- En la web el sonido arranca después del primer toque o tecla. La preferencia de sonido se recuerda entre sesiones.
- Textos, commits y PR en español rioplatense.

## Elección de voces

ElevenLabs tiene voces nativas rioplatenses en su biblioteca compartida. La API de voz de OpenAI solo imita el acento con instrucciones y suena neutra, así que se usa ElevenLabs para las seis. Asientos alternados por género para que dos vecinos nunca suenen parecido:

| Asiento | Voz | Id | Carácter |
| --- | --- | --- | --- |
| 0 | Tomás (Argentina y Uruguay) | `QK4xDwo9ESPHA4JNUpX3` | hombre joven |
| 1 | Sofía | `h60rOzgfLmYsntfqgGu2` | mujer adulta |
| 2 | Patricio | `8cQzlh6lShmndqJg4Yxw` | hombre adulto, algo ronco |
| 3 | Cande | `yFykvY9iSJewrANOC0cU` | mujer joven |
| 4 | Juanma | `N6aRe3hk1YqaHDtQpTAH` | hombre de voz grave |
| 5 | Nieve | `nAFxIJGj7iSTeltygOfB` | mujer mayor |

La tabla queda en `scripts/voces/voces.ts` y puede cambiar tras la muestra.

## Foco de revisión

- **Clip que falta en el disco.** Si el manifiesto nombra un archivo inexistente, Metro rompe el build: la prueba de archivos recorre el manifiesto y comprueba cada ruta.
- **Total fuera de rango.** `reproducirVoz` con un total que no tiene clip (por ejemplo 15 de envido) no lanza: no suena nada. Prueba en el reproductor.
- **Varias voces del mismo asiento seguidas.** La segunda espera a que termine la primera, no la corta. Prueba con motor falso.
- **Sonido apagado a mitad de una cola.** Apagar corta lo que suena y vacía las colas. Prueba en el reproductor.
- **Web antes del primer toque.** Las llamadas se descartan, no se acumulan para sonar todas juntas al tocar. Prueba en el reproductor.

---

### Tarea 1: lista de frases y nombres de archivo

**Archivos:**
- Crear: `app/src/sonido/frases.ts`
- Prueba: `tests/unit/sonido-frases.test.ts`

**Interfaces:**
- Produce:
  - `type CantoVoz = Exclude<TipoAccionOnline, "carta">`
  - `type FraseVoz = { tipo: "canto"; canto: CantoVoz } | { tipo: "pie"; frase: FrasePie } | { tipo: "tantos"; motivo: "envido" | "flor"; total: number }`
  - `const tantosPosibles: { envido: readonly number[]; flor: readonly number[] }`
  - `function numeroEnPalabras(n: number): string` (0–47, «veintiuno», «treinta y tres»)
  - `function textoDeFrase(f: FraseVoz): string` (lo que se le manda al servicio: «¡Truco!», «Quiero.», «Treinta y tres de envido.»)
  - `function clavesDeFrase(f: FraseVoz): string[]` (uno o dos nombres de clip, según el método aprobado)
  - `function frasesDeVoz(): FraseVoz[]` y `function clipsDeVoz(): { clave: string; texto: string }[]`

- [ ] **Paso 1: pruebas que fallan.** `tantosPosibles` coincide con la enumeración de `evaluarTantos` sobre todo el mazo. Simular cien manos al azar de 2, 4 y 6 asientos con `repartirOnline`, `iniciarOnline`, `legalesOnline` y `aplicarOnline`: cada tipo legal distinto de `carta` y cada `tantoGanador` de los cobros de envido y flor tiene clave con archivo previsto. `numeroEnPalabras(21) === "veintiuno"`, `(33) === "treinta y tres"`, `(0) === "cero"`. Las claves son únicas y cumplen `/^[a-z0-9-]+$/`.
- [ ] **Paso 2:** `node --test tests/unit/sonido-frases.test.ts` falla.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** la prueba pasa.
- [ ] **Paso 5:** commit.

### Tarea 2: script de generación y muestra

**Archivos:**
- Crear: `scripts/voces/generar.ts`, `scripts/voces/voces.ts`, `scripts/voces/audio.ts`
- Modificar: `.gitignore` (agregar `scripts/voces/.cache/`), `package.json` (`"voces:generar": "node scripts/voces/generar.ts"`)
- Prueba: `tests/unit/sonido-audio.test.ts`

**Interfaces:**
- Consume: `clipsDeVoz()` de la tarea 1.
- Produce: `recortarYNivelar(pcm: Int16Array, frecuencia: number): Int16Array` en `audio.ts` (umbral −40 dBFS, 40 ms de margen, RMS de la parte con voz a −18 dBFS sin pasar −1 dBFS de pico, fundidos de 8 ms).
- CLI: `node scripts/voces/generar.ts --muestra` escribe en `scripts/voces/.cache/muestra/`; sin argumentos genera el lote en `app/assets/sonido/voces/<asiento>/<clave>.mp3`. `FFMPEG` apunta al binario; si falta, se busca el de Remotion en `video/node_modules/@remotion/compositor-*/ffmpeg`.

- [ ] **Paso 1: prueba que falla.** Un PCM con 200 ms de silencio, 300 ms de tono a −30 dBFS y 200 ms de silencio sale con largo entre 300 y 400 ms y RMS a −18 ± 1 dBFS; un tono a −3 dBFS no supera −1 dBFS de pico.
- [ ] **Paso 2:** falla. **Paso 3:** implementar `audio.ts`, después `generar.ts`: caché por sha256 de `{voz, modelo, texto, ajustes}`, decodificar a PCM mono con ffmpeg, `recortarYNivelar`, codificar a MP3 mono 24 kHz y 48 kbps. **Paso 4:** pasa.
- [ ] **Paso 5:** generar la muestra (las seis voces × «¡Truco!», «Quiero.», «Treinta y tres de envido.», «Treinta y tres» y «de envido», más la unión por partes). Mandarla con SendUserFile y preguntar con AskUserQuestion: ¿se aprueban las voces?, ¿declaración entera o por partes? **No seguir sin respuesta.**
- [ ] **Paso 6:** commit.

### Tarea 3: lote completo, efectos y manifiesto

**Archivos:**
- Crear: `scripts/voces/efectos.ts`, `app/assets/sonido/voces/**`, `app/assets/sonido/efectos/{naipe,reparto,ficha,festejo}.mp3`, `app/src/sonido/recursos.ts` (generado), `app/src/sonido/efectos.ts`
- Prueba: `tests/unit/sonido-recursos.test.ts`

**Interfaces:**
- Produce: `type Efecto = "naipe" | "reparto" | "ficha" | "festejo"`; `recursos.ts` exporta `voces: Record<number, Record<string, number>>` y `efectos: Record<Efecto, number>` (módulos de `require`).

- [ ] **Paso 1: prueba que falla.** Cada clave de `clipsDeVoz()` existe en `voces[a]` para los asientos 0–5, el archivo existe y empieza con cabecera MP3; no hay archivos sobrantes; los cuatro efectos existen; el total de `app/assets/sonido` pesa menos de 6 MB.
- [ ] **Paso 2:** falla. **Paso 3:** generar el lote con la aprobación. Efectos sintetizados en `efectos.ts` (ruido filtrado para naipe y reparto, parciales cortos para la ficha, arpegio breve para el festejo), sin muestras de terceros: no requieren licencia; queda dicho en `app/src/sonido/README.md`. El script escribe `recursos.ts`. **Paso 4:** pasa.
- [ ] **Paso 5:** commit.

### Tarea 4: reproductor

**Archivos:**
- Crear: `app/src/sonido/reproductor.ts` (puro), `app/src/sonido/index.ts` (expo-audio), `app/src/sonido/README.md`
- Modificar: `app/package.json` (`expo-audio`, `expo-asset`), `app/app.json` (plugin `expo-audio` sin micrófono)
- Prueba: `tests/unit/sonido-reproductor.test.ts`

**Interfaces:**
- Consume: `FraseVoz`, `clavesDeFrase`, `recursos.ts`.
- Produce (lo que llama la 4d):
  - `reproducirVoz(asiento: number, frase: FraseVoz): void`
  - `reproducirEfecto(nombre: Efecto, opciones?: { volumen?: number }): void` (naipe de otro jugador: `volumen: 0.5`)
  - `precargarSonidos(asientos: readonly number[]): Promise<void>` (al entrar a la mesa)
  - `sonidoActivado(): boolean`, `cambiarSonido(activo: boolean): Promise<void>`, `useSonidoActivado(): [boolean, (v: boolean) => void]`
  - `crearReproductor(motor: MotorAudio, opciones: { guardado: Guardado; esWeb: boolean; escucharPrimerGesto?: (alGesto: () => void) => void }): Reproductor`

- [ ] **Paso 1: pruebas que fallan** con un `MotorAudio` falso: voz de un asiento usa la clave correcta; dos voces del mismo asiento se encolan; asientos distintos suenan a la vez; total sin clip no suena; apagado no suena y corta la cola; la preferencia se lee y se guarda en `truco.sonido`; en la web nada suena antes del primer gesto y las llamadas previas se descartan.
- [ ] **Paso 2:** falla. **Paso 3:** implementar. `index.ts`: un `AudioPlayer` por asiento y uno por efecto, `replace` y `play`, fin por `playbackStatusUpdate.didJustFinish`; `setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers" })`; precarga con `Asset.loadAsync`. Preferencia: `expo-secure-store` en iOS y Android, `localStorage` en la web. **Paso 4:** pasa; `npm run app:tipos` pasa.
- [ ] **Paso 5:** commit.

### Tarea 5: verificación y PR

- [ ] `npm ci`, `npm run app:tipos`, `npm run app:exportar` (los MP3 aparecen en `app/dist`), `CHECK_STACK=1 npm run check`, `git diff --check`.
- [ ] PR con `Closes #369`, resultados, peso total de los clips y la tabla de voces.
