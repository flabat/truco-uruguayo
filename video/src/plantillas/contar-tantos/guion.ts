// Guion de «contar tantos»: el texto sale del resultado del motor, nunca de números escritos a mano.
import { cartaId, paloDe, palos, pieza, rangoDe, rangos, type CardId, type Palo } from "../../../../src/motor/cartas.ts";
import type { Aporte } from "../../../../src/motor/tantos.ts";
import type { Episodio, Mano } from "../../lib/episodio.ts";
import type { LineaGuion } from "../../lib/linea.ts";
import { aPalabras, nombreHablado, numerosDichos, palabraDeRango } from "../../lib/numeros.ts";
import { plano } from "../../lib/texto.ts";

const ids = {
  envido: ["pregunta", "cartas", "respuesta1", "cambio", "respuesta2", "tercera", "valores", "cierre"],
  flor: ["pregunta", "cartas", "respuesta1", "cambio", "respuesta2", "tercera", "respuesta3", "valores", "cierre"],
} as const;
const conPausa: Record<Episodio["modalidad"], readonly string[]> = {
  envido: ["cartas", "cambio"],
  flor: ["cartas", "cambio", "tercera"],
};
const totalDe: Record<string, number> = { respuesta1: 0, respuesta2: 1, respuesta3: 2 };
/** De qué manos puede hablar cada línea. */
const manosDe: Record<string, number[]> = {
  cartas: [0], respuesta1: [0], cambio: [0, 1], respuesta2: [1], tercera: [2], respuesta3: [2],
};

export function idsContarTantos(modalidad: Episodio["modalidad"]): readonly string[] {
  return ids[modalidad];
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const conArticulo = (carta: CardId) => (rangoDe(carta) === 10 ? "la " : "el ") + nombreHablado(carta);
const rango = (carta: CardId) => palabraDeRango(rangoDe(carta));

function enumerar(partes: string[]): string {
  return partes.length < 2 ? partes.join("") : partes.slice(0, -1).join(", ") + " y " + partes.at(-1);
}

/** «Cinco y siete de oros, y dos de copas»: las cartas seguidas del mismo palo comparten el palo. */
function nombrarCartas(cartas: readonly CardId[]): string {
  const grupos: CardId[][] = [];
  for (const carta of cartas) {
    const ultimo = grupos.at(-1);
    if (ultimo && paloDe(ultimo[0]) === paloDe(carta)) ultimo.push(carta);
    else grupos.push([carta]);
  }
  const textos = grupos.map((g) => enumerar(g.map(rango)) + " de " + paloDe(g[0]));
  return mayuscula(textos.length === 2 ? textos.join(", y ") : enumerar(textos));
}

/** «El caballo de copas vale cero.» para la primera figura que no es pieza. */
function figurasEnCero(cartas: readonly CardId[], muestra: CardId): string[] {
  return cartas.filter((c) => rangoDe(c) >= 10 && pieza(c, muestra) === null)
    .slice(0, 1).map((c) => `${mayuscula(conArticulo(c))} vale cero.`);
}

/** «del dos», «de la sota». */
const delRango = (carta: CardId) => (rangoDe(carta) === 10 ? "de la " : "del ") + rango(carta);

function explicar({ cartas, tantos }: Mano, muestra: CardId): string {
  const { aportes } = tantos.desgloses[0];
  const usadas = new Set(aportes.map((a) => a.carta));
  const afuera = cartas.filter((c) => !usadas.has(c));
  const valor = (a: Aporte) => aPalabras(a.tantos);
  const frases: string[] = [];
  switch (tantos.forma) {
    case "dos-del-mismo-palo":
    case "tres-del-mismo-palo": {
      const suman = aportes.filter((a) => a.tantos > 0).map((a) => "más " + valor(a));
      frases.push(tantos.forma === "tres-del-mismo-palo"
        ? ["Veinte", ...suman].join(" ") + "."
        : ["Veinte por el palo", ...suman].join(", ") + ".");
      frases.push(...figurasEnCero(cartas.filter((c) => usadas.has(c)), muestra));
      if (afuera.length) frases.push(`${mayuscula(conArticulo(afuera[0]))} queda afuera.`);
      break;
    }
    case "una-pieza": {
      const [p, otra] = [aportes.find((a) => a.pieza !== null)!, aportes.find((a) => a.pieza === null)];
      frases.push(`${mayuscula(conArticulo(p.carta))} vale ${valor(p)}.`);
      frases.push(otra && otra.tantos > 0 ? `Sumale el ${valor(otra)}.` : "Las otras dos no suman.");
      frases.push("Los veinte ya están incluidos.");
      break;
    }
    case "tres-palos-distintos": {
      const mejor = aportes[0];
      frases.push("Tres palos distintos.");
      frases.push(mejor.tantos > 0 ? `Te quedás con el ${valor(mejor)}.` : "Ninguna suma: cero.");
      frases.push(...figurasEnCero(afuera, muestra));
      break;
    }
    default: {
      // Flor con piezas: la base se cuenta una vez y cada pieza aporta lo que pasa de 20.
      const suman = aportes.filter((a) => a.tantos > 0)
        .map((a) => (a.pieza !== null ? `${valor(a)} ${delRango(a.carta)}` : conArticulo(a.carta)));
      frases.push("Contá veinte una sola vez.");
      if (suman.length) frases.push(`Sumale ${enumerar(suman)}.`);
      frases.push(...figurasEnCero(cartas.filter((c) => pieza(c, muestra) === null), muestra));
    }
  }
  return frases.join(" ");
}

function respuesta(mano: Mano, muestra: CardId): string {
  return `${mayuscula(aPalabras(mano.tantos.total))}. ${explicar(mano, muestra)}`;
}

const porRango = new Map(rangos.map((r) => [plano(palabraDeRango(r)), r]));
const menciones = new RegExp(`((?:${[...porRango.keys()].join("|")})(?: y (?:${[...porRango.keys()].join("|")}))*) de (${palos.join("|")})`, "g");

/**
 * Una línea reescrita a mano solo puede nombrar cartas que están en la mesa y decir números que el
 * motor da para su mano: el total, la base, lo que aporta cada carta o el valor de una carta.
 */
function validarReescrita(id: string, texto: string, ep: Episodio, manos: Mano[]) {
  const enMesa = new Set<CardId>([ep.muestra, ...manos.flatMap((m) => m.cartas)]);
  // En «cinco y siete de oros» las dos son cartas. En «ocho del cinco y seis de bastos» solo el seis:
  // un rango anterior que no está en la mesa vuelve al texto y se controla como número.
  const resto = plano(texto).replace(menciones, (_, grupo: string, palo: Palo) => {
    const rangosDichos = grupo.split(" y ");
    const ultimo = rangosDichos.at(-1)!;
    if (!enMesa.has(cartaId(palo, porRango.get(ultimo)!))) {
      throw new Error(`La línea ${id} nombra el ${ultimo} de ${palo}, que no está en la mesa.`);
    }
    return " " + rangosDichos.slice(0, -1).filter((r) => !enMesa.has(cartaId(palo, porRango.get(r)!))).join(" ") + " ";
  // «tres palos», «las tres cartas», «dos piezas» cuentan cosas, no tantos.
  }).replace(/\b[a-z]+ (?:palos|cartas|piezas)\b/g, " ");
  const propias = (manosDe[id] ?? []).map((n) => manos[n]);
  if (!propias.length) return;
  const validos = new Set<number>([0, 20]);
  for (const { cartas, tantos } of propias) {
    validos.add(tantos.total);
    for (const d of tantos.desgloses) for (const a of d.aportes) validos.add(a.tantos);
    for (const c of cartas) if (rangoDe(c) <= 7) validos.add(rangoDe(c));
  }
  for (const { valor, dicho } of numerosDichos(resto)) {
    if (!validos.has(valor)) throw new Error(`La línea ${id} dice «${dicho}», un número que el motor no da para esa mano.`);
  }
}

export function guionContarTantos(ep: Episodio, manos: Mano[]): LineaGuion[] {
  const [primera, segunda, tercera] = manos;
  const { de, a } = segunda.cambio!;
  const envido = ep.modalidad === "envido";
  const base: Record<string, string> = {
    pregunta: `${ep.gancho} La muestra es ${conArticulo(ep.muestra)}.`,
    cartas: `${nombrarCartas(primera.cartas)}. ${envido ? "¿Cuánto cantás?" : "¿Cuántos tantos tenés?"}`,
    respuesta1: respuesta(primera, ep.muestra),
    cambio: `Cambiá ${conArticulo(de)} por ${conArticulo(a)}.${pieza(a, ep.muestra) !== null ? " Ahora es pieza." : ""} ¿Cuánto te da?`,
    respuesta2: respuesta(segunda, ep.muestra),
    tercera: envido
      ? `${nombrarCartas(tercera.cartas)}. ${explicar(tercera, ep.muestra)}` +
        (tercera.tantos.forma === "tres-palos-distintos" ? "" : ` En total, ${aPalabras(tercera.tantos.total)}.`)
      : `${nombrarCartas(tercera.cartas)}. ¿Cuánto da esta flor?`,
    respuesta3: respuesta(tercera, ep.muestra),
    valores: "Guardate estos valores para la próxima mano.",
    cierre: "Probá otra mano en El Truco.",
  };
  const validos = idsContarTantos(ep.modalidad);
  for (const id of Object.keys(ep.lineas ?? {})) {
    if (!validos.includes(id)) throw new Error(`Línea desconocida: ${id}. Las de ${ep.modalidad} son: ${validos.join(", ")}.`);
  }
  const lineas: LineaGuion[] = [];
  for (const id of validos) {
    const texto = ep.lineas && id in ep.lineas ? ep.lineas[id] : base[id];
    if (texto === null) continue;
    if (id in totalDe) {
      const total = manos[totalDe[id]].tantos.total;
      const primeraOracion = texto.split(/[.?!]/)[0];
      if (plano(primeraOracion) !== plano(aPalabras(total))) {
        throw new Error(`La línea ${id} dice «${primeraOracion}», pero el motor da ${total}.`);
      }
    }
    if (ep.lineas && id in ep.lineas) validarReescrita(id, texto, ep, manos);
    lineas.push({ id, texto, ...(conPausa[ep.modalidad].includes(id) ? { pausa: true } : {}) });
  }
  return lineas;
}
