// Controles del video ya renderizado: duración, audio, pausas y subtítulos.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Linea, LineaGuion } from "../src/lib/linea.ts";
import { plano } from "../src/lib/texto.ts";

const ejecutar = promisify(execFile);

export interface Silencio { inicio: number; fin: number }
export interface Medicion { duracion: number; audios: { codec: string; frecuencia: number }[]; silencios: Silencio[] }

/** Lee la salida de silencedetect. Un silencio sin fin llega hasta `duracion`. */
export function parsearSilencios(stderr: string, duracion = Infinity): Silencio[] {
  const silencios: Silencio[] = [];
  for (const m of stderr.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    if (m[1] === "start") silencios.push({ inicio: Number(m[2]), fin: duracion });
    else if (silencios.length) silencios.at(-1)!.fin = Number(m[2]);
  }
  return silencios;
}

export function textoDeSrt(srt: string): string {
  return srt.split(/\r?\n/).filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !l.includes("-->"))
    .map((l) => l.trim()).join(" ");
}

export function verificarSalida(m: Medicion, plan: { linea: Linea; lineas: LineaGuion[]; srt: string }): string[] {
  const problemas: string[] = [];
  if (Math.abs(m.duracion - plan.linea.duracion) > 0.1) {
    problemas.push(`La duración es ${m.duracion.toFixed(2)} s y se esperaban ${plan.linea.duracion.toFixed(2)} s.`);
  }
  if (m.audios.length !== 1 || m.audios[0].codec !== "aac" || m.audios[0].frecuencia !== 48000) {
    problemas.push(`Se esperaba una pista AAC de 48 kHz y hay: ${JSON.stringify(m.audios)}.`);
  }
  for (const p of plan.linea.pausas) {
    if (!m.silencios.some((s) => s.inicio <= p.desde + 0.1 && s.fin >= p.hasta - 0.1)) {
      problemas.push(`Falta el silencio de la pausa después de «${p.id}» (${p.desde.toFixed(2)}–${p.hasta.toFixed(2)} s).`);
    }
  }
  if (plano(textoDeSrt(plan.srt)) !== plano(plan.lineas.map((l) => l.texto).join(" "))) {
    problemas.push("El texto de los subtítulos no coincide con la narración.");
  }
  return problemas;
}

/** Mide el MP4 con el ffprobe y el ffmpeg que trae Remotion. */
export async function medirSalida(mp4: string, carpetaVideo: string): Promise<Medicion> {
  const npx = (args: string[]) => ejecutar("npx", ["remotion", ...args], { cwd: carpetaVideo, maxBuffer: 1 << 26 });
  const { stdout } = await npx(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,sample_rate:format=duration", "-of", "json", mp4]);
  const datos = JSON.parse(stdout) as { streams: { codec_type: string; codec_name: string; sample_rate?: string }[]; format: { duration: string } };
  const duracion = Number(datos.format.duration);
  const { stderr } = await npx(["ffmpeg", "-hide_banner", "-i", mp4, "-vn", "-af", "silencedetect=n=-45dB:d=0.8", "-f", "null", "-"]);
  return {
    duracion,
    audios: datos.streams.filter((s) => s.codec_type === "audio").map((s) => ({ codec: s.codec_name, frecuencia: Number(s.sample_rate) })),
    silencios: parsearSilencios(stderr, duracion),
  };
}
