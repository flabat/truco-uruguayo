// Qué dice cada voz de la mesa y cómo se llama cada clip. Es puro: lo usan el script
// de generación (`scripts/voces/generar.ts`), las pruebas y el reproductor de la app.
import { canto } from "@eltruco/cliente/cantos.ts";
import type { TipoAccionOnline } from "@eltruco/motor/cantos-online.ts";
import { textoFrasePie, type FrasePie } from "@eltruco/motor/senas-pie.ts";

/** Toda acción pública que no es jugar una carta: cantos, respuestas, «Yo no canto» y el mazo. */
export type CantoVoz = Exclude<TipoAccionOnline, "carta">;
export type MotivoTantos = "envido" | "flor";

/** Lo que la mesa le pide decir a un asiento. */
export type FraseVoz =
  | { tipo: "canto"; canto: CantoVoz }
  | { tipo: "pie"; frase: FrasePie }
  /** Declaración de tantos: «treinta y tres de envido». Un total sin clip no suena. */
  | { tipo: "tantos"; motivo: MotivoTantos; total: number };

/** Cuántos asientos tienen voz propia: el de la mesa más grande (tercetos). */
export const asientosConVoz = 6;

const desde = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Totales que puede dar `evaluarTantos`. La prueba los compara con la enumeración del motor. */
export const tantosPosibles: Readonly<Record<MotivoTantos, readonly number[]>> = {
  envido: [...desde(0, 7), ...desde(20, 37)],
  flor: desde(20, 47),
};

/**
 * Cómo suena una declaración: el clip entero («treinta y tres de envido») o el número
 * y el canto unidos al reproducir («treinta y tres» + «de envido»).
 */
export type MetodoDeclaracion = "entera" | "partes";
export const metodoDeclaracion: MetodoDeclaracion = "entera";

const unidades = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const veintes = ["veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis",
  "veintisiete", "veintiocho", "veintinueve"];
const decenas: Record<number, string> = { 3: "treinta", 4: "cuarenta" };

export function numeroEnPalabras(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 49 || (n >= 10 && n < 20)) {
    throw new RangeError(`No hay tantos de ${n}.`);
  }
  if (n < 10) return unidades[n];
  if (n < 30) return veintes[n - 20];
  const u = n % 10;
  return decenas[Math.floor(n / 10)] + (u ? " y " + unidades[u] : "");
}

const textoDeCanto: Record<CantoVoz, string> = {
  ...Object.fromEntries(Object.entries(canto).map(([tipo, texto]) => [tipo, `¡${texto}!`])) as Record<CantoVoz, string>,
  quiero: canto.quiero + ".",
  "no-quiero": canto["no-quiero"] + ".",
  "paso-flor": canto["paso-flor"] + ".",
  // Lo que se dice al irse, como en los globos de `vocesEnAccion`.
  mazo: "Me voy al mazo.",
};

const mayuscula = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Texto que se le manda al servicio de voz para una frase entera. */
export function textoDeFrase(frase: FraseVoz): string {
  if (frase.tipo === "canto") return textoDeCanto[frase.canto];
  if (frase.tipo === "pie") return `¡${textoFrasePie[frase.frase]}!`;
  return `${mayuscula(numeroEnPalabras(frase.total))} de ${frase.motivo}.`;
}

export function tieneClip(frase: FraseVoz): boolean {
  if (frase.tipo === "canto") return Object.hasOwn(textoDeCanto, frase.canto);
  if (frase.tipo === "pie") return Object.hasOwn(textoFrasePie, frase.frase);
  return Object.hasOwn(tantosPosibles, frase.motivo) && tantosPosibles[frase.motivo].includes(frase.total);
}

/** Nombres de los clips que forman la frase, en orden. Vacío si la frase no tiene clip. */
export function clavesDeFrase(frase: FraseVoz, metodo: MetodoDeclaracion = metodoDeclaracion): string[] {
  if (!tieneClip(frase)) return [];
  if (frase.tipo === "canto") return [frase.canto];
  if (frase.tipo === "pie") return ["pie-" + frase.frase];
  return metodo === "entera"
    ? [`${frase.motivo}-${frase.total}`]
    : [`numero-${frase.total}`, `de-${frase.motivo}`];
}

/** Todas las frases que la mesa puede pedir. */
export function frasesDeVoz(): FraseVoz[] {
  return [
    ...(Object.keys(textoDeCanto) as CantoVoz[]).map(c => ({ tipo: "canto", canto: c }) as const),
    ...(Object.keys(textoFrasePie) as FrasePie[]).map(f => ({ tipo: "pie", frase: f }) as const),
    ...(["envido", "flor"] as const).flatMap(motivo =>
      tantosPosibles[motivo].map(total => ({ tipo: "tantos", motivo, total }) as const)),
  ];
}

export interface Clip { clave: string; texto: string }

/** Los clips que hay que grabar por voz, sin repetir. */
export function clipsDeVoz(metodo: MetodoDeclaracion = metodoDeclaracion): Clip[] {
  const clips = new Map<string, string>();
  for (const frase of frasesDeVoz()) {
    if (frase.tipo !== "tantos" || metodo === "entera") {
      clips.set(clavesDeFrase(frase, metodo)[0], textoDeFrase(frase));
      continue;
    }
    clips.set(`numero-${frase.total}`, mayuscula(numeroEnPalabras(frase.total)) + ".");
    clips.set(`de-${frase.motivo}`, `De ${frase.motivo}.`);
  }
  return [...clips].map(([clave, texto]) => ({ clave, texto }));
}
