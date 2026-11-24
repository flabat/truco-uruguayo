// Voz de la narración: ElevenLabs con tiempos por carácter, normalizada y guardada por contenido.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { LineaGuion, Palabra } from "./linea.ts";
import { plano } from "./texto.ts";

const ejecutar = promisify(execFile);
const modelo = "eleven_v4";

export interface Voz { archivo: string; palabras: Palabra[] }
interface Alineacion { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }

const textoDe = (lineas: LineaGuion[]) => lineas.map((l) => l.texto.trim()).join(" ");

export function claveVoz(lineas: LineaGuion[], ajustes: { vozId: string; modelo: string }): string {
  return createHash("sha256").update(JSON.stringify({ ...ajustes, texto: textoDe(lineas) })).digest("hex");
}

export function palabrasDesdeAlineacion(a: Alineacion): Palabra[] {
  const palabras: Palabra[] = [];
  let actual: Palabra | null = null;
  a.characters.forEach((c, i) => {
    if (/\s/.test(c)) { actual = null; return; }
    if (!actual) {
      actual = { text: "", start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i] };
      palabras.push(actual);
    }
    actual.text += c;
    actual.end = a.character_end_times_seconds[i];
  });
  return palabras;
}

/** Loudnorm en dos pasadas a −16 LUFS, −1.5 dBTP, LRA 9, 48 kHz mono, con el ffmpeg de Remotion. */
async function normalizar(entrada: string, salida: string, raiz: string) {
  const filtro = "loudnorm=I=-16:TP=-1.5:LRA=9";
  const ffmpeg = (args: string[]) => ejecutar("npx", ["remotion", "ffmpeg", "-hide_banner", ...args], { cwd: raiz, maxBuffer: 1 << 24 });
  const { stderr } = await ffmpeg(["-i", entrada, "-af", filtro + ":print_format=json", "-f", "null", "-"]);
  const m = JSON.parse(stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1));
  const medido = `${filtro}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await ffmpeg(["-y", "-v", "error", "-i", entrada, "-af", medido, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", salida]);
}

function rutas(raiz: string, clave: string) {
  const carpeta = path.join(raiz, "public", "voz");
  mkdirSync(carpeta, { recursive: true });
  return { wav: path.join(carpeta, clave + ".wav"), json: path.join(carpeta, clave + ".json"), archivo: `voz/${clave}.wav` };
}

function enCache(raiz: string, clave: string): Voz | null {
  const r = rutas(raiz, clave);
  return existsSync(r.wav) && existsSync(r.json) ? { archivo: r.archivo, palabras: JSON.parse(readFileSync(r.json, "utf8")) } : null;
}

export async function generarVoz(lineas: LineaGuion[], o: {
  raiz: string; fetch?: typeof fetch; entorno?: Record<string, string | undefined>;
}): Promise<Voz> {
  const entorno = o.entorno ?? process.env;
  const vozId = entorno.ELEVENLABS_VOICE_ID;
  if (!vozId) throw new Error("Falta ELEVENLABS_VOICE_ID. Agregala al .env de la raíz del repositorio.");
  const clave = claveVoz(lineas, { vozId, modelo });
  const guardada = enCache(o.raiz, clave);
  if (guardada) return guardada;

  const apiKey = entorno.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Falta ELEVENLABS_API_KEY. Agregala al .env de la raíz del repositorio.");
  const respuesta = await (o.fetch ?? fetch)(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vozId)}/with-timestamps?output_format=mp3_44100_192`,
    { method: "POST", headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text: textoDe(lineas), model_id: modelo }) },
  );
  if (!respuesta.ok) throw new Error(`ElevenLabs respondió ${respuesta.status}: ${(await respuesta.text()).slice(0, 300)}`);
  const datos = await respuesta.json() as { audio_base64: string; alignment: Alineacion | null; normalized_alignment: Alineacion | null };
  const alineacion = datos.alignment ?? datos.normalized_alignment;
  if (!alineacion) throw new Error("ElevenLabs no devolvió los tiempos de los caracteres.");

  const mp3 = path.join(mkdtempSync(path.join(tmpdir(), "voz-")), "voz.mp3");
  writeFileSync(mp3, Buffer.from(datos.audio_base64, "base64"));
  const r = rutas(o.raiz, clave);
  await normalizar(mp3, r.wav, o.raiz);
  const palabras = palabrasDesdeAlineacion(alineacion);
  writeFileSync(r.json, JSON.stringify(palabras));
  return { archivo: r.archivo, palabras };
}

/** Usa una grabación existente (por ejemplo, la de Codex) si sus palabras dicen exactamente el guion. */
export async function importarVoz(lineas: LineaGuion[], wav: string, palabrasJson: string, raiz: string): Promise<Voz> {
  const palabras: Palabra[] = JSON.parse(readFileSync(palabrasJson, "utf8")).map(
    ({ text, start, end }: Palabra) => ({ text, start, end }));
  let i = 0;
  for (const linea of lineas) {
    const n = linea.texto.trim().split(/\s+/).length;
    const dichas = palabras.slice(i, i + n).map((p) => p.text).join(" ");
    if (plano(dichas) !== plano(linea.texto)) {
      throw new Error(`La voz importada no coincide desde la línea ${linea.id}: se esperaba «${linea.texto}» y dice «${dichas}».`);
    }
    i += n;
  }
  if (i !== palabras.length) throw new Error(`La voz importada tiene ${palabras.length - i} palabras de más al final.`);
  const clave = claveVoz(lineas, { vozId: "importada", modelo: "archivo" });
  const guardada = enCache(raiz, clave);
  if (guardada) return guardada;
  const r = rutas(raiz, clave);
  await normalizar(wav, r.wav, raiz);
  writeFileSync(r.json, JSON.stringify(palabras));
  return { archivo: r.archivo, palabras };
}
