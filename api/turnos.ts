import { versionSenasPie, type IndicacionPie } from "../src/motor/senas-pie.ts";
import { esCardId } from "../src/motor/cartas.ts";
import { aDecidir, anticiparAnteFlor, elegirAccionOnline, iniciarOnline, segundaPerdidaEnDuelo, versionReglasOnline, vistaParaPolitica,
  type AccionOnline, type EstadoOnline, type RepartoOnline } from "../src/motor/mesa-online.ts";
import type { Asiento } from "../src/motor/reparto.ts";
import { canSeeSignal, hasSignals, signals, signalVersionFor, type ActionId, type Format, type PublicTurn, type Signal } from "../training/contracts/index.ts";
import { commitTurn } from "../training/signals/index.ts";
import type { FormatoMesa } from "./mesas.ts";
import { ErrorPeticion } from "./http.ts";

export type Confirmada = AccionOnline & { sena?: Signal };
export interface ManoPublicable { estado: EstadoOnline; turnos: PublicTurn[]; indicaciones?: IndicacionPie[] }
export interface Registro {
  numero: number; version: number; version_reglas: number; version_senas: string | null;
  indicaciones?: IndicacionPie[];
  reparto: RepartoOnline; puntos_inicio: [number, number]; acciones: Confirmada[];
}

export function identificador(accion: Confirmada): ActionId {
  const base = accion.tipo === "carta" ? accion.carta : accion.tipo;
  return accion.sena === undefined ? base : `${accion.sena}/${base}`;
}

export function leerAccion(datos: unknown, asiento: Asiento, formato: FormatoMesa, alPie = false): Confirmada {
  if (!datos || typeof datos !== "object" || Array.isArray(datos) || !("tipo" in datos) || typeof datos.tipo !== "string") {
    throw new ErrorPeticion(400, "Falta la acción de juego.");
  }
  const claves = datos.tipo === "carta" ? ["tipo", "carta"] : ["tipo"];
  if ("sena" in datos) {
    if (alPie || formato === "triples" || !hasSignals(formato) || !signals.includes(datos.sena as Signal)) throw new ErrorPeticion(400, "Seña no permitida.");
    claves.push("sena");
  }
  if (Object.keys(datos).length !== claves.length || !claves.every(k => Object.hasOwn(datos, k))
    || (datos.tipo === "carta" && !("carta" in datos && esCardId(datos.carta)))
    || (datos.tipo === "mazo" && formato !== "triples") || esCardId(datos.tipo) || datos.tipo.includes("/")) {
    throw new ErrorPeticion(400, "La acción requiere un canto o una carta y una seña opcional.");
  }
  return { ...datos, asiento } as Confirmada;
}

function confirmarTurno(mano: ManoPublicable, formato: Format, asiento: Asiento, id: ActionId): ManoPublicable {
  const {state, turn} = commitTurn(mano.estado, asiento, formato, id);
  return {estado: state, turnos: [...mano.turnos, turn]};
}

export function confirmar(mano: ManoPublicable, formato: Format, accion: Confirmada): ManoPublicable {
  return confirmarTurno(mano, formato, accion.asiento, identificador(accion));
}

export function confirmarComputadora(mano: ManoPublicable, formato: Format, asiento: Asiento, decision: ActionId) {
  // Conservar el canto que el actor eligió, incluida su probabilidad de retrucar.
  const entregar = esCardId(decision) && mano.estado.mano.restantes[asiento].includes(decision)
    && (mano.estado.antesDeSalida === asiento || segundaPerdidaEnDuelo(mano.estado, asiento));
  return confirmarTurno(mano, formato, asiento, entregar ? "mazo" : decision);
}

// La versión de almacenamiento se conserva para restaurar partidas históricas.
// Cada vista en línea limita los gestos al equipo, incluso en esas partidas.
export function turnosDeEquipo(turnos: readonly PublicTurn[], asiento: Asiento): PublicTurn[] {
  return turnos.map(({ signal, action, awards }) =>
    signal && canSeeSignal("pairs-private-senas", action.asiento, asiento) ? { signal, action, awards } : { action, awards });
}

export function guardarAcciones(mano: ManoPublicable): Confirmada[] {
  return mano.turnos.map(t => t.signal ? {...t.action, sena: t.signal} : t.action);
}

export function prepararTurno(mano: ManoPublicable, humanos: readonly number[]): ManoPublicable {
  return { ...mano, estado: anticiparAnteFlor(mano.estado, humanos) };
}

export function restaurar(fila: Registro, formato: Format, meta?: number, humanos?: readonly number[]): ManoPublicable {
  const alPie = formato === "pairs-private-senas" && fila.version_senas === versionSenasPie;
  if (fila.version_reglas !== versionReglasOnline || (!alPie && fila.version_senas !== signalVersionFor(formato))) {
    throw new ErrorPeticion(503, "Esta mesa requiere otra versión de las reglas.");
  }
  const inicial: ManoPublicable = {estado: iniciarOnline(fila.reparto, fila.puntos_inicio, meta), turnos: []};
  const mano = fila.acciones.reduce((previa, accion) => {
    // Las manos anteriores pueden tener una salida rival en este mismo punto.
    // Solo reconstruir la oportunidad si el registro contiene la intervención.
    if (alPie && accion.sena !== undefined) throw new Error("Seña manual en un reparto con señas automáticas.");
    const enTurno = aDecidir(previa.estado).includes(accion.asiento);
    return confirmar(enTurno ? previa : prepararTurno(previa, []), formato, accion);
  }, inicial);
  if (alPie) mano.indicaciones = fila.indicaciones ?? [];
  return humanos ? prepararTurno(mano, humanos) : mano;
}

export function jugarComputadoras(mano: ManoPublicable, formato: Format, humanos: readonly number[], ensayo = false,
    alConfirmar?: (mano: ManoPublicable, propuesta: ActionId) => void) {
  while (!mano.estado.resultado) {
    mano = prepararTurno(mano, humanos);
    const posibles = aDecidir(mano.estado);
    if (posibles.some(s => humanos.includes(s))) break;
    const asiento = posibles[0];
    if (asiento === undefined) throw new Error("Falta un asiento habilitado.");
    const accion = elegirAccionOnline(vistaParaPolitica(mano.estado, asiento));
    if (!accion) throw new Error("La computadora no encontró jugada.");
    // El ensayo privado comprueba la transmisión de gestos desde un actor de prueba.
    const sena = hasSignals(formato) && ensayo ? signals[mano.turnos.length % signals.length] : undefined;
    const propuesta = identificador(sena ? {...accion, sena} : accion);
    mano = confirmarComputadora(mano, formato, asiento, propuesta);
    alConfirmar?.(mano, propuesta);
  }
  return mano;
}
