import type { PoolClient } from "pg";
import {
  aDecidir, aplicarOnline, iniciarOnline, marcadorOnline, versionReglasTercetos, vistaTercetos,
  type AccionOnline, type EstadoOnline, type RepartoOnline,
} from "../src/motor/mesa-online.ts";
import type { Asiento } from "../src/motor/reparto.ts";
import type { DecisionBotV1 } from "../src/motor/replay-chico.ts";
import { ErrorPeticion } from "./http.ts";
import { decisionTercetos, guardarDecisionesReplayDB } from "./replay-db.ts";
import type { Registro } from "./turnos.ts";

import type { TipoLance } from "../src/motor/reglas-tercetos.ts";
export type RegistroTercetos = Omit<Registro, "acciones"> & {
  mesa: string;
  meta_tercetos: number | null;
  tipo_reparto: TipoLance | null;
  acciones: (AccionOnline & { duelo?: number | null })[];
};

export function restaurarTercetosDB(fila: RegistroTercetos): EstadoOnline {
  if (fila.version_reglas !== versionReglasTercetos || fila.version_senas !== null
      || fila.reparto.versionReparto !== "online-2" || fila.meta_tercetos === null) {
    throw new ErrorPeticion(503, "Esta mesa requiere otra versión del árbitro de tercetos.");
  }
  let estado = iniciarOnline(fila.reparto, fila.puntos_inicio, fila.meta_tercetos, fila.numero);
  if (estado.lance?.tipo !== fila.tipo_reparto) throw new Error("El tipo de reparto registrado no coincide.");
  for (const {duelo, ...accion} of fila.acciones) {
    if (duelo !== estado.lance!.duelo) throw new Error("El comando registrado corresponde a otro duelo.");
    const paso = aplicarOnline(estado, accion);
    if (!paso.ok) throw new Error("Acción inválida en la bitácora del reparto.");
    estado = paso.estado;
  }
  return estado;
}

export function asientoBotTercetos(estado: EstadoOnline, humanos: readonly number[]) {
  const habilitados = aDecidir(estado);
  if (habilitados.some(asiento => humanos.includes(asiento))) return undefined;
  return habilitados[0];
}

/** Compartida por el escritor humano y el de computadora, dentro del mismo bloqueo de mesa. */
export async function registrarPendienteTercetos(db: PoolClient, mesa: string, estado: EstadoOnline, humanos: readonly number[]) {
  if (asientoBotTercetos(estado, humanos) === undefined) {
    await db.query("DELETE FROM juego.turnos_bot WHERE mesa=$1", [mesa]);
  } else {
    await db.query("INSERT INTO juego.turnos_bot (mesa) VALUES ($1) ON CONFLICT DO NOTHING", [mesa]);
  }
}

export async function confirmarTurnoTercetosDB(db: PoolClient, fila: RegistroTercetos, estado: EstadoOnline,
    accion: AccionOnline, humanos: readonly number[], bot?: DecisionBotV1) {
  const paso = aplicarOnline(estado, accion);
  if (!paso.ok) throw new ErrorPeticion(409, "La acción no está permitida en este turno.");
  const entrada = { ...accion, duelo: estado.lance!.duelo };
  const actualizado = await db.query(`UPDATE juego.manos SET acciones = acciones || $4::jsonb, version = version + 1
    WHERE mesa=$1 AND numero=$2 AND version=$3`, [fila.mesa, fila.numero, fila.version, JSON.stringify([entrada])]);
  if (actualizado.rowCount !== 1) throw new ErrorPeticion(409, "La mesa cambió. Actualizá la partida.");
  const decision = decisionTercetos(estado, paso.estado, accion);
  await guardarDecisionesReplayDB(db, fila.mesa, [{ ...decision, ...(bot && { bot }) }], estado.meta);
  await registrarPendienteTercetos(db, fila.mesa, paso.estado, humanos);
  return paso.estado;
}

export async function repartirTercetosDB(db: PoolClient, mesa: string, numero: number, version: number,
    puntos: [number, number], meta: number, humanos: readonly number[], reparto: RepartoOnline) {
  const estado = iniciarOnline(reparto, puntos, meta, numero);
  await db.query(`INSERT INTO juego.manos
    (mesa, numero, version, version_reglas, reparto, puntos_inicio, acciones, meta_tercetos, tipo_reparto)
    VALUES ($1,$2,$3,$4,$5,$6,'[]',$7,$8)`, [mesa, numero, version, versionReglasTercetos,
    reparto, puntos, meta, estado.lance!.tipo]);
  await registrarPendienteTercetos(db, mesa, estado, humanos);
  return estado;
}

export function proyectarTercetos(estado: EstadoOnline, numero: number, version: number, asiento: Asiento) {
  const puntos = marcadorOnline(estado);
  const ganadorPartida = puntos[0] >= estado.meta ? 0 : puntos[1] >= estado.meta ? 1 : null;
  return { formato: "triples", version, manoNumero: numero, meta: estado.meta, puntos, ganadorPartida, lance: estado.lance, historialLances: estado.historialLances,
    vista: vistaTercetos(estado, asiento) };
}
