# Programmatic reels for El Truco — design

Status: approved · 2026-11-23

## Intent

El Truco posts short vertical videos (reels) that teach one rule at a time and send viewers to eltru.co. The first batch (Contar envido 01–06, Contar flor 01–06, ¿Cantás flor?) came out well, but Codex made them in long agent sessions: four parallel agents, ~1,700 tool calls and ~240M input tokens over ~22 hours. The render recipe lived in throwaway Python files in `/private/tmp`, patched by string replacement for every variant.

We want the **idea** for a reel to be discussed in a short conversation with Claude, which produces one small episode file. A tool in the repo then turns that file into the finished MP4 + subtitles with no agent in the loop. New formats ("templates") must be cheap to add later.

## Goals

- `npm run reel -- <episode file>` produces a 1080×1920, 30 fps H.264/AAC MP4, a Spanish `.srt`, a cover image and a contact sheet for review.
- The rules engine (`src/motor`) computes every number and every card that counts. Nobody types a total.
- The narration is generated once per text and cached. Re-rendering after a layout change costs no voice credits and no agent tokens.
- Variants ("5 more like this") come from the lesson hand generator (`familia` + `semilla`), not from new prose.
- The look reuses the site: card art, `Naipe`, `nombrar`, colors, DM Serif / DM Sans, the favicon (2 de oro) and the `mesa-criolla` engraving.
- A new template is one React component plus a data schema, previewable in Remotion Studio.

## Non-goals

- Creating accounts on, or posting to, Instagram, TikTok or Facebook. That was ~75% of the main Codex thread's tokens. The tool may write a `publicacion.md` with a suggested caption, alt text and link; a person posts.
- Replacing the lesson pages' demonstrations (`demostracion.ts`). The scene components could later run on the site through `@remotion/player`, but not in this project.
- Music, multiple voices, or languages other than Rioplatense Spanish.

## Anti-goals (failure even if it "works")

- Each new reel still needs a long agent session.
- A reel states a total or a rule the engine disagrees with.
- The reels drift away from the site's look, or the template turns into pixel-coordinate code like the Pillow scripts.
- The video tooling makes `npm ci` / `npm run check` slower or more fragile for the site.

## Constraints

- **Repo workflow (AGENTS.md / CONTRIBUTING.md):** reserve an issue with a `codex/issue-<n>` branch, use a separate worktree, integrate through a PR, and run `npm ci` and `npm run check` before review.
- **Remotion license:** free for individuals and companies of up to 3 people (everyone in the company counts, not just users of Remotion). Beyond that it costs $25 per seat per month, or $0.01 per render with a $100 monthly minimum. Remotion 5 will change the terms. Confirmed: El Truco is a solo developer, so the free license applies.
- **Voice:** ElevenLabs, voice "Noemí Suave Reflexiva", model `eleven_v4`, Uruguayan Spanish (the settings the Codex cue sheets recorded). Codex reached ElevenLabs through the ChatGPT apps connector, not an API key. This tool calls the REST API directly, so it needs an ElevenLabs API key (the developer has one) in `ELEVENLABS_API_KEY` (in `.env`, already gitignored), never committed. The builder finds the voice id with `GET /v1/voices`.
- **Platform overlays:** the bottom ~20% of a 9:16 reel is covered by platform UI (captions, buttons). Only decoration goes there.
- Node 24 (the project uses `>=22.23.4`). ffmpeg isn't installed on the Mac; Remotion bundles its own.

## Approaches considered

| | What it is | Trade-off | Verdict |
|---|---|---|---|
| A. Keep the Codex Python/Pillow scripts | Move `render.py` and its helpers into the repo and add parameters | The look is proven, but no site code is reused, every format is hundreds of lines of pixel coordinates, and it adds Python to a Node repo | Rejected |
| **B. Remotion** | React compositions rendered by headless Chrome and the ffmpeg Remotion bundles | Reuses the site's React components, CSS, fonts and engine directly. It has a Studio, captions and SRT export, and parametrized renders. The license is free only up to 3 people | **Chosen** |
| C. HyperFrames | HTML/GSAP compositions, Apache 2.0, built for agents | Better license, built-in Whisper and local TTS. But it can't use our React components or TS engine without our own build and frame adapter, and it's still pre-1.0 | Fallback if the license becomes a problem |

### What the spikes proved (throwaway code in the session scratchpad)

1. **Reuse works without changing the site.** A Remotion 4.0.540 project imported `Tapete`, `CartaEnLeccion`, `Naipe`, `nombrar`, `evaluarTantos`, `site.css`, `mesa.css`, `aprender.css` and `@fontsource` straight from `src/`. All it took was a webpack alias to `src/` and `node_modules` resolution against the repo root.
2. **Phone layout at 3x.** Composing at 360×640 and rendering with `--scale=3` produces sharp 1080×1920 output, and the site's mobile media queries apply naturally.
3. **Audio, timing and captions.** One continuous narration plus word timings was cut between lines, with a 3 s counting pause after each question. Cards entered as the narrator named them, the sum appeared on "treinta", the card changed on "por", and captions highlighted each word as spoken. The `.srt` was written during the render with `<Artifact>`. Silence detection on the output confirmed the two pauses (about 3.3 s each) and clean cuts.
4. **Speed.** A 41.5 s reel rendered in about 19 s on this Mac.
5. **Captions must break at sentence ends.** Pagination by time alone split "cantás? Treinta" across the pause. Setting `pageBreakAfter` on words ending in `.`, `?` or `!` fixed it.
6. **The full game table is the wrong layout for lessons.** `Tapete` grows to fill the frame and spends the space on three seats that don't matter for counting. A reel-specific layout ("lámina") built from the same small pieces (`Naipe`, `nombrar`, tokens, fonts) matches the Codex reels' density. A mockup still was approved for direction.
7. **Practical details.** Site `<img>` tags carry `width`/`height` attributes, so they need `height:auto` outside the site's CSS. Remotion serves symlinked folders from `public/` but not symlinked files.

## Design

### Where it lives

A separate npm package in `video/`, with its own `package.json` and lockfile, so Remotion and Chrome never enter the site's dependency tree or `npm run check`. It imports the site through an alias, `@site` → `../src`.

```
video/
  package.json          remotion, @remotion/cli, @remotion/captions, @remotion/media, zod, yaml (exact pins)
  remotion.config.ts    alias @site, public dir, jpeg frames
  src/
    Root.tsx            registers one <Composition> per template
    lib/
      linea.ts          narration + word timings → timeline (tramos, pausas, subtítulos, cuando())
      numeros.ts        number → Rioplatense words ("treinta y uno")
      escena.ts         shared hooks: useMomento(), entradas, resaltar, countdown
    piezas/             reel-only building blocks: Cabecera, BandaPaño, Muestra, Mano, Subtitulos, PieGrabado
    plantillas/
      contar-tantos/    template #1: envido and flor counting (reproduces the Codex series)
        esquema.ts      zod schema for the episode data
        guion.ts        engine result → default narration lines + named beats
        Lamina.tsx      the composition
  episodios/            committed episode files (*.yaml)
  public/               copied assets (engraving, favicon); the card images come from a symlinked folder
    voz/                voice cache, gitignored, keyed by hash(voice, model, text); inside public/ so staticFile can serve it
  scripts/
    reel.ts             CLI: validate → voice → render MP4 → contact sheet → publicacion.md
  salida/               gitignored outputs
```

The root `package.json` gets thin scripts that delegate to it: `reel`, `reel:studio` and `reel:instalar` (`npm ci --prefix video`).

### The episode file: the only thing a Claude session writes

```yaml
plantilla: contar-tantos
serie: contar-envido
id: "07"
modalidad: envido
muestra: bastos-06
manos:
  - [copas-04, copas-07, espadas-01]        # sin pieza
  - cambio: { de: copas-04, a: bastos-04 }  # ahora con pieza
  - { familia: tres-palos-distintos, semilla: 41 }   # generated hand
gancho: "¿Cuánto tenés de envido?"
# Optional: override any generated line by its id. Overrides are checked against the engine.
lineas:
  cierre: "Probá otra mano en El Truco."
```

A hand can be written out, given as a change to the previous hand, or generated from `familia` + `semilla` with the lesson generators (`src/aprendizaje/generadores`). The template's `guion.ts` builds the narration from the engine's result, for example "Treinta y uno. Veinte por el palo, más siete, más cuatro. El as queda afuera.", and gives every line an id. The episode only adds the hook and any overrides.

**Validation before spending anything:**
- The schema check passes.
- Every hand is legal.
- Every spoken total and card in an overridden line matches `evaluarTantos`, with numbers parsed through `numeros.ts`.
- Each card the narration names is in the hand.

### Voice

`scripts/voz.ts` sends the **whole** narration in one request to ElevenLabs `POST /v1/text-to-speech/{voice}/with-timestamps`, so the prosody stays natural across lines. It converts the character alignment to word timings and stores `voz.wav` and `palabras.json` in the cache under a hash of the inputs. A changed line only re-voices when the text changes. A `--importar <wav> <timings>` option takes the existing Noemí recordings from the Codex run.

Loudness: normalize the final mix to −16 LUFS (true peak −1.5) with the bundled ffmpeg `loudnorm`, in two passes, as Codex did.

### The timeline (proven in the spike)

`linea.ts` takes the lines and word timings and:
- splits the words by line, failing loudly if the text doesn't match;
- cuts the audio between lines at the midpoint of the silence;
- inserts a counting pause (3 s by default) after the lines the template marks with `pausa: true`, and a short breath elsewhere. Pauses are marked per line, not inferred from `?`: Codex's envido 03 opens with a question that has no counting pause after it.

It exposes:
- `tramos`, one `<Audio trimBefore/trimAfter>` per line;
- `pausas`, for the "Tu turno" countdown;
- `subtitulos`, as Remotion `Caption[]` with sentence page breaks;
- `cuando(línea, palabra, n)`, which gives the moment a word is spoken, in video time;
- `duracion`, which feeds `calculateMetadata`.

Templates time everything with `cuando()`. There are no hard-coded seconds.

### Template #1: `contar-tantos` (lámina layout)

The layout is a 360×640 composition rendered at 3x, top to bottom:
1. **Masthead.** Favicon (2 de oro), "El Truco", "TRUCO URUGUAYO".
2. **Title line.** The hook or question, which turns into the equation (`20 + 4 + 7 = 31`, the total in `--accent`) when the answer is spoken.
3. **Felt band.** The muestra over the deck, the muestra's name in DM Serif, one teaching note, a divider labelled with the hand type ("ENVIDO · SIN PIEZA") and "Tu turno N" during pauses. Then three large cards with names and underline bars. Cards that count get a gold outline; the rest fade to 38%.
4. **Caption block.** A red bar and DM Sans 700, highlighting each word as it's spoken.
5. **Bottom ~20%.** The `mesa-criolla` engraving, faded into the paper. Decoration only, sitting under the platform UI.
6. **Closing beat.** "Probá otra mano.", `eltru.co/aprender/`, and the line "Voz sintética en español de Uruguay".

Motion: cards are dealt on their spoken names (spring), the swapped card flips at the word that introduces it, the totals pop on the answer, and the felt gives a short pulse when the narrator says "muestra". All motion is driven by frames; CSS animations aren't used.

Acceptance for template #1: re-render "Contar envido 03" and "Contar flor 03" from episode files, using the imported Noemí audio. Set them side by side with the Codex versions in a contact sheet. They should be at least as clear and as readable.

### Outputs and review

`salida/<serie>/<id>/`:
- `<Título> <id>.mp4`
- `.es.srt`
- `portada.jpg`, a cover from `renderStill` at the answer beat
- `prueba.jpg`, a contact sheet of 8–10 frames at named beats, for a quick look by a person or Claude
- `publicacion.md`, with caption, alt text and link, all drafts

Automated checks after rendering:
- duration equals the timeline;
- there's an audio stream;
- silences match the planned pauses (ffmpeg `silencedetect`);
- the `.srt` text joined equals the narration.

### Working with Claude

A project skill, `.claude/skills/reel/SKILL.md`, describes two loops:
- **New reel:** talk through the idea → write `episodios/<serie>/<id>.yaml` → `npm run reel -- …` → read `prueba.jpg` → adjust the file → render again. Expected cost: a few thousand tokens and a minute or two of rendering.
- **New template:** copy `plantillas/contar-tantos`, change `esquema.ts`, `guion.ts` and the composition, preview in `npm run reel:studio`, and add a sample episode.

Remotion's official agent skills (`npx remotion skills add`) can be installed in `video/` for reference.

### Testing

Pure logic sits in `video/src/lib` and `plantillas/*/guion.ts`, with no Remotion imports, and is unit-tested with `node --test` next to the package:
- `linea` (split, cuts, pauses, page breaks, `cuando`);
- `numeros` (0–40, flor totals);
- `guion` (the lines say what `evaluarTantos` says, for every hand type);
- episode validation (bad cards, a wrong total in an override).

A smoke test renders a 2-second clip and one still. `video/` gets its own `npm test`. The site's `npm run check` stays as it is. CI integration is left to the builder (see below).

## Later templates (not in this project)

- **¿Hay flor?** Same lámina, decide-then-reveal, with the muestra change as the twist.
- **¿Quién gana la vuelta?** Two cards and a muestra, using `compararCartas`.
- **Mano jugada.** A replay (`motor/replay*.ts`) shown on a cropped `Tapete` with only the cards played. This is where the real table earns its space.
- **Lesson demonstrations on the site** through `@remotion/player`, sharing scene components.

## Decided in conversation

- Generate reels from code with templates. Discuss ideas with Claude; no long agent sessions per video.
- Remotion over HyperFrames and over the Codex Python scripts, after the reuse analysis and two spikes.
- Reels use a dedicated layout built from site pieces, not the full game table (the table took too much space).

## My calls (please check)

- A separate `video/` package rather than adding dependencies to the root.
- Episodes in YAML; templates generate the narration from the engine, and the episode overrides lines.
- One TTS request per episode, cut between lines; cache keyed by content hash.
- Countdown pause of 3 s after each question.
- Outputs aren't committed. Episode files are.
- Posting stays manual; the tool only drafts `publicacion.md`.

## Left to the builder

- Exact visual tuning of the lámina (sizes, how much the engraving fades behind captions, card flip easing).
- Whether `video/` tests run in CI and how (Chrome download caching).
- How `reel.ts` orchestrates rendering (Node API `renderMedia` vs the CLI).
- Number-to-words details beyond 0–40.
