import type {Pool, PoolClient} from "pg";
import { aDecidir } from "../src/motor/mesa-online.ts";
import type { Asiento } from "../src/motor/reparto.ts";
import { hasSignals, type Move, type SeatObservation } from "../training/contracts/index.ts";
import { observe } from "../training/seat/index.ts";
import { commitTurn, signalRules } from "../training/signals/index.ts";
import { formatoMesa } from "./mesas.ts";
import type { ServingDecision } from "./serving.ts";
import { guardarAcciones, restaurar, turnosDeEquipo, type ManoPublicable, type Registro } from "./turnos.ts";

function actor(mano: ManoPublicable, humanos: readonly number[]) {
  const posibles = aDecidir(mano.estado);
  return posibles.some(s => humanos.includes(s)) ? undefined : posibles[0];
}

export async function programarTurno(db: PoolClient, mesa: string, mano: ManoPublicable, humanos: readonly number[]) {
  if (actor(mano, humanos) === undefined) await db.query("DELETE FROM juego.turnos_bot WHERE mesa=$1", [mesa]);
  else await db.query("INSERT INTO juego.turnos_bot VALUES ($1) ON CONFLICT DO NOTHING", [mesa]);
}

type Fila = Registro & {mesa: string; politica: string; modo: "1v1" | "2v2"; humanos: Asiento[]};
async function snapshot(db: Pool | PoolClient, id?: string) {
  return (await db.query<Fila>(`SELECT h.*, m.politica, m.modo,
    ARRAY(SELECT a.asiento FROM juego.asientos a WHERE a.mesa=m.id AND NOT a.computadora) AS humanos
    FROM juego.turnos_bot t JOIN juego.mesas m ON m.id=t.mesa
    JOIN LATERAL (SELECT * FROM juego.manos WHERE mesa=m.id ORDER BY numero DESC LIMIT 1) h ON true
    WHERE ($1::uuid IS NULL OR t.mesa=$1) ORDER BY t.mesa LIMIT 1`, [id ?? null])).rows[0];
}

interface Inferencia { decide(pin: string, obs: SeatObservation): Promise<ServingDecision> }

/** Inferencia desde una sola lectura sin bloqueo. El único escritor revalida el turno después. */
export async function resolverTurno(pool: Pool, servicio: Inferencia, notificar: (id: string) => void, id?: string) {
  const fila = await snapshot(pool, id);
  if (!fila) return false;
  const formato = formatoMesa(fila.modo, fila.version_senas);
  const mano = restaurar(fila, formato);
  const seat = actor(mano, fila.humanos);
  if (seat === undefined) return false;
  const historial = formato === "pairs-senas" ? turnosDeEquipo(mano.turnos, seat) : mano.turnos;
  const observacion = observe(mano.estado, seat, formato, historial);
  const decision = await servicio.decide(fila.politica, hasSignals(formato)
    ? {...observacion, legalActions: signalRules.legalActions(observacion.legalActions as Move[])} : observacion);

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    // Tomar el mismo lock que HTTP antes de leer. Bajo READ COMMITTED esta segunda
    // sentencia ve las jugadas confirmadas mientras esperábamos el lock.
    await db.query("SELECT id FROM juego.mesas WHERE id=$1 FOR UPDATE", [fila.mesa]);
    const actual = await snapshot(db, fila.mesa);
    if (!actual || actual.numero !== fila.numero || actual.version !== fila.version || actual.politica !== fila.politica
      || actor(mano, actual.humanos) !== seat) {
      await db.query("ROLLBACK");
      return false;
    }
    const paso = commitTurn(mano.estado, seat, formato, decision.action);
    const nueva = {estado: paso.state, turnos: [...mano.turnos, paso.turn]};
    await db.query("UPDATE juego.manos SET acciones=$3, version=version+1 WHERE mesa=$1 AND numero=$2",
      [fila.mesa, fila.numero, JSON.stringify(guardarAcciones(nueva))]);
    await db.query(`INSERT INTO juego.inferencias (mesa,mano,version_anterior,asiento,solicitada,aplicada,fallback,latencia_ms)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [fila.mesa,fila.numero,fila.version,seat,fila.politica,
        decision.policy,decision.fallback,decision.latencyMs]);
    await programarTurno(db, fila.mesa, nueva, actual.humanos);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally { db.release(); }
  notificar(fila.mesa);
  return true;
}
