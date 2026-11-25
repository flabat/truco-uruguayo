// Efectos de la mesa sintetizados acá mismo: no usan muestras de terceros, así que no
// llevan licencia aparte. Son deterministas (azar con semilla) para que regenerarlos dé lo mismo.
import path from "node:path";

export type Codificar = (pcm: Int16Array, salida: string) => Promise<void>;

function azar(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Filtro de un polo: paso bajo con corte `hz`. */
function pasoBajo(x: Float32Array, hz: number, f: number) {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / f);
  let y = 0;
  return x.map(v => (y += a * (v - y)));
}
const pasoAlto = (x: Float32Array, hz: number, f: number) => {
  const bajo = pasoBajo(x, hz, f);
  return x.map((v, i) => v - bajo[i]);
};

function aPcm(x: Float32Array, picoDb: number): Int16Array {
  const pico = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const g = (32767 * 10 ** (picoDb / 20)) / pico;
  return Int16Array.from(x, v => Math.round(v * g));
}

const muestras = (ms: number, f: number) => new Float32Array(Math.round((ms / 1000) * f));

/** Naipe apoyado sobre el paño: soplo de ruido apagado y un golpe grave muy corto. */
export function naipe(f: number): Int16Array {
  const r = azar(11);
  const ruido = pasoBajo(muestras(110, f).map(() => r()), 2600, f);
  const x = ruido.map((v, i) => {
    const t = i / f;
    const env = Math.min(1, t / 0.002) * Math.exp(-t / 0.018);
    return v * env + 0.35 * Math.sin(2 * Math.PI * 130 * t) * Math.exp(-t / 0.022);
  });
  return aPcm(x, -4);
}

/** Roce de reparto: la carta se desliza sobre las otras, ruido que sube y se apaga. */
export function reparto(f: number): Int16Array {
  const r = azar(23);
  const ruido = pasoBajo(pasoAlto(muestras(170, f).map(() => r()), 1800, f), 6500, f);
  const x = ruido.map((v, i) => {
    const t = i / f;
    return v * (t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) / 0.035));
  });
  return aPcm(x, -8);
}

/** Ficha del tanteador: dos golpes secos de una ficha de arcilla. */
export function ficha(f: number): Int16Array {
  const r = azar(37);
  const x = muestras(160, f);
  const golpe = (desdeMs: number, amp: number) => {
    const inicio = Math.round((desdeMs / 1000) * f);
    for (let i = inicio; i < x.length; i++) {
      const t = (i - inicio) / f;
      const tono = [2350, 3720, 5180].reduce((s, hz, k) => s + Math.sin(2 * Math.PI * hz * t) / (k + 1), 0);
      x[i] += amp * (tono * Math.exp(-t / 0.012) + r() * Math.exp(-t / 0.0025));
    }
  };
  golpe(0, 1);
  golpe(48, 0.55);
  return aPcm(x, -6);
}

/** Festejo breve: arpegio mayor ascendente con un timbre de campanita. */
export function festejo(f: number): Int16Array {
  const notas = [523.25, 659.25, 783.99, 1046.5];
  const x = muestras(1100, f);
  notas.forEach((hz, n) => {
    const inicio = Math.round(n * 0.09 * f);
    const caida = n === notas.length - 1 ? 0.42 : 0.22;
    for (let i = inicio; i < x.length; i++) {
      const t = (i - inicio) / f;
      const env = Math.min(1, t / 0.004) * Math.exp(-t / caida);
      x[i] += env * (Math.sin(2 * Math.PI * hz * t) + 0.3 * Math.sin(2 * Math.PI * 2 * hz * t) + 0.12 * Math.sin(2 * Math.PI * 3.01 * hz * t));
    }
  });
  const fin = Math.round(0.05 * f);
  for (let i = 0; i < fin; i++) x[x.length - 1 - i] *= i / fin;
  return aPcm(x, -5);
}

export const generadores = { naipe, reparto, ficha, festejo } as const;

export async function escribirEfectos(carpeta: string, codificar: Codificar, f: number) {
  for (const [nombre, generar] of Object.entries(generadores)) {
    await codificar(generar(f), path.join(carpeta, nombre + ".mp3"));
  }
}
