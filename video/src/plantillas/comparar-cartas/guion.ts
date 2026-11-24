// Guion de «comparar cartas»: la ganadora sale de `compararCartas` y la parda de `explicarSituacion`.
import { explicarSituacion } from "../../../../src/aprendizaje/generadores/evaluacion.ts";
import { cartaId, palos, pieza, rangoDe, rangos, rangosPieza, type CardId, type Palo } from "@eltruco/motor/cartas.ts";
import { matas, rangosComunes } from "@eltruco/motor/jerarquia.ts";
import type { EpisodioComparar, Vuelta } from "../../lib/episodio.ts";
import type { LineaGuion } from "../../lib/linea.ts";
import { nombreHablado, palabraDeRango } from "../../lib/numeros.ts";
import { plano } from "../../lib/texto.ts";

export function idsCompararCartas(vueltas: number): string[] {
  const ids = ["pregunta"];
  for (let n = 1; n <= vueltas; n++) ids.push(`vuelta${n}`, `respuesta${n}`);
  return [...ids, "escala", "cierre"];
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const articulo = (carta: CardId) => (rangoDe(carta) === 10 ? "la " : "el ");
const conArticulo = (carta: CardId) => articulo(carta) + nombreHablado(carta);
/** «el tres», «la sota». */
const rangoConArticulo = (carta: CardId) => articulo(carta) + palabraDeRango(rangoDe(carta));

function enumerar(partes: string[]): string {
  return partes.slice(0, -1).join(", ") + " y " + partes.at(-1);
}

/** «Gana el dos de bastos.» o «Parda.»: la primera oración de cada respuesta. */
export function veredicto({ ganadora }: Vuelta): string {
  return ganadora === null ? "Parda." : `Gana ${conArticulo(ganadora)}.`;
}

/** Por qué gana: piezas, matas o el puesto en la escala común, según el motor. */
function motivo({ cartas, ganadora }: Vuelta, muestra: CardId): string {
  if (ganadora === null) {
    // «Con esta muestra, el 3 de oros y el 3 de copas tienen la misma fuerza.» con los números dichos.
    return explicarSituacion("comparar-cartas", cartas, muestra)
      .replace(/\b(\d{1,2})\b/g, (_, n: string) => palabraDeRango(Number(n) as never));
  }
  const perdedora = cartas.find((c) => c !== ganadora)!;
  const [piezaG, piezaP] = [pieza(ganadora, muestra), pieza(perdedora, muestra)];
  const sustituye = (c: CardId) => rangoDe(c) === 12 && pieza(c, muestra) !== null;
  const reemplazo = `${mayuscula(conArticulo(ganadora))} ocupa el lugar del ${palabraDeRango(rangoDe(muestra))}, que salió de muestra.`;
  if (piezaG !== null && piezaP !== null) {
    return [
      "Las dos son piezas.",
      ...[ganadora, perdedora].filter(sustituye).map((c) =>
        `${mayuscula(conArticulo(c))} ocupa el lugar del ${palabraDeRango(rangoDe(muestra))}.`),
      `El orden es ${enumerar(rangosPieza.map((r) => palabraDeRango(r)))}.`,
    ].join(" ");
  }
  if (piezaG !== null) {
    const frases = [sustituye(ganadora) ? `Es pieza. ${reemplazo}` : `${mayuscula(conArticulo(ganadora))} es pieza, porque es del palo de la muestra.`];
    if (matas.includes(perdedora)) frases.push("Las piezas les ganan hasta a las matas.");
    else if (rangoDe(perdedora) === rangoDe(ganadora)) frases.push(`${mayuscula(conArticulo(perdedora))} es una carta común.`);
    return frases.join(" ");
  }
  if (matas.includes(ganadora)) {
    return matas.includes(perdedora)
      ? `Las dos son matas. El orden es ${enumerar(matas.map(nombreHablado))}.`
      : `${mayuscula(conArticulo(ganadora))} es mata. Las matas les ganan a todas las cartas comunes.`;
  }
  const frases = [`Ninguna es pieza ni mata. En la escala, ${rangoConArticulo(ganadora)} va antes que ${rangoConArticulo(perdedora)}.`];
  if (rangoDe(ganadora) < rangoDe(perdedora)) frases.push("El número más alto no siempre gana.");
  return frases.join(" ");
}

const porRango = new Map(rangos.map((r) => [plano(palabraDeRango(r)), r]));
const mencion = new RegExp(`\\b(${[...porRango.keys()].join("|")}) de (${palos.join("|")})\\b`, "g");

/** Una línea reescrita de una vuelta solo nombra sus dos cartas o la muestra, y su veredicto es el del motor. */
function validarReescrita(id: string, texto: string, vuelta: Vuelta | undefined, muestra: CardId) {
  if (!vuelta) return;
  const enMesa = new Set<CardId>([muestra, ...vuelta.cartas]);
  for (const [, r, palo] of plano(texto).matchAll(mencion)) {
    if (!enMesa.has(cartaId(palo as Palo, porRango.get(r)!))) {
      throw new Error(`La línea ${id} nombra el ${r} de ${palo}, que no está en la vuelta.`);
    }
  }
  if (id.startsWith("respuesta")) {
    const primera = texto.split(/[.?!]/)[0];
    if (plano(primera) !== plano(veredicto(vuelta))) {
      throw new Error(`La línea ${id} dice «${primera}», pero el motor da «${veredicto(vuelta).slice(0, -1)}».`);
    }
  }
}

export function guionCompararCartas(ep: EpisodioComparar, vueltas: Vuelta[]): LineaGuion[] {
  const base: Record<string, string> = {
    pregunta: `${ep.gancho} La muestra es ${conArticulo(ep.muestra)}.`,
    escala: `Primero las piezas, después las matas, y después ${enumerar(rangosComunes.map((r) => palabraDeRango(r)))}. Si quedan iguales, es parda.`,
    cierre: "Probá otras vueltas en El Truco.",
  };
  vueltas.forEach((v, i) => {
    const [a, b] = v.cartas;
    base[`vuelta${i + 1}`] = `${mayuscula(nombreHablado(a))} contra ${nombreHablado(b)}. ¿Cuál gana?`;
    base[`respuesta${i + 1}`] = `${veredicto(v)} ${motivo(v, ep.muestra)}`;
  });
  const validos = idsCompararCartas(vueltas.length);
  for (const id of Object.keys(ep.lineas ?? {})) {
    if (!validos.includes(id)) throw new Error(`Línea desconocida: ${id}. Las de este episodio son: ${validos.join(", ")}.`);
  }
  const lineas: LineaGuion[] = [];
  for (const id of validos) {
    const reescrita = ep.lineas !== undefined && id in ep.lineas;
    const texto = reescrita ? ep.lineas![id] : base[id];
    if (texto === null) continue;
    const n = Number(id.match(/\d+$/)?.[0] ?? 0);
    if (reescrita) validarReescrita(id, texto, vueltas[n - 1], ep.muestra);
    lineas.push({ id, texto, ...(id.startsWith("vuelta") ? { pausa: true } : {}) });
  }
  return lineas;
}
