import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { formats, seatsFor, versions, type Format } from "../training/contracts/index.ts";
import { avanzarEnsayo } from "./partidas.ts";

/** Solo para un operador con acceso a PostgreSQL; la ruta pública de creación siempre sienta a su creador. */
export async function crearEnsayo(pool: Pool, formato: Format, creador: string) {
  if (!formats.includes(formato)) throw new RangeError("Formato desconocido.");
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const {rows: [mesa]} = await db.query(`INSERT INTO juego.mesas (modo, creador, invitacion, version_senas, solo_computadoras)
      VALUES ($1, $2, $3, $4, true) RETURNING id`, [
      formato === "duel" ? "1v1" : "2v2", creador, randomUUID(), formato === "pairs-senas" ? versions.signals : null]);
    await db.query(`INSERT INTO juego.asientos (mesa, asiento, computadora)
      SELECT $1, asiento, true FROM generate_series(0, $2::integer-1) AS asiento`, [mesa.id, seatsFor(formato)]);
    await db.query("COMMIT");
    return mesa.id as string;
  } catch (error) {
    await db.query("ROLLBACK"); throw error;
  } finally { db.release(); }
}

export function procesarEnsayos(pool: Pool) {
  let cerrado = false;
  let pendiente: ReturnType<typeof setTimeout>;
  async function ronda() {
    let huboTrabajo = false;
    try { huboTrabajo = await avanzarEnsayo(pool); }
    catch { console.error("No se pudo continuar el ensayo local de computadoras."); }
    if (!cerrado) pendiente = setTimeout(ronda, huboTrabajo ? 25 : 1000).unref();
  }
  pendiente = setTimeout(ronda, 0).unref();
  return () => { cerrado = true; clearTimeout(pendiente); };
}
