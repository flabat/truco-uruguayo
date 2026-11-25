#!/usr/bin/env node
// Genera las voces de la mesa una sola vez con ElevenLabs.
//
//   ELEVENLABS_API_KEY=… node scripts/voces/generar.ts --muestra   # muestra para aprobar
//   ELEVENLABS_API_KEY=… node scripts/voces/generar.ts             # lote completo en app/assets/sonido/voces
//
// Cada pedido se guarda en scripts/voces/.cache (ignorado por git), así que repetir el
// comando no vuelve a cobrar. La clave llega solo por el entorno y nunca se imprime.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, globSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { clipsDeVoz, metodoDeclaracion, type Clip } from "../../app/src/sonido/frases.ts";
import { recortarYNivelar, unir } from "./audio.ts";
import { formatoPedido, modelo, retomas, semilla, voces, type VozDeAsiento } from "./voces.ts";
import { escribirEfectos } from "./efectos.ts";

const ejecutar = promisify(execFile);
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cache = path.join(raiz, "scripts/voces/.cache");
const destino = path.join(raiz, "app/assets/sonido");
/** Frecuencia y tasa de los clips que van en la app: voz clara y liviana. */
export const frecuencia = 24000;
const kbps = "48k";

function buscarFfmpeg(): string {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const candidatos = [raiz, path.resolve(raiz, "../truco-uruguayo")].flatMap(r =>
    globSync(path.join(r, "video/node_modules/@remotion/compositor-*/ffmpeg")));
  if (!candidatos.length) throw new Error("No encontré ffmpeg. Instalá el video (npm run reel:instalar) o definí FFMPEG.");
  return candidatos[0];
}
const ffmpegBin = buscarFfmpeg();
// El ffmpeg de Remotion busca sus bibliotecas en la carpeta de trabajo.
const ffmpeg = (args: string[]) => ejecutar(ffmpegBin, ["-hide_banner", "-v", "error", ...args],
  { cwd: path.dirname(ffmpegBin), maxBuffer: 1 << 26, encoding: "buffer" });

async function decodificar(mp3: string): Promise<Int16Array> {
  // Este ffmpeg no escribe s16le crudo: sale un WAV y se toma su bloque «data».
  const wav = mp3 + `.${process.pid}.wav`;
  try {
    await ffmpeg(["-y", "-i", mp3, "-ac", "1", "-ar", String(frecuencia), "-c:a", "pcm_s16le", wav]);
    const datos = readFileSync(wav);
    for (let i = 12; i + 8 <= datos.length;) {
      const tamano = datos.readUInt32LE(i + 4);
      if (datos.toString("ascii", i, i + 4) === "data") {
        const bloque = Buffer.from(datos.subarray(i + 8, i + 8 + tamano));
        return new Int16Array(bloque.buffer, bloque.byteOffset, Math.floor(bloque.length / 2));
      }
      i += 8 + tamano + (tamano % 2);
    }
    throw new Error(`WAV sin datos: ${mp3}`);
  } finally {
    rmSync(wav, { force: true });
  }
}

async function codificar(pcm: Int16Array, salida: string) {
  mkdirSync(path.dirname(salida), { recursive: true });
  const crudo = salida + ".pcm";
  writeFileSync(crudo, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  try {
    await ffmpeg(["-y", "-f", "s16le", "-ar", String(frecuencia), "-ac", "1", "-i", crudo,
      "-c:a", "libmp3lame", "-b:a", kbps, "-map_metadata", "-1", "-write_xing", "0", "-id3v2_version", "0", salida]);
  } finally {
    rmSync(crudo, { force: true });
  }
}

/** Pide el clip a ElevenLabs, o lo toma de la caché. Devuelve la ruta del MP3 original. */
async function pedir(voz: VozDeAsiento, texto: string, semillaClip = semilla): Promise<string> {
  const ajustes = { voz: voz.id, modelo, texto, semilla: semillaClip, formato: formatoPedido };
  const clave = createHash("sha256").update(JSON.stringify(ajustes)).digest("hex").slice(0, 32);
  const archivo = path.join(cache, "eleven", clave + ".mp3");
  if (existsSync(archivo)) return archivo;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Falta ELEVENLABS_API_KEY en el entorno.");
  for (let intento = 1; ; intento++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz.id}?output_format=${formatoPedido}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: texto, model_id: modelo, language_code: "es", seed: semillaClip }),
    });
    if (r.ok) {
      mkdirSync(path.dirname(archivo), { recursive: true });
      writeFileSync(archivo, Buffer.from(await r.arrayBuffer()));
      return archivo;
    }
    const detalle = (await r.text()).slice(0, 200);
    // 409: la voz compartida se está sumando a la biblioteca por otro pedido simultáneo.
    if ((r.status === 409 || r.status === 429 || r.status >= 500) && intento < 6) {
      await new Promise(listo => setTimeout(listo, 2000 * intento));
      continue;
    }
    throw new Error(`ElevenLabs respondió ${r.status} para «${texto}» (${voz.nombre}): ${detalle}`);
  }
}

async function clip(voz: VozDeAsiento, texto: string, clave?: string) {
  const otra = clave ? retomas[`${voz.asiento}/${clave}`] : undefined;
  const pcm = recortarYNivelar(await decodificar(await pedir(voz, texto, otra)), frecuencia);
  if (!pcm.length) throw new Error(`Clip vacío: «${texto}» (${voz.nombre}).`);
  return pcm;
}

/** Pocas a la vez para no chocar con el límite de pedidos simultáneos. */
async function enParalelo<T>(tareas: (() => Promise<T>)[], cantidad = 3): Promise<T[]> {
  const resultados: T[] = [];
  let siguiente = 0;
  await Promise.all(Array.from({ length: cantidad }, async () => {
    while (siguiente < tareas.length) {
      const i = siguiente++;
      resultados[i] = await tareas[i]();
    }
  }));
  return resultados;
}

async function muestra() {
  const salida = path.join(cache, "muestra");
  rmSync(salida, { recursive: true, force: true });
  await enParalelo(voces.map(voz => async () => {
    const nombre = (n: string) => path.join(salida, `asiento-${voz.asiento}-${voz.nombre.normalize("NFD").replace(/[^A-Za-z]/g, "").toLowerCase()}-${n}.mp3`);
    const [truco, quiero, entera, numero, deEnvido] = await Promise.all(
      ["¡Truco!", "Quiero.", "Treinta y tres de envido.", "Treinta y tres.", "De envido."].map(t => clip(voz, t)));
    // Todo en un solo archivo por voz, con pausas, para escucharlo de corrido.
    const pausa = new Int16Array(frecuencia * 0.7);
    await codificar(unir([truco, pausa, quiero, pausa, entera, pausa, unir([numero, deEnvido], frecuencia, 60)], frecuencia, 0),
      nombre("todo"));
    await codificar(entera, nombre("33-entera"));
    await codificar(unir([numero, deEnvido], frecuencia, 60), nombre("33-por-partes"));
    console.log(`Muestra lista: asiento ${voz.asiento} (${voz.nombre}).`);
  }), 2);
  console.log(`Archivos en ${path.relative(raiz, salida)}`);
}

const archivoDeClip = (asiento: number, clave: string) => `voces/${asiento}/${clave}.mp3`;

function escribirManifiesto(clips: readonly Clip[]) {
  const lineas = [
    "// Generado por scripts/voces/generar.ts. No lo edites a mano.",
    "// Metro necesita un require estático por archivo para empaquetar cada clip.",
    "import type { Efecto } from \"./efectos.ts\";",
    "",
    `export const metodoGrabado = ${JSON.stringify(metodoDeclaracion)};`,
    "",
    "export const voces: Readonly<Record<number, Readonly<Record<string, number>>>> = {",
    ...voces.flatMap(({ asiento }) => [
      `  ${asiento}: {`,
      ...clips.map(c => `    ${JSON.stringify(c.clave)}: require("../../assets/sonido/${archivoDeClip(asiento, c.clave)}"),`),
      "  },",
    ]),
    "};",
    "",
    "export const efectos: Readonly<Record<Efecto, number>> = {",
    ...["naipe", "reparto", "ficha", "festejo"].map(e => `  ${e}: require("../../assets/sonido/efectos/${e}.mp3"),`),
    "};",
    "",
  ];
  writeFileSync(path.join(raiz, "app/src/sonido/recursos.ts"), lineas.join("\n"));
}

async function lote() {
  const clips = clipsDeVoz();
  rmSync(path.join(destino, "voces"), { recursive: true, force: true });
  let hechos = 0;
  await enParalelo(voces.flatMap(voz => clips.map(c => async () => {
    await codificar(await clip(voz, c.texto, c.clave), path.join(destino, archivoDeClip(voz.asiento, c.clave)));
    if (++hechos % 50 === 0) console.log(`${hechos} de ${clips.length * voces.length} clips`);
  })));
  await escribirEfectos(path.join(destino, "efectos"), codificar, frecuencia);
  escribirManifiesto(clips);
  const peso = globSync(path.join(destino, "**/*.mp3")).reduce((n, a) => n + readFileSync(a).length, 0);
  console.log(`Listo: ${hechos} clips de voz y 4 efectos, ${(peso / 1024).toFixed(0)} KB en total.`);
}

if (process.argv.includes("--efectos")) {
  await escribirEfectos(path.join(destino, "efectos"), codificar, frecuencia);
} else if (process.argv.includes("--muestra")) await muestra();
else await lote();
