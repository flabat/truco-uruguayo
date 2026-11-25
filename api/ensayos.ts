import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { hasSignals, requireTrainingFormat, seatsFor, signalVersionFor } from "../training/contracts/index.ts";
import { politicaPie } from "@eltruco/motor/bot-pie.ts";
import { politicaPieParejas } from "@eltruco/motor/modelo-pie.ts";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import { metaPorModalidad } from "@eltruco/motor/chico.ts";
import { politicaTercetos, perfilTercetos, type FormatoMesa } from "./mesas.ts";
import { resolverTurno } from "./bot-pendiente.ts";
import { createServing, exampleSignalPin } from "./serving.ts";
import { incumbent } from "../training/seat/index.ts";
import { avanzarEnsayo } from "./partidas.ts";

export async function insertarMesaComputadoras(db: PoolClient, formato: FormatoMesa, creador: string, pin?: string, cupo: number | null = null) {
  const tercetos = formato === "triples";
  const alPie = pin === politicaPie || pin === politicaPieParejas;
  if (alPie && (formato !== "pairs-private-senas" || cupo !== null)) {
    throw new RangeError("El ensayo de señas al pie requiere parejas privadas entre computadoras.");
  }
  if (tercetos && pin && pin !== politicaTercetos) throw new RangeError("El ensayo de tercetos requiere su política básica.");
  if (!tercetos) requireTrainingFormat(formato);
  const modo = tercetos ? "3v3" : formato === "duel" ? "1v1" : "2v2";
  const politica = tercetos ? politicaTercetos : pin ?? null;
  const {rows: [mesa]} = await db.query(`INSERT INTO juego.mesas (modo, creador, invitacion, version_senas, solo_computadoras, politica, meta, perfil_tercetos, cupo_exhibicion, publica)
    VALUES ($1, $2, $3, $4, true, COALESCE($5,(SELECT pin FROM juego.activaciones WHERE formato=$6),$7), $8, $9, $10::smallint, $10::smallint IS NOT NULL) RETURNING id`, [
    modo, creador, randomUUID(), alPie ? versionSenasPie : tercetos ? null : signalVersionFor(formato), politica, formato,
    cupo === null && !tercetos && hasSignals(formato) ? exampleSignalPin : incumbent.id, metaPorModalidad[modo], tercetos ? perfilTercetos : null, cupo]);
  await db.query(`INSERT INTO juego.asientos (mesa, asiento, computadora)
    SELECT $1, asiento, true FROM generate_series(0, $2::integer-1) AS asiento`, [mesa.id, tercetos ? 6 : seatsFor(formato)]);
  return mesa.id as string;
}

/** Solo para un operador con acceso a PostgreSQL; la ruta pública de creación siempre sienta a su creador. */
export async function crearEnsayo(pool: Pool, formato: FormatoMesa, creador: string, pin?: string) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const id = await insertarMesaComputadoras(db, formato, creador, pin);
    await db.query("COMMIT");
    return id;
  } catch (error) {
    await db.query("ROLLBACK"); throw error;
  } finally { db.release(); }
}

export function servicioComputadoras(pool: Pool) {
  return createServing({loadArtifact: async pin =>
    (await pool.query("SELECT contenido FROM juego.artefactos WHERE pin=$1", [pin])).rows[0]?.contenido});
}

export function procesarEnsayos(pool: Pool, alCambiar: (id: string) => void) {
  const servicio = servicioComputadoras(pool);
  let cerrado = false;
  let pendiente: ReturnType<typeof setTimeout>;
  async function ronda() {
    let huboTrabajo = false;
    try { huboTrabajo = await resolverTurno(pool, servicio, alCambiar) || await avanzarEnsayo(pool); }
    catch { console.error("No se pudo continuar el ensayo local de computadoras."); }
    if (!cerrado) pendiente = setTimeout(ronda, huboTrabajo ? 0 : 250).unref();
  }
  pendiente = setTimeout(ronda, 0).unref();
  return () => { cerrado = true; clearTimeout(pendiente); void servicio.close(); };
}
