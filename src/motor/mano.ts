import { esCardId, type CardId } from "./cartas.ts";
import { compararCartas } from "./jerarquia.ts";
import {
  equipoDelAsiento, esAsientoOnline, esRepartoV1, esRepartoOnline, type Asiento, type Equipo, type Reparto, type RepartoV1,
} from "./reparto.ts";

export interface Jugada {
  readonly asiento: Asiento;
  readonly carta: CardId;
}

export interface Vuelta {
  readonly salida: Asiento;
  readonly jugadas: readonly Jugada[];
}

export type ResultadoVuelta =
  | { readonly tipo: "parda" }
  | { readonly tipo: "ganada"; readonly equipo: Equipo; readonly asiento: Asiento };

export interface VueltaCerrada extends Vuelta {
  readonly resultado: ResultadoVuelta;
}

interface Mesa {
  readonly turno: Asiento | null;
  readonly vueltaActual: Vuelta | null;
  readonly vueltas: readonly VueltaCerrada[];
  readonly equipoGanador: Equipo | null;
}

export interface EstadoMano<R extends Reparto = RepartoV1> extends Mesa {
  readonly reparto: R;
  /** Orden circular desde el mano del lance, en asientos físicos. */
  readonly participantes: readonly Asiento[];
  /** Cartas aún en juego, por asiento. */
  readonly restantes: readonly (readonly CardId[])[];
}

export interface VistaAsiento extends Mesa {
  readonly asiento: Asiento;
  readonly cartas: readonly CardId[];
  readonly muestra: CardId;
  readonly dador: Asiento;
  readonly mano: Asiento;
  readonly equipoPorAsiento: readonly Equipo[];
}

export type ErrorJugada = "mano-cerrada" | "jugada-invalida" | "fuera-de-turno" | "carta-ajena" | "carta-ya-jugada";

export type ResultadoJugada<R extends Reparto = RepartoV1> =
  | { readonly ok: true; readonly estado: EstadoMano<R> }
  | { readonly ok: false; readonly error: ErrorJugada };

export function iniciarMano<R extends Reparto>(reparto: R, activos?: readonly Asiento[]): EstadoMano<R> {
  if (!esRepartoV1(reparto) && !esRepartoOnline(reparto)) throw new TypeError("El reparto no es válido.");
  const copia = structuredClone(reparto);
  const { mano, manos } = copia;
  const participantes = activos ? [...activos] : manos.map((_, i) => ((mano + i) % manos.length) as Asiento);
  if (activos && (reparto.versionReparto !== "online-2" || activos.length !== 2 ||
      !activos.every(esAsientoOnline) || activos[1] !== (activos[0] + 3) % 6)) {
    throw new RangeError("El duelo requiere dos asientos enfrentados.");
  }
  return {
    reparto: copia, participantes,
    restantes: manos,
    turno: participantes[0],
    vueltaActual: { salida: participantes[0], jugadas: [] },
    vueltas: [],
    equipoGanador: null,
  };
}

function resolverVuelta(jugadas: readonly Jugada[], muestra: CardId): ResultadoVuelta {
  // El orden de juego desempata entre compañeros que alcanzaron el mismo máximo.
  const mayor = jugadas.reduce((primera, otra) =>
    compararCartas(otra.carta, primera.carta, muestra) > 0 ? otra : primera);
  const equipo = equipoDelAsiento(mayor.asiento);
  const parda = jugadas.some(({ asiento, carta }) =>
    equipoDelAsiento(asiento) !== equipo && compararCartas(carta, mayor.carta, muestra) === 0);
  return parda ? { tipo: "parda" } : { tipo: "ganada", equipo, asiento: mayor.asiento };
}

function ganadorDeMano(vueltas: readonly VueltaCerrada[], mano: Asiento): Equipo | null {
  const [primera, segunda, tercera] = vueltas.map(({ resultado }) =>
    resultado.tipo === "ganada" ? resultado.equipo : null);
  if (segunda === undefined) return null;
  // Solo se llega a la tercera con una vuelta por equipo o con dos pardas.
  if (tercera !== undefined) return tercera ?? primera ?? equipoDelAsiento(mano);
  if (primera === null) return segunda;
  if (segunda === null || primera === segunda) return primera;
  return null;
}

export function jugarCarta<R extends Reparto>(estado: EstadoMano<R>, jugada: Jugada): ResultadoJugada<R> {
  const { vueltaActual, reparto } = estado;
  if (vueltaActual === null) return { ok: false, error: "mano-cerrada" };
  if (!esAsientoOnline(jugada?.asiento) || jugada.asiento >= reparto.manos.length || !esCardId(jugada.carta)) {
    return { ok: false, error: "jugada-invalida" };
  }
  const { asiento, carta } = jugada;
  if (asiento !== estado.turno) return { ok: false, error: "fuera-de-turno" };
  if (!estado.restantes[asiento].includes(carta)) {
    const error = reparto.manos[asiento].includes(carta) ? "carta-ya-jugada" : "carta-ajena";
    return { ok: false, error };
  }

  const restantes = estado.restantes.map((cartas, posicion) =>
    posicion === asiento ? cartas.filter((propia) => propia !== carta) : cartas);
  const jugadas = [...vueltaActual.jugadas, { asiento, carta }];
  if (jugadas.length < estado.participantes.length) {
    const turno = estado.participantes[(estado.participantes.indexOf(asiento) + 1) % estado.participantes.length];
    return {
      ok: true,
      estado: { ...estado, restantes, turno, vueltaActual: { salida: vueltaActual.salida, jugadas } },
    };
  }

  const resultado = resolverVuelta(jugadas, reparto.muestra);
  const vueltas = [...estado.vueltas, { salida: vueltaActual.salida, jugadas, resultado }];
  const equipoGanador = ganadorDeMano(vueltas, estado.participantes[0]);
  const salida = resultado.tipo === "ganada" ? resultado.asiento : estado.participantes[0];
  return {
    ok: true,
    estado: {
      ...estado, restantes, vueltas, equipoGanador,
      turno: equipoGanador === null ? salida : null,
      vueltaActual: equipoGanador === null ? { salida, jugadas: [] } : null,
    },
  };
}

/** Los bots y la mesa guiada reciben sus cartas y una copia de los hechos públicos. */
export function vistaPublicaPara(estado: EstadoMano<Reparto>, asiento: Asiento): Omit<VistaAsiento, "cartas"> {
  if (!esAsientoOnline(asiento) || asiento >= estado.reparto.manos.length) throw new RangeError("El asiento debe estar en la mesa.");
  const { muestra, dador, mano } = estado.reparto;
  return structuredClone({
    asiento, muestra, dador, mano,
    equipoPorAsiento: estado.reparto.manos.map((_, i) => equipoDelAsiento(i as Asiento)),
    turno: estado.turno,
    vueltaActual: estado.vueltaActual,
    vueltas: estado.vueltas,
    equipoGanador: estado.equipoGanador,
  });
}

export function vistaPara(estado: EstadoMano<Reparto>, asiento: Asiento): VistaAsiento {
  return { ...vistaPublicaPara(estado, asiento), cartas: [...estado.restantes[asiento]] };
}
