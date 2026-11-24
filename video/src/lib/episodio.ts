// Lee un episodio YAML y resuelve sus manos con el motor del sitio.
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import { cartasDeFamilia } from "../../../src/aprendizaje/generadores/index.ts";
import { esFamiliaDe, familiasPorHabilidad, type Familia } from "../../../src/aprendizaje/generadores/familias.ts";
import { esCardId, type CardId } from "@eltruco/motor/cartas.ts";
import { compararCartas } from "@eltruco/motor/jerarquia.ts";
import { crearAzar } from "@eltruco/motor/reparto.ts";
import { evaluarTantos, type ResultadoTantos } from "@eltruco/motor/tantos.ts";

type Modalidad = "envido" | "flor";
export type ManoSpec = CardId[] | { cambio: { de: CardId; a: CardId } } | { familia: string; semilla: number };
export interface EpisodioTantos {
  plantilla: "contar-tantos"; serie: string; id: string; modalidad: Modalidad;
  muestra: CardId; manos: ManoSpec[]; gancho: string; lineas?: Record<string, string | null>;
}
export type VueltaSpec = [CardId, CardId] | { familia: string; semilla: number };
export interface EpisodioComparar {
  plantilla: "comparar-cartas"; serie: string; id: string;
  muestra: CardId; vueltas: VueltaSpec[]; gancho: string; lineas?: Record<string, string | null>;
}
export type Episodio = EpisodioTantos | EpisodioComparar;
export interface Mano { cartas: CardId[]; tantos: ResultadoTantos; cambio?: { de: CardId; a: CardId } }
/** Dos cartas de una vuelta y la que gana según el motor; null si es parda. */
export interface Vuelta { cartas: [CardId, CardId]; ganadora: CardId | null }

const carta = z.string().refine(esCardId, { message: "carta desconocida" }) as unknown as z.ZodType<CardId>;
const generada = z.strictObject({ familia: z.string(), semilla: z.number().int().min(0).max(0xffffffff) });
const comunes = {
  serie: z.string().min(1),
  id: z.string().min(1),
  muestra: carta,
  gancho: z.string().min(1),
  lineas: z.record(z.string(), z.string().nullable()).optional(),
};
const esquemaComparar = z.strictObject({
  plantilla: z.literal("comparar-cartas"),
  ...comunes,
  vueltas: z.array(z.union([z.tuple([carta, carta]), generada])).min(2).max(4),
});
const esquemaTantos = z.strictObject({
  plantilla: z.literal("contar-tantos"),
  serie: z.string().min(1),
  id: z.string().min(1),
  modalidad: z.enum(["envido", "flor"]),
  muestra: carta,
  gancho: z.string().min(1),
  manos: z.array(z.union([
    z.array(carta).length(3),
    z.strictObject({ cambio: z.strictObject({ de: carta, a: carta }) }),
    generada,
  ])),
  lineas: z.record(z.string(), z.string().nullable()).optional(),
});
const esquema = z.discriminatedUnion("plantilla", [esquemaTantos, esquemaComparar]);

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

export function resolverManos(ep: EpisodioTantos): Mano[] {
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

/** La vuelta con su ganadora según `compararCartas`. */
export function vueltaDe(cartas: [CardId, CardId], muestra: CardId): Vuelta {
  const [a, b] = cartas;
  if (a === b) throw new Error(`Una vuelta necesita dos cartas distintas: ${a}.`);
  if (a === muestra || b === muestra) throw new Error(`La muestra ${muestra} no puede jugarse en una vuelta.`);
  const orden = compararCartas(a, b, muestra);
  return { cartas, ganadora: orden === 0 ? null : orden > 0 ? a : b };
}

export function resolverVueltas(ep: EpisodioComparar): Vuelta[] {
  return ep.vueltas.map((spec) => {
    if (Array.isArray(spec)) return vueltaDe(spec, ep.muestra);
    if (!esFamiliaDe("comparar-cartas", spec.familia)) {
      throw new Error(`La familia ${spec.familia} no sirve para comparar cartas. Usá una de: ${familiasPorHabilidad["comparar-cartas"].join(", ")}.`);
    }
    const [a, b] = cartasDeFamilia(spec.familia as Familia, ep.muestra, 2, crearAzar(spec.semilla));
    return vueltaDe([a, b], ep.muestra);
  });
}
