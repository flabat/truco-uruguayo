import { turnosDeEquipo } from "../../api/turnos.ts";
import { signals, type PublicTurn, type Signal } from "../../training/contracts/index.ts";
import { esCardId } from "./cartas.ts";
import {
  anticiparAnteFlor, aplicarOnline, iniciarOnline, marcadorOnline, vistaOnline, vistaTercetos,
  type AccionOnline, type Cobro, type EstadoOnline,
} from "./mesa-online.ts";
import { esAsientoOnline, esRepartoOnline } from "./reparto.ts";

export type PerfilChicoOnline = "duel" | "pairs" | "pairs-private-senas" | "tercetos-v1";

const asientosPorPerfil: Record<PerfilChicoOnline, number> = {
  duel: 2, pairs: 4, "pairs-private-senas": 4, "tercetos-v1": 6,
};

export interface EstadoChicoOnline {
  perfil: PerfilChicoOnline;
  motor: EstadoOnline;
  humanos?: readonly number[];
  turnos: readonly PublicTurn[];
  puntos: readonly [number, number];
  cobros: readonly Cobro[];
  terminada: boolean;
}

export function iniciarChicoOnline(perfil: PerfilChicoOnline, reparto: unknown, puntosInicio: readonly [number, number],
    meta: number, manoNumero: number, humanos?: readonly number[]): EstadoChicoOnline {
  if (!esRepartoOnline(reparto) || reparto.manos.length !== asientosPorPerfil[perfil]) {
    throw new RangeError("El reparto no corresponde al perfil del replay.");
  }
  const motor = iniciarOnline(reparto, puntosInicio, meta, manoNumero);
  return { perfil, motor, humanos, turnos: [], puntos: marcadorOnline(motor), cobros: [], terminada: false };
}

function leerDecision(entrada: unknown, perfil: PerfilChicoOnline) {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) throw new TypeError("Se esperaba una acción.");
  const { tipo, asiento, carta, sena } = entrada as Record<string, unknown>;
  if (!esAsientoOnline(asiento) || typeof tipo !== "string") throw new TypeError("Asiento o tipo de acción inválido.");
  const campos = ["tipo", "asiento"];
  let accion: AccionOnline;
  if (tipo === "carta") {
    if (!esCardId(carta)) throw new TypeError("Carta inválida en la decisión.");
    campos.push("carta");
    accion = { tipo, asiento, carta };
  } else {
    // aplicarOnline comprueba el canto entre las acciones legales del estado exacto.
    accion = { tipo: tipo as Exclude<AccionOnline["tipo"], "carta">, asiento };
  }
  if (Object.hasOwn(entrada, "sena")) {
    if (perfil !== "pairs-private-senas" || !signals.includes(sena as Signal)) throw new RangeError("Seña no permitida.");
    campos.push("sena");
  }
  if (Object.keys(entrada).length !== campos.length || !campos.every(c => Object.hasOwn(entrada, c))) {
    throw new TypeError("Campos inválidos en la decisión.");
  }
  return { accion, sena: sena as Signal | undefined };
}

export function decidirChicoOnline(previo: EstadoChicoOnline, entrada: unknown, duelo?: unknown): EstadoChicoOnline {
  const { motor, perfil, humanos } = previo;
  if (duelo !== motor.lance?.duelo) throw new RangeError("La decisión no corresponde al duelo en curso.");
  const { accion, sena } = leerDecision(entrada, perfil);
  if (accion.tipo === "mazo" && perfil !== "tercetos-v1" && (humanos === undefined || humanos.includes(accion.asiento))) {
    throw new RangeError("En este perfil solo puede entregar una computadora de la mesa en línea.");
  }
  const paso = aplicarOnline(motor, accion);
  if (!paso.ok) throw new RangeError(`Decisión rechazada por el árbitro: ${paso.error}.`);
  // La arena conserva el turno natural. En las mesas el servidor puede adelantar un turno de computadora tras una flor.
  const siguiente = humanos === undefined ? paso.estado : anticiparAnteFlor(paso.estado, humanos);
  // Al abrir otro duelo el motor traslada los cobros del duelo anterior al historial y reinicia su lista actual.
  const cobrosDelLance = siguiente.lance?.duelo === motor.lance?.duelo ? siguiente.cobros : siguiente.historialLances!.at(-1)!.cobros;
  const cobros = cobrosDelLance.slice(motor.cobros.length);
  const turno: PublicTurn = sena === undefined ? { action: accion, awards: cobros } : { action: accion, awards: cobros, signal: sena };
  const turnos = perfil === "pairs-private-senas" ? [...previo.turnos, turno] : previo.turnos;
  return { perfil, motor: siguiente, humanos, turnos, puntos: marcadorOnline(siguiente), cobros, terminada: siguiente.resultado !== null };
}

export function vistaChicoOnline({ motor, perfil, turnos }: EstadoChicoOnline, asiento: number) {
  if (!esAsientoOnline(asiento) || asiento >= motor.mano.reparto.manos.length) throw new RangeError("Asiento fuera de la mesa.");
  if (perfil === "tercetos-v1") {
    return { ...vistaTercetos(motor, asiento), lance: motor.lance, historialLances: motor.historialLances };
  }
  return { ...vistaOnline(motor, asiento), ...(perfil === "pairs-private-senas" && { turnos: turnosDeEquipo(turnos, asiento) }) };
}
