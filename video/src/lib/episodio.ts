// Lee un episodio YAML y resuelve sus manos con el motor del sitio.
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import { cartasDeFamilia } from "../../../src/aprendizaje/generadores/index.ts";
import { esFamiliaDe, familiasPorHabilidad, type Familia } from "../../../src/aprendizaje/generadores/familias.ts";
import { esCardId, type CardId } from "../../../src/motor/cartas.ts";
import { crearAzar } from "../../../src/motor/reparto.ts";
import { evaluarTantos, type ResultadoTantos } from "../../../src/motor/tantos.ts";

type Modalidad = "envido" | "flor";
export type ManoSpec = CardId[] | { cambio: { de: CardId; a: CardId } } | { familia: string; semilla: number };
export interface Episodio {
  plantilla: "contar-tantos"; serie: string; id: string; modalidad: Modalidad;
  muestra: CardId; manos: ManoSpec[]; gancho: string; lineas?: Record<string, string | null>;
}
export interface Mano { cartas: CardId[]; tantos: ResultadoTantos; cambio?: { de: CardId; a: CardId } }

const carta = z.string().refine(esCardId, { message: "carta desconocida" }) as unknown as z.ZodType<CardId>;
const esquema = z.strictObject({
  plantilla: z.literal("contar-tantos"),
  serie: z.string().min(1),
  id: z.string().min(1),
  modalidad: z.enum(["envido", "flor"]),
  muestra: carta,
  gancho: z.string().min(1),
  manos: z.array(z.union([
    z.array(carta).length(3),
    z.strictObject({ cambio: z.strictObject({ de: carta, a: carta }) }),
    z.strictObject({ familia: z.string(), semilla: z.number().int().min(0).max(0xffffffff) }),
  ])),
  lineas: z.record(z.string(), z.string().nullable()).optional(),
});

type Problema = { path: PropertyKey[]; message: string; errors?: Problema[][] };

/** En una unión, informa la rama que llegó más hondo: es la que la persona quiso escribir. */
function masHondo(problema: Problema, prefijo: PropertyKey[] = []): { ruta: string; mensaje: string } {
  const ruta = [...prefijo, ...problema.path];
  if (problema.errors?.length) {
    const candidatos = problema.errors.flat().map((p) => masHondo(p, ruta));
    return candidatos.reduce((a, b) => (b.ruta.split(".").length > a.ruta.split(".").length ? b : a));
  }
  return { ruta: ruta.join("."), mensaje: problema.message };
}

export function leerEpisodio(ruta: string): Episodio {
  const resultado = esquema.safeParse(parse(readFileSync(ruta, "utf8")));
  if (!resultado.success) {
    const { ruta: campo, mensaje } = masHondo(resultado.error.issues[0] as unknown as Problema);
    throw new Error(`${ruta}: ${campo}: ${mensaje}`);
  }
  return resultado.data as Episodio;
}

function familiasDe(modalidad: Modalidad): readonly string[] {
  return familiasPorHabilidad[modalidad === "envido" ? "contar-envido" : "contar-flor"];
}

/** Una mano de la familia pedida, siempre la misma para la misma semilla y muestra. */
export function generarMano(familia: string, muestra: CardId, semilla: number, modalidad: Modalidad): Mano {
  const habilidad = modalidad === "envido" ? "contar-envido" : "contar-flor";
  if (!esFamiliaDe(habilidad, familia)) {
    throw new Error(`La familia ${familia} no sirve para ${modalidad}. Usá una de: ${familiasDe(modalidad).join(", ")}.`);
  }
  const cartas = cartasDeFamilia(familia as Familia, muestra, 3, crearAzar(semilla));
  return { cartas, tantos: evaluarTantos(cartas, muestra) };
}

export function resolverManos(ep: Episodio): Mano[] {
  if (ep.manos.length !== 3) throw new Error("contar-tantos necesita exactamente tres manos.");
  const manos: Mano[] = [];
  ep.manos.forEach((spec, n) => {
    let mano: Mano;
    if (Array.isArray(spec)) {
      mano = { cartas: spec, tantos: evaluarTantos(spec, ep.muestra) };
    } else if ("cambio" in spec) {
      const previa = manos[n - 1];
      const { de, a } = spec.cambio;
      if (!previa) throw new Error("La primera mano no puede ser un cambio.");
      if (!previa.cartas.includes(de)) throw new Error(`La mano ${n + 1} cambia ${de}, que no está en la mano anterior.`);
      if (previa.cartas.includes(a) || a === ep.muestra) throw new Error(`La mano ${n + 1} agrega ${a}, que ya está en la mesa.`);
      const cartas = previa.cartas.map((c) => (c === de ? a : c));
      mano = { cartas, tantos: evaluarTantos(cartas, ep.muestra), cambio: { de, a } };
    } else {
      mano = generarMano(spec.familia, ep.muestra, spec.semilla, ep.modalidad);
    }
    if (n === 1 && !mano.cambio) throw new Error("En contar-tantos, la segunda mano es un cambio de la primera.");
    if (mano.tantos.modalidad !== ep.modalidad) {
      throw new Error(`La mano ${n + 1} es ${mano.tantos.modalidad}, pero el episodio es de ${ep.modalidad}.`);
    }
    manos.push(mano);
  });
  return manos;
}
