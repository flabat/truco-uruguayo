import type { Pool, PoolClient } from "pg";
import { jugarTurnoExhibicion, type Inferencia } from "./bot-pendiente.ts";
import { insertarMesaComputadoras, servicioComputadoras } from "./ensayos.ts";
import { avanzarManoComputadoras, type MesaComputadoras } from "./partidas.ts";

const objetivoNormal = 6;
const objetivoMaximo = 10;

export function configuracionExhibiciones(env: NodeJS.ProcessEnv) {
  const texto = env.EXHIBICIONES_OBJETIVO || String(objetivoNormal);
  const pausa = env.EXHIBICIONES_PAUSADAS || "0";
  const objetivo = Number(texto);
  if (!/^\d+$/.test(texto) || objetivo > objetivoMaximo || !["0", "1"].includes(pausa)) {
    console.error("Exhibiciones en pausa: EXHIBICIONES_OBJETIVO admite enteros de 0 a 10 y EXHIBICIONES_PAUSADAS admite 0 o 1.");
    return { objetivo: 0, pausadas: true };
  }
  return { objetivo: env.EXHIBICIONES_HABILITADAS === "1" ? objetivo : 0, pausadas: pausa === "1" };
}

// Una sola tarea de exhibición entre todas las instancias. Los turnos humanos
// usan otro trabajador y nunca esperan este bloqueo. La caída del proceso lo libera.
async function conTurnoDeSalon<T>(pool: Pool, ejecutar: (db: PoolClient) => Promise<T>) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows: [turno] } = await db.query("SELECT pg_try_advisory_xact_lock(hashtext('juego.exhibiciones')) AS libre");
    const resultado = turno.libre ? await ejecutar(db) : null;
    await db.query("COMMIT");
    return resultado;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally { db.release(); }
}

export async function reponerExhibiciones(pool: Pool, reloj?: Date, objetivo = objetivoNormal) {
  if (objetivo === 0) return 0;
  if (!Number.isInteger(objetivo) || objetivo < 0 || objetivo > objetivoMaximo) throw new RangeError("Objetivo de exhibiciones fuera de rango.");
  return conTurnoDeSalon(pool, async db => {
    const { rows: [cuenta] } = await db.query(`SELECT
      count(*) FILTER (WHERE modo='1v1')::int AS duelos,
      count(*) FILTER (WHERE modo='2v2')::int AS parejas
      FROM (SELECT modo FROM juego.mesas_en_juego WHERE origen='humana'
        UNION ALL SELECT modo FROM juego.mesas WHERE cupo_exhibicion IS NOT NULL
          AND fin_publico IS NULL AND NOT exhibicion_retirada) mesas`);
    const faltan = objetivo - cuenta.duelos - cuenta.parejas;
    if (faltan <= 0) return 0;
    const { rows: cupos } = await db.query(`SELECT numero FROM juego.cupos_exhibicion c
      WHERE disponible_desde <= coalesce($1, clock_timestamp()) AND NOT EXISTS
        (SELECT 1 FROM juego.mesas WHERE cupo_exhibicion=c.numero AND fin_publico IS NULL AND NOT exhibicion_retirada)
      ORDER BY numero LIMIT $2 FOR UPDATE`, [reloj, faltan]);
    if (!cupos.length) return 0;
    const { rows: [creador] } = await db.query(`INSERT INTO juego.jugadores(emisor,sujeto,nombre)
      VALUES ('urn:truco:exhibiciones','servidor','Exhibiciones')
      ON CONFLICT (emisor,sujeto) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id`);
    for (const { numero } of cupos) {
      const duelo = cuenta.duelos < cuenta.parejas || (cuenta.duelos === cuenta.parejas && numero % 2 === 1);
      const formato = duelo ? "duel" : "pairs-private-senas";
      const id = await insertarMesaComputadoras(db, formato, creador.id, undefined, numero);
      await db.query(`UPDATE juego.mesas SET proximo_paso=coalesce($2, clock_timestamp())
        + (cupo_exhibicion-1) * interval '500 milliseconds' WHERE id=$1`, [id, reloj]);
      if (duelo) cuenta.duelos++;
      else cuenta.parejas++;
    }
    return cupos.length;
  });
}

export async function avanzarExhibicion(pool: Pool, servicio: Inferencia, reloj?: Date) {
  return conTurnoDeSalon(pool, async db => {
    const { rows: [mesa] } = await db.query<MesaComputadoras & { pendiente: boolean; cupo_exhibicion: number; fallos_exhibicion: number }>(`
      SELECT id, modo, meta, politica, version_senas, perfil_tercetos, cupo_exhibicion, fallos_exhibicion,
        EXISTS(SELECT 1 FROM juego.turnos_bot WHERE mesa=m.id) AS pendiente
      FROM juego.mesas m WHERE cupo_exhibicion IS NOT NULL AND fin_publico IS NULL AND NOT exhibicion_retirada
        AND proximo_paso <= coalesce($1, clock_timestamp())
        AND NOT EXISTS (SELECT 1 FROM juego.turnos_bot t JOIN juego.mesas h ON t.mesa=h.id
          WHERE h.origen='humana' AND t.disponible_desde <= coalesce($1, statement_timestamp()))
      ORDER BY proximo_paso, cupo_exhibicion LIMIT 1 FOR UPDATE OF m SKIP LOCKED`, [reloj]);
    if (!mesa) return null;
    await db.query("SAVEPOINT paso");
    try {
      if (mesa.pendiente) await jugarTurnoExhibicion(db, servicio, mesa.id);
      else await avanzarManoComputadoras(db, mesa);
      await db.query(`UPDATE juego.mesas SET fallos_exhibicion=0, proximo_paso=coalesce($2, clock_timestamp())
        + CASE WHEN EXISTS (SELECT 1 FROM juego.turnos_bot WHERE mesa=$1) THEN interval '4 seconds'
            ELSE interval '8 seconds' END WHERE id=$1`, [mesa.id, reloj]);
    } catch (error) {
      await db.query("ROLLBACK TO SAVEPOINT paso");
      const fallos = mesa.fallos_exhibicion + 1;
      await db.query(`UPDATE juego.mesas SET fallos_exhibicion=$2, exhibicion_retirada=($2::int >= 3),
        proximo_paso=coalesce($3, clock_timestamp()) + $4 * interval '1 second' WHERE id=$1`,
        [mesa.id, fallos, reloj, 8 * 2 ** (fallos - 1)]);
      if (fallos >= 3) {
        await db.query("DELETE FROM juego.turnos_bot WHERE mesa=$1", [mesa.id]);
        await db.query(`UPDATE juego.cupos_exhibicion SET disponible_desde=coalesce($2,clock_timestamp())
          + interval '5 minutes' WHERE numero=$1`, [mesa.cupo_exhibicion, reloj]);
      }
      console.error("No se pudo avanzar la exhibición", mesa.id, fallos, error instanceof Error ? error.name : "error");
    }
    return mesa.id;
  });
}

export function procesarExhibiciones(pool: Pool, { objetivo, pausadas }: ReturnType<typeof configuracionExhibiciones>,
    alCambiar: (id: string) => void) {
  // Una pausa conserva las manos, su próximo paso y el turno pendiente en PostgreSQL.
  if (pausadas) return () => {};
  const servicio = servicioComputadoras(pool);
  let siguienteRevision = 0;
  let cerrado = false;
  let timer: ReturnType<typeof setTimeout>;
  async function ronda() {
    try {
      if (objetivo > 0 && Date.now() >= siguienteRevision) {
        siguienteRevision = Date.now() + 15_000;
        await reponerExhibiciones(pool, undefined, objetivo);
      }
      if (cerrado) return;
      const id = await avanzarExhibicion(pool, servicio);
      if (id) alCambiar(id);
      else if (objetivo === 0 && !(await pool.query(`SELECT 1 FROM juego.mesas WHERE cupo_exhibicion IS NOT NULL
        AND fin_publico IS NULL AND NOT exhibicion_retirada LIMIT 1`)).rowCount) {
        await servicio.close();
        return;
      }
    } catch { console.error("No se pudo actualizar el salón de exhibiciones."); }
    if (!cerrado) timer = setTimeout(ronda, 250).unref();
  }
  timer = setTimeout(ronda, 0).unref();
  return () => { cerrado = true; clearTimeout(timer); void servicio.close(); };
}
