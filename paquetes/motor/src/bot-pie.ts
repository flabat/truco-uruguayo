import { type CardId } from "./cartas.ts";
import { compararCartas } from "./jerarquia.ts";
import { elegirAccionOnline, type AccionOnline, type VistaOnline } from "./mesa-online.ts";
import { cartasPedidas, catalogoGestosPie, gestosDeCartas, type CartaPedida, type FrasePie, type GestoPie, type IndicacionPie, type VistaPie } from "./senas-pie.ts";
import type { Asiento } from "./reparto.ts";

export const politicaPie = "pie-clasico-v1";
export const observacionPie = "vista-pie-v1";
export const accionesPie = "cartas-cantos-indicaciones-v1";

const jerarquiaGestos = Object.keys(catalogoGestosPie) as GestoPie[];
const puestoDelTres = jerarquiaGestos.indexOf("labio-inferior");

const piezas = jerarquiaGestos.slice(0, 5);
const puesto = (gesto: GestoPie) => jerarquiaGestos.indexOf(gesto);

export interface PropuestaPie { destinatario: Asiento; frase: FrasePie; carta?: CartaPedida }

/**
 * La pieza más baja que gana seguro: todas las piezas mayores están en el equipo, en la mano del pie
 * o en las señas de un compañero. Si ninguna gana seguro, la mejor carta que mostró el compañero.
 */
export function cartaParaJugar(gestos: readonly GestoPie[], delEquipo: ReadonlySet<GestoPie>): CartaPedida | undefined {
  const segura = gestos.filter(g => piezas.includes(g))
    .findLast(g => piezas.slice(0, puesto(g)).every(mayor => delEquipo.has(mayor)));
  const elegida = segura ?? gestos[0];
  return elegida === undefined || elegida === "ojos-cerrados" ? undefined : elegida;
}

/**
 * Usa las categorías de la instantánea que recibió el pie, incluida la ambigüedad de los ases y sietes bravos.
 * Cada compañero recibe la frase de antes: «Vení» si el pie tiene la mejor carta, hasta un tres, y «Jugá» o
 * «Voy a vos» si la tiene él. En tercetos el equipo sigue un solo plan: juega el compañero más fuerte, que
 * recibe la carta a jugar con «Jugá», y los demás que tiran antes que el pie reciben «Vení».
 */
export function elegirIndicacionesPie(vista: VistaOnline, pie: VistaPie): PropuestaPie[] {
  if (pie.pie !== vista.asiento || pie.vuelta === 3) return [];
  const propios = gestosDeCartas(vista.cartas, vista.muestra);
  const puestoPropio = puesto(propios[0]);
  const gestosDe = (destinatario: Asiento) => pie.grupos.find(g => g.emisor === destinatario)?.gestos ?? [];
  const elegidas: PropuestaPie[] = [];
  for (const { destinatario, frases } of pie.opciones) {
    const gestos = gestosDe(destinatario);
    if (!gestos.length) continue;
    const puestoAjeno = puesto(gestos[0]);
    if (frases.includes("veni") && puestoPropio <= puestoDelTres && puestoPropio <= puestoAjeno) {
      elegidas.push({ destinatario, frase: "veni" });
    } else if (puestoAjeno <= puestoDelTres) {
      elegidas.push({ destinatario, frase: frases.includes("juga") ? "juga" : "voy-a-vos" });
    }
  }

  // Un solo compañero juega fuerte: el de mejor carta; ante un empate, el primero en tirar.
  const fuertes = elegidas.filter(e => e.frase !== "veni");
  if (!fuertes.length) return elegidas;
  const juega = fuertes.reduce((a, b) => puesto(gestosDe(b.destinatario)[0]) < puesto(gestosDe(a.destinatario)[0]) ? b : a);
  const delEquipo = new Set([...propios, ...pie.grupos.flatMap(g => g.gestos)]);
  const plan: PropuestaPie[] = [];
  for (const { destinatario, frases } of pie.opciones) {
    if (destinatario === juega.destinatario) {
      const carta = juega.frase === "juga" ? cartaParaJugar(gestosDe(destinatario), delEquipo) : undefined;
      plan.push({ ...juega, ...(carta && { carta }) });
    } else if (frases.includes("veni") && gestosDe(destinatario).length) {
      plan.push({ destinatario, frase: "veni" });
    }
  }
  return plan;
}

/** Las palabras son públicas. Sólo la vista del asiento puede influir en su elección. */
export function elegirAccionConPie(vista: VistaOnline, pie: VistaPie | undefined,
  indicaciones: readonly IndicacionPie[]): AccionOnline | null {
  const habitual = elegirAccionOnline(vista);
  if (habitual?.tipo !== "carta" || !pie || !vista.vueltaActual || vista.cartas.length < 2) return habitual;
  const { asiento, muestra, equipoPorAsiento, vueltaActual } = vista;
  const equipo = equipoPorAsiento[asiento];
  const vigentes = indicaciones.filter(i => i.vuelta === pie.vuelta
    && !vueltaActual.jugadas.some(j => j.asiento === i.destinatario));
  const recibida = vigentes.find(i => i.destinatario === asiento);
  const delego = vigentes.some(i => i.emisor === asiento && i.frase === "voy-a-vos");
  const rivalPideFuerte = vigentes.some(i => equipoPorAsiento[i.emisor] !== equipo && i.frase !== "veni");
  if (!recibida && !delego && !rivalPideFuerte) return habitual;

  const orden = (a: CardId, b: CardId) => compararCartas(a, b, muestra);
  const cartas = [...vista.cartas].sort(orden);
  const menor = cartas[0], mayor = cartas[cartas.length - 1];
  const jugadas = vueltaActual.jugadas;
  if (recibida?.frase === "veni" || delego) {
    // Si hay que ganar la vuelta para seguir y ya tenemos una respuesta ganadora, conservar la decisión de juego.
    const primera = vista.vueltas[0]?.resultado;
    if (primera && (primera.tipo === "parda" || primera.equipo !== equipo) && jugadas.length) return habitual;
    return { tipo: "carta", asiento, carta: menor };
  }
  const mayorRival = jugadas.filter(j => equipoPorAsiento[j.asiento] !== equipo).map(j => j.carta).sort(orden).at(-1);
  if (mayorRival && (orden(mayor, mayorRival) < 0 ||
    jugadas.some(j => equipoPorAsiento[j.asiento] === equipo && orden(j.carta, mayorRival) > 0))) return habitual;
  // La carta que nombró el pie, si alcanza para ganar lo que hay en la mesa. Si no, la mayor.
  const pedida = recibida?.carta && cartasPedidas(cartas, recibida.carta, muestra)[0];
  if (pedida && (!mayorRival || orden(pedida, mayorRival) > 0)) return { tipo: "carta", asiento, carta: pedida };
  return { tipo: "carta", asiento, carta: mayor };
}
