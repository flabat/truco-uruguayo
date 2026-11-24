import { type CardId } from "./cartas.ts";
import { compararCartas } from "./jerarquia.ts";
import { elegirAccionOnline, type AccionOnline, type VistaOnline } from "./mesa-online.ts";
import { catalogoGestosPie, gestosDeCartas, type FrasePie, type GestoPie, type IndicacionPie, type VistaPie } from "./senas-pie.ts";
import type { Asiento } from "./reparto.ts";

export const politicaPie = "pie-clasico-v1";
export const observacionPie = "vista-pie-v1";
export const accionesPie = "cartas-cantos-indicaciones-v1";

const jerarquiaGestos = Object.keys(catalogoGestosPie) as GestoPie[];
const puestoDelTres = jerarquiaGestos.indexOf("labio-inferior");

/** Usa las categorías de la instantánea que recibió el pie, incluida la ambigüedad de los ases y sietes bravos. */
export function elegirIndicacionesPie(vista: VistaOnline, pie: VistaPie): { destinatario: Asiento; frase: FrasePie }[] {
  if (pie.pie !== vista.asiento || pie.vuelta === 3) return [];
  const propia = gestosDeCartas(vista.cartas, vista.muestra)[0];
  const puestoPropio = jerarquiaGestos.indexOf(propia);
  const elegidas: { destinatario: Asiento; frase: FrasePie }[] = [];
  for (const { destinatario, frases } of pie.opciones) {
    const grupo = pie.grupos.find(g => g.emisor === destinatario);
    if (!grupo?.gestos.length) continue;
    const puestoAjeno = jerarquiaGestos.indexOf(grupo.gestos[0]);
    if (frases.includes("veni") && puestoPropio <= puestoDelTres && puestoPropio <= puestoAjeno) {
      elegidas.push({ destinatario, frase: "veni" });
    } else if (puestoAjeno <= puestoDelTres) {
      elegidas.push({ destinatario, frase: frases.includes("juga") ? "juga" : "voy-a-vos" });
    }
  }
  return elegidas;
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
  return { tipo: "carta", asiento, carta: mayor };
}
