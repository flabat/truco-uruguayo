import { esCardId } from "../src/motor/cartas.ts";
import { aDecidir, elegirAccionOnline, iniciarOnline, versionReglasOnline, vistaOnline,
  type AccionOnline, type EstadoOnline, type RepartoOnline } from "../src/motor/mesa-online.ts";
import type { Asiento } from "../src/motor/reparto.ts";
import { signals, versions, type ActionId, type Format, type PublicTurn, type Signal } from "../training/contracts/index.ts";
import { commitTurn } from "../training/signals/index.ts";
import { ErrorPeticion } from "./http.ts";

export type Confirmada = AccionOnline & { sena?: Signal };
export interface ManoPublicable { estado: EstadoOnline; turnos: PublicTurn[] }
export interface Registro {
  numero: number; version: number; version_reglas: number; version_senas: string | null;
  reparto: RepartoOnline; puntos_inicio: [number, number]; acciones: Confirmada[];
}

function identificador(accion: Confirmada): ActionId {
  const base = accion.tipo === "carta" ? accion.carta : accion.tipo;
  return accion.sena === undefined ? base : `${accion.sena}/${base}`;
}

export function leerAccion(datos: unknown, asiento: Asiento, formato: Format): Confirmada {
  if (!datos || typeof datos !== "object" || Array.isArray(datos) || !("tipo" in datos) || typeof datos.tipo !== "string") {
    throw new ErrorPeticion(400, "Falta la acción de juego.");
  }
  const claves = datos.tipo === "carta" ? ["tipo", "carta"] : ["tipo"];
  if ("sena" in datos) {
    if (formato !== "pairs-senas" || !signals.includes(datos.sena as Signal)) throw new ErrorPeticion(400, "Seña no permitida.");
    claves.push("sena");
  }
  if (Object.keys(datos).length !== claves.length || !claves.every(k => Object.hasOwn(datos, k))
    || (datos.tipo === "carta" && !("carta" in datos && esCardId(datos.carta)))
    || esCardId(datos.tipo) || datos.tipo.includes("/")) {
    throw new ErrorPeticion(400, "La acción requiere un canto o una carta y una seña opcional.");
  }
  return { ...datos, asiento } as Confirmada;
}

export function confirmar(mano: ManoPublicable, formato: Format, accion: Confirmada): ManoPublicable {
  const {state, turn} = commitTurn(mano.estado, accion.asiento, formato, identificador(accion));
  return {estado: state, turnos: [...mano.turnos, turn]};
}

export function guardarAcciones(mano: ManoPublicable): Confirmada[] {
  return mano.turnos.map(t => t.signal ? {...t.action, sena: t.signal} : t.action);
}

export function restaurar(fila: Registro, formato: Format, meta?: number): ManoPublicable {
  if (fila.version_reglas !== versionReglasOnline || fila.version_senas !== (formato === "pairs-senas" ? versions.signals : null)) {
    throw new Error("Versión de reglas desconocida.");
  }
  const inicial: ManoPublicable = {estado: iniciarOnline(fila.reparto, fila.puntos_inicio, meta), turnos: []};
  return fila.acciones.reduce((mano, accion) => confirmar(mano, formato, accion), inicial);
}

export function jugarComputadoras(mano: ManoPublicable, formato: Format, humanos: readonly number[], ensayo = false) {
  while (!mano.estado.resultado) {
    const posibles = aDecidir(mano.estado);
    if (posibles.some(s => humanos.includes(s))) break;
    const asiento = posibles[0];
    if (asiento === undefined) throw new Error("Falta un asiento habilitado.");
    const accion = elegirAccionOnline(vistaOnline(mano.estado, asiento));
    if (!accion) throw new Error("La computadora no encontró jugada.");
    // El ensayo privado comprueba la transmisión de gestos desde un actor de prueba.
    const sena = formato === "pairs-senas" && ensayo ? signals[mano.turnos.length % signals.length] : undefined;
    mano = confirmar(mano, formato, sena ? {...accion, sena} : accion);
  }
  return mano;
}
