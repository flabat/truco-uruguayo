import { pieza, rangoDe, type CardId, type RangoPieza } from "./cartas.ts";
import { aDecidir, legalesOnline } from "./cantos-online.ts";
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
/** Los gestos que nombran una carta: todos menos «Solo bajas». */
export type CartaPedida = Exclude<GestoPie, "ojos-cerrados">;
export interface IndicacionPie {
  emisor: Asiento;
  destinatario: Asiento;
  frase: FrasePie;
  /** Sólo con «Jugá»: la carta que el pie conoce por las señas del destinatario. */
  carta?: CartaPedida;
  /** Vuelta de la mano, empezando en 1. */
  vuelta: number;
  /** Cuántas acciones de juego se habían confirmado al hablar. Los empates conservan el orden de registro. */
  indiceAccion: number;
}
const rangoDeGestoPieza: Partial<Record<GestoPie, number>> = { cejas: 2, beso: 4, nariz: 5, "ojo-derecho": 11, "ojo-izquierdo": 10 };

/**
 * Lo que significa un gesto: «2 de la muestra», «As bravo», «Tres». Con la muestra nombra la carta del palo
 * («2 de espadas»). Si la muestra es esa pieza, el 12 del palo toma su lugar y es la carta que se tiene.
 */
export function significadoDeGesto(gesto: GestoPie, muestra?: CardId): string {
  const texto = catalogoGestosPie[gesto].significado;
  if (!muestra || !texto.includes("de la muestra")) return texto;
  const palo = muestra.split("-")[0];
  return rangoDeGestoPieza[gesto] === rangoDe(muestra) ? "12 de " + palo : texto.replace("de la muestra", "de " + palo);
}

/** «2 de la muestra», «as bravo», «tres»: cómo nombra el pie una carta. Con la muestra, «2 de espadas». */
export function nombreDeCartaPedida(carta: CartaPedida, muestra?: CardId): string {
  const texto = significadoDeGesto(carta, muestra);
  return texto[0].toLocaleLowerCase("es-UY") + texto.slice(1);
}

/** «Jugá», «Jugá el 2 de la muestra», «Vení». */
export function textoDeIndicacion(i: Pick<IndicacionPie, "frase" | "carta">, muestra?: CardId): string {
  const frase = textoFrasePie[i.frase];
  return i.carta ? frase + " el " + nombreDeCartaPedida(i.carta, muestra) : frase;
}

/** Las cartas de una mano que corresponden a la carta pedida. */
export function cartasPedidas(cartas: readonly CardId[], carta: CartaPedida, muestra: CardId): CardId[] {
  return cartas.filter(c => gestoDeCarta(c, muestra) === carta);
}

function esCartaPedida(valor: unknown): valor is CartaPedida {
  return typeof valor === "string" && valor !== "ojos-cerrados" && Object.hasOwn(catalogoGestosPie, valor);
}

export type DestinoPie = Pick<IndicacionPie, "destinatario" | "vuelta">;
export interface VistaPie {
  pie: Asiento;
  vuelta: number;
  /** Sólo el pie humano recibe el asiento de la computadora que espera para tirar su carta. */
  esperando?: Asiento;
  /** El compañero humano recibe el pie de la computadora que responde el envido por el equipo. */
  responde?: Asiento;
  /** El pie recibe un grupo por compañero en el orden de esta vuelta; el emisor ve sólo su propio grupo. */
  grupos: { emisor: Asiento; gestos: GestoPie[] }[];
  opciones: { destinatario: Asiento; frases: FrasePie[] }[];
}

/** El gesto que corresponde a una carta, o undefined si es baja. */
export function gestoDeCarta(carta: CardId, muestra: CardId): GestoPie | undefined {
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

/**
 * Con señas al pie, el envido del rival lo responde el pie cuando lo juega la computadora: es quien reúne las
 * señas del equipo. Los compañeros humanos esperan su palabra. Si el pie es humano, cualquiera del equipo
 * responde, como antes. Un compañero humano que todavía debe cantar su flor conserva su oportunidad.
 */
export function pieQueResponde(estado: EstadoOnline, humanos: readonly number[]): Asiento | undefined {
  const lado = estado.lateral;
  if (!lado || lado.querido || estado.flores.length || estado.consultaFlor.length || estado.resultado) return undefined;
  const posibles = aDecidir(estado);
  if (!posibles.some(asiento => humanos.includes(asiento))) return undefined;
  const pie = vistaDelPie(estado, posibles[0], [])?.pie;
  if (pie === undefined || humanos.includes(pie) || !posibles.includes(pie)) return undefined;
  if (posibles.some(asiento => humanos.includes(asiento) && legalesOnline(estado, asiento).includes("flor"))) return undefined;
  return pie;
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

/**
 * El árbitro fija emisor e índice. La API proporciona estado e indicaciones de la misma mano bajo el bloqueo de mesa.
 * `carta` sólo acompaña a «Jugá» y tiene que ser un gesto que el destinatario le mostró al pie en esta vuelta.
 */
export function crearIndicacionPie(estado: EstadoOnline, asiento: Asiento, destinatario: unknown, frase: unknown,
  vuelta: unknown, atendidos: readonly DestinoPie[], carta?: unknown): IndicacionPie | undefined {
  if (!esAsientoOnline(destinatario) || typeof frase !== "string" || !Object.hasOwn(textoFrasePie, frase)) return undefined;
  const vista = vistaDelPie(estado, asiento, atendidos);
  const valida = frase as FrasePie;
  if (!vista || vista.vuelta !== vuelta || !vista.opciones.some(o => o.destinatario === destinatario && o.frases.includes(valida))) return undefined;
  if (carta !== undefined && (valida !== "juga" || !esCartaPedida(carta)
    || !vista.grupos.some(g => g.emisor === destinatario && g.gestos.includes(carta)))) return undefined;
  return { emisor: asiento, destinatario, frase: valida, ...(carta !== undefined && { carta: carta as CartaPedida }),
    vuelta: vista.vuelta, indiceAccion: estado.acciones.length };
}
