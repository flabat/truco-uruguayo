import { esCardId, type CardId } from "./cartas.ts";
import { compararCartas } from "./jerarquia.ts";
import {
  equipoPorAsiento, esAsiento, esRepartoV1, type Asiento, type Equipo, type RepartoV1,
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

export interface EstadoMano extends Mesa {
  readonly reparto: RepartoV1;
  /** Cartas aún en juego, por asiento. */
  readonly restantes: readonly (readonly CardId[])[];
}

export interface VistaAsiento extends Mesa {
  readonly asiento: Asiento;
  readonly cartas: readonly CardId[];
  readonly muestra: CardId;
  readonly dador: Asiento;
  readonly mano: Asiento;
  readonly equipoPorAsiento: typeof equipoPorAsiento;
}

export type ErrorJugada = "mano-cerrada" | "jugada-invalida" | "fuera-de-turno" | "carta-ajena" | "carta-ya-jugada";

export type ResultadoJugada =
  | { readonly ok: true; readonly estado: EstadoMano }
  | { readonly ok: false; readonly error: ErrorJugada };

export function iniciarMano(reparto: RepartoV1): EstadoMano {
  if (!esRepartoV1(reparto)) throw new TypeError("El reparto no es un reparto V1 legal.");
  const { versionReparto, semilla, dador, mano, manos: [a, b, c, d], muestra } = reparto;
  const manos: RepartoV1["manos"] = [[...a], [...b], [...c], [...d]];
  return {
    reparto: { versionReparto, semilla, dador, mano, manos, muestra },
    restantes: manos,
    turno: mano,
    vueltaActual: { salida: mano, jugadas: [] },
    vueltas: [],
    equipoGanador: null,
  };
}

function resolverVuelta(jugadas: readonly Jugada[], muestra: CardId): ResultadoVuelta {
  // El orden de juego desempata entre compañeros que alcanzaron el mismo máximo.
  const mayor = jugadas.reduce((primera, otra) =>
    compararCartas(otra.carta, primera.carta, muestra) > 0 ? otra : primera);
  const equipo = equipoPorAsiento[mayor.asiento];
  const parda = jugadas.some(({ asiento, carta }) =>
    equipoPorAsiento[asiento] !== equipo && compararCartas(carta, mayor.carta, muestra) === 0);
  return parda ? { tipo: "parda" } : { tipo: "ganada", equipo, asiento: mayor.asiento };
}

function ganadorDeMano(vueltas: readonly VueltaCerrada[], mano: Asiento): Equipo | null {
  const [primera, segunda, tercera] = vueltas.map(({ resultado }) =>
    resultado.tipo === "ganada" ? resultado.equipo : null);
  if (segunda === undefined) return null;
  // Solo se llega a la tercera con una vuelta por equipo o con dos pardas.
  if (tercera !== undefined) return tercera ?? primera ?? equipoPorAsiento[mano];
  if (primera === null) return segunda;
  if (segunda === null || primera === segunda) return primera;
  return null;
}

export function jugarCarta(estado: EstadoMano, jugada: Jugada): ResultadoJugada {
  const { vueltaActual, reparto } = estado;
  if (vueltaActual === null) return { ok: false, error: "mano-cerrada" };
  if (!esAsiento(jugada?.asiento) || !esCardId(jugada.carta)) {
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
  if (jugadas.length < 4) {
    const turno = ((asiento + 1) % 4) as Asiento;
    return {
      ok: true,
      estado: { ...estado, restantes, turno, vueltaActual: { salida: vueltaActual.salida, jugadas } },
    };
  }

  const resultado = resolverVuelta(jugadas, reparto.muestra);
  const vueltas = [...estado.vueltas, { salida: vueltaActual.salida, jugadas, resultado }];
  const equipoGanador = ganadorDeMano(vueltas, reparto.mano);
  const salida = resultado.tipo === "ganada" ? resultado.asiento : reparto.mano;
  return {
    ok: true,
    estado: {
      reparto, restantes, vueltas, equipoGanador,
      turno: equipoGanador === null ? salida : null,
      vueltaActual: equipoGanador === null ? { salida, jugadas: [] } : null,
    },
  };
}

/** Los bots y la mesa guiada reciben sus cartas y una copia de los hechos públicos. */
export function vistaPara(estado: EstadoMano, asiento: Asiento): VistaAsiento {
  if (!esAsiento(asiento)) throw new RangeError("El asiento debe estar entre 0 y 3.");
  const { muestra, dador, mano } = estado.reparto;
  return structuredClone({
    asiento, cartas: estado.restantes[asiento], muestra, dador, mano, equipoPorAsiento,
    turno: estado.turno,
    vueltaActual: estado.vueltaActual,
    vueltas: estado.vueltas,
    equipoGanador: estado.equipoGanador,
  });
}
