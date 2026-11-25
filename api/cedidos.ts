import type { Pool, PoolClient } from "pg";

/** Asientos humanos que juega una computadora porque su jugador dejó el juego. */
export async function cedidosDe(db: Pool | PoolClient, mesa: string): Promise<number[]> {
  const { rows } = await db.query<{ asiento: number }>("SELECT asiento FROM juego.asientos WHERE mesa=$1 AND cedido", [mesa]);
  return rows.map(fila => fila.asiento);
}

/** De los asientos humanos de las reglas, los que esperan a una persona. */
export async function esperanDe(db: Pool | PoolClient, mesa: string, humanos: readonly number[]): Promise<number[]> {
  const cedidos = await cedidosDe(db, mesa);
  return humanos.filter(asiento => !cedidos.includes(asiento));
}
