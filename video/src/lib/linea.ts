// Convierte una narración continua y los tiempos de sus palabras en la línea de tiempo del video:
// corta entre líneas y agrega una pausa para contar después de las líneas marcadas con `pausa`.
import type { Caption } from "@remotion/captions";
import { plano } from "./texto.ts";

export interface Palabra { text: string; start: number; end: number }
export interface LineaGuion { id: string; texto: string; pausa?: boolean }
export interface Tramo { id: string; desde: number; hasta: number; inicio: number }

export interface Linea {
  tramos: Tramo[];
  pausas: { id: string; desde: number; hasta: number }[];
  subtitulos: Caption[];
  cuando(id: string, palabra: string, ocurrencia?: number): number | null;
  inicio(id: string): number;
  fin(id: string): number;
  duracion: number;
}

export function armarLinea(
  lineas: LineaGuion[], palabras: Palabra[],
  { pausa = 3, respiro = 0.35, cola = 0.8 }: { pausa?: number; respiro?: number; cola?: number } = {},
): Linea {
  let i = 0;
  const grupos = lineas.map((linea) => {
    const grupo = palabras.slice(i, i + linea.texto.trim().split(/\s+/).length);
    i += grupo.length;
    if (plano(grupo.map((p) => p.text).join(" ")) !== plano(linea.texto)) {
      throw new Error(`La voz no coincide con la línea ${linea.id}: «${linea.texto}»`);
    }
    return grupo;
  });
  if (i !== palabras.length) throw new Error(`Sobran ${palabras.length - i} palabras al final de la voz.`);

  const tramos: Tramo[] = [];
  const pausas: Linea["pausas"] = [];
  let t = 0;
  grupos.forEach((grupo, n) => {
    const desde = n === 0 ? 0 : tramos[n - 1].hasta;
    const ultima = n === grupos.length - 1;
    const hasta = ultima ? grupo.at(-1)!.end : (grupo.at(-1)!.end + grupos[n + 1][0].start) / 2;
    tramos.push({ id: lineas[n].id, desde, hasta, inicio: t });
    t += hasta - desde;
    const espera = ultima ? cola : lineas[n].pausa ? pausa : respiro;
    if (!ultima && lineas[n].pausa) pausas.push({ id: lineas[n].id, desde: t, hasta: t + espera });
    t += espera;
  });

  const indice = (id: string) => {
    const n = lineas.findIndex((l) => l.id === id);
    if (n < 0) throw new Error(`Línea desconocida: ${id}`);
    return n;
  };
  const enVideo = (n: number, s: number) => tramos[n].inicio + s - tramos[n].desde;

  return {
    tramos,
    pausas,
    subtitulos: grupos.flatMap((grupo, n) => grupo.map((p) => ({
      text: " " + p.text,
      startMs: enVideo(n, p.start) * 1000,
      endMs: enVideo(n, p.end) * 1000,
      timestampMs: null,
      confidence: null,
      pageBreakAfter: /[.?!]$/.test(p.text),
    }))),
    cuando(id, palabra, ocurrencia = 0) {
      const n = indice(id);
      const encontrada = grupos[n].filter((p) => plano(p.text) === plano(palabra))[ocurrencia];
      return encontrada ? enVideo(n, encontrada.start) : null;
    },
    inicio: (id) => tramos[indice(id)].inicio,
    fin: (id) => { const n = indice(id); return enVideo(n, grupos[n].at(-1)!.end); },
    duracion: t,
  };
}
