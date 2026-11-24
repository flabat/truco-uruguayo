import { pieza, rangoDe, type CardId, type RangoPieza } from "./cartas.ts";
import { participantesDe } from "./mano.ts";
import type { EstadoOnline } from "./mesa-online.ts";
import { equipoDelAsiento, esAsientoOnline, type Asiento } from "./reparto.ts";
import type { Signal } from "./contratos.ts";

export const versionSenasPie = "senas-pie-v1";
export type GestoPie = Exclude<Signal, "cachetes" | "labio-superior">;

// El orden del catálogo es también el orden público y estable de presentación.
export const catalogoGestosPie = {
  cejas: { expresion: "alza ambas cejas", significado: "2 de la muestra" },
  beso: { expresion: "junta los labios como para dar un beso", significado: "4 de la muestra" },
  nariz: { expresion: "frunce la nariz", significado: "5 de la muestra" },
  "ojo-derecho": { expresion: "guiña su ojo derecho", significado: "11 de la muestra" },
  "ojo-izquierdo": { expresion: "guiña su ojo izquierdo", significado: "10 de la muestra" },
  "labios-derecha": { expresion: "lleva los labios a su derecha", significado: "As bravo" },
  "labios-izquierda": { expresion: "lleva los labios a su izquierda", significado: "Siete bravo" },
  "labio-inferior": { expresion: "muerde el labio de abajo", significado: "Tres" },
  boca: { expresion: "entreabre la boca", significado: "Dos común" },
  lengua: { expresion: "asoma la lengua", significado: "As de copa u oro" },
  "ojos-cerrados": { expresion: "cierra ambos ojos", significado: "Solo bajas" },
} as const satisfies Record<GestoPie, { expresion: string; significado: string }>;
const ordenGestos = Object.keys(catalogoGestosPie) as GestoPie[];
const gestoPieza: Record<RangoPieza, GestoPie> = {
  2: "cejas", 4: "beso", 5: "nariz", 11: "ojo-derecho", 10: "ojo-izquierdo",
};

export const textoFrasePie = { veni: "Vení", juga: "Jugá", "voy-a-vos": "Voy a vos" } as const;
export type FrasePie = keyof typeof textoFrasePie;
export interface IndicacionPie {
  emisor: Asiento;
  destinatario: Asiento;
  frase: FrasePie;
  /** Vuelta de la mano, empezando en 1. */
  vuelta: number;
  /** Cuántas acciones de juego se habían confirmado al hablar. Los empates conservan el orden de registro. */
  indiceAccion: number;
}
export type DestinoPie = Pick<IndicacionPie, "destinatario" | "vuelta">;
export interface VistaPie {
  pie: Asiento;
  vuelta: number;
  /** Sólo el pie humano recibe el asiento de la computadora que espera para tirar su carta. */
  esperando?: Asiento;
  /** El pie recibe un grupo por compañero en el orden de esta vuelta; el emisor ve sólo su propio grupo. */
  grupos: { emisor: Asiento; gestos: GestoPie[] }[];
  opciones: { destinatario: Asiento; frases: FrasePie[] }[];
}

function gestoDeCarta(carta: CardId, muestra: CardId): GestoPie | undefined {
  const efectiva = pieza(carta, muestra);
  if (efectiva !== null) return gestoPieza[efectiva];
  if (carta === "espadas-01" || carta === "bastos-01") return "labios-derecha";
  if (carta === "espadas-07" || carta === "oros-07") return "labios-izquierda";
  switch (rangoDe(carta)) {
    case 3: return "labio-inferior";
    case 2: return "boca";
    case 1: return "lengua";
  }
}

export function gestosDeCartas(cartas: readonly CardId[], muestra: CardId): GestoPie[] {
  const presentes = new Set(cartas.map(carta => gestoDeCarta(carta, muestra)));
  const gestos = ordenGestos.filter(gesto => presentes.has(gesto));
  return gestos.length || !cartas.length ? gestos : ["ojos-cerrados"];
}

export function vistaDelPie(estado: EstadoOnline, asiento: Asiento, atendidos: readonly DestinoPie[]): VistaPie | undefined {
  const { mano } = estado;
  const vueltaActual = mano.vueltaActual;
  if (estado.resultado || !vueltaActual) return undefined;
  const inicial = participantesDe(mano);
  if (inicial.length < 4 || !inicial.includes(asiento)) return undefined;
  const equipo = equipoDelAsiento(asiento);
  const pie = inicial.findLast(lugar => equipoDelAsiento(lugar) === equipo)!;
  const salida = inicial.indexOf(vueltaActual.salida);
  const orden = [...inicial.slice(salida), ...inicial.slice(0, salida)];
  const companeros = orden.filter(lugar => equipoDelAsiento(lugar) === equipo && lugar !== pie);
  const vuelta = mano.vueltas.length + 1;

  const grupos = companeros.filter(emisor => asiento === pie || asiento === emisor).map(emisor => {
    // Las cartas tiradas en ESTA vuelta aún pertenecen a la instantánea de apertura.
    const jugada = vueltaActual.jugadas.find(j => j.asiento === emisor);
    const alAbrir = jugada ? [...mano.restantes[emisor], jugada.carta] : mano.restantes[emisor];
    return { emisor, gestos: gestosDeCartas(alAbrir, mano.reparto.muestra) };
  });
  const opciones: VistaPie["opciones"] = [];
  if (asiento === pie && estado.retiro === undefined && !estado.rechazoTruco) {
    for (const destinatario of companeros) {
      if (vueltaActual.jugadas.some(j => j.asiento === destinatario)
        || atendidos.some(i => i.vuelta === vuelta && i.destinatario === destinatario)) continue;
      const frases: FrasePie[] = orden.indexOf(destinatario) < orden.indexOf(pie) ? ["veni", "juga"] : ["voy-a-vos"];
      opciones.push({ destinatario, frases });
    }
  }
  return { pie, vuelta, grupos, opciones };
}

/** El árbitro fija emisor e índice. La API proporciona estado e indicaciones de la misma mano bajo el bloqueo de mesa. */
export function crearIndicacionPie(estado: EstadoOnline, asiento: Asiento, destinatario: unknown, frase: unknown,
  vuelta: unknown, atendidos: readonly DestinoPie[]): IndicacionPie | undefined {
  if (!esAsientoOnline(destinatario) || typeof frase !== "string" || !Object.hasOwn(textoFrasePie, frase)) return undefined;
  const vista = vistaDelPie(estado, asiento, atendidos);
  const valida = frase as FrasePie;
  if (!vista || vista.vuelta !== vuelta || !vista.opciones.some(o => o.destinatario === destinatario && o.frases.includes(valida))) return undefined;
  return { emisor: asiento, destinatario, frase: valida, vuelta: vista.vuelta, indiceAccion: estado.acciones.length };
}
