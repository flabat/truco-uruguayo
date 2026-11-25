import { countPublicHand, type PublicMove } from "../training/contracts/duel-memory.ts";
import type {Pool, PoolClient} from "pg";
import { aDecidir, vistaOnline, vistaParaPolitica, vistaTercetos } from "@eltruco/motor/mesa-online.ts";
import type { Asiento } from "@eltruco/motor/reparto.ts";
import type { DecisionBotV1 } from "./replay-chico.ts";
import { hasSignals, versions, type Move, type SeatObservation } from "../training/contracts/index.ts";
import { observe } from "../training/seat/index.ts";
import { signalRules } from "../training/signals/index.ts";
import { accionesPie, observacionPie, politicaPie } from "@eltruco/motor/bot-pie.ts";
import { elegirAccionPoliticaPie } from "@eltruco/motor/modelo-pie.ts";
import { versionSenasPie, vistaDelPie } from "@eltruco/motor/senas-pie.ts";
import { confirmarJugadaPieDB, esperaDelPie } from "./partidas-pie.ts";
import { elegirAccionTercetos } from "@eltruco/motor/bot-tercetos.ts";
import { asientoBotTercetos, confirmarTurnoTercetosDB, restaurarTercetosDB, type RegistroTercetos } from "./partidas-tercetos.ts";
import { formatoMesa, politicaTercetos } from "./mesas.ts";
import type { ServingDecision } from "./serving.ts";
import { confirmarComputadora, guardarAcciones, prepararTurno, restaurar, turnosDeEquipo, type ManoPublicable, type Registro } from "./turnos.ts";
import { decisionReplay, guardarDecisionesReplayDB } from "./replay-db.ts";

function actor(mano: ManoPublicable, humanos: readonly number[]) {
  const posibles = aDecidir(mano.estado);
  return posibles.some(s => humanos.includes(s)) ? undefined : posibles[0];
}

export async function programarTurno(db: PoolClient, mesa: string, mano: ManoPublicable, humanos: readonly number[]) {
  if (actor(mano, humanos) === undefined) await db.query("DELETE FROM juego.turnos_bot WHERE mesa=$1", [mesa]);
  else await db.query("INSERT INTO juego.turnos_bot (mesa) VALUES ($1) ON CONFLICT DO NOTHING", [mesa]);
}

type Snapshot = {anteriores?: PublicMove[][]; mesa: string; politica: string; meta: number; humanos: Asiento[]};
type Fila = Snapshot & ((Registro & {modo: "1v1" | "2v2"}) | (RegistroTercetos & {modo: "3v3"}));
async function snapshot(db: Pool | PoolClient, id?: string, exhibicion = false) {
  return (await db.query<Fila>(`SELECT h.*, m.politica, m.modo, m.meta,
    CASE WHEN m.modo='1v1' AND EXISTS (SELECT 1 FROM juego.artefactos a
      WHERE a.pin=m.politica AND a.contenido->>'memory'='opponent')
    THEN ARRAY(SELECT anterior.acciones FROM juego.manos anterior
      WHERE anterior.mesa=m.id AND anterior.numero<h.numero ORDER BY anterior.numero) END AS anteriores,
    ARRAY(SELECT a.asiento FROM juego.asientos a WHERE a.mesa=m.id AND NOT a.computadora) AS humanos
    FROM juego.turnos_bot t JOIN juego.mesas m ON m.id=t.mesa
    JOIN LATERAL (SELECT * FROM juego.manos WHERE mesa=m.id ORDER BY numero DESC LIMIT 1) h ON true
    WHERE t.disponible_desde <= statement_timestamp() AND (m.cupo_exhibicion IS NOT NULL) = $2 AND ($1::uuid IS NULL OR t.mesa=$1) ORDER BY t.mesa LIMIT 1`, [id ?? null, exhibicion])).rows[0];
}

export interface Inferencia { decide(pin: string, obs: SeatObservation): Promise<ServingDecision> }

async function decidirTurno(fila: Fila, servicio: Inferencia) {
  if (fila.version_senas === versionSenasPie) {
    if (fila.modo !== "2v2" && fila.politica !== politicaPie) throw new Error("La mesa requiere la política clásica al pie.");
    const indicaciones = fila.indicaciones ?? [];
    const mano: ManoPublicable = fila.modo === "3v3"
      ? { estado: restaurarTercetosDB(fila), turnos: [], indicaciones, pasesPie: fila.pases_pie }
      : restaurar(fila, "pairs-private-senas", fila.meta, fila.humanos);
    mano.politicaPie = fila.politica;
    const asiento = actor(mano, fila.humanos);
    if (asiento === undefined) return null;
    const inicio = performance.now();
    // Un bot activo ve sus cartas y recibe exactamente las mismas señas y palabras que ese asiento humano.
    const vista = vistaOnline(mano.estado, asiento);
    const accion = elegirAccionPoliticaPie(fila.politica, vista, vistaDelPie(mano.estado, asiento, indicaciones), indicaciones);
    if (!accion) throw new Error("La computadora al pie no encontró una acción legal.");
    const bot: DecisionBotV1 = { solicitada: fila.politica, aplicada: fila.politica, observacion: observacionPie,
      acciones: accionesPie, latenciaMs: performance.now() - inicio };
    return { asiento, bot, espera: (humanos: Asiento[]) => esperaDelPie(mano, humanos, accion) !== undefined,
      actorActual: (humanos: Asiento[]) => actor(mano, humanos),
      aplicar: (db: PoolClient, humanos: Asiento[]) => confirmarJugadaPieDB(db, fila, mano, accion, humanos, bot) };
  }
  if (fila.modo === "3v3") {
    if (fila.politica !== politicaTercetos) throw new Error("Política de tercetos desconocida.");
    const estado = restaurarTercetosDB(fila);
    const asiento = asientoBotTercetos(estado, fila.humanos);
    if (asiento === undefined) return null;
    const inicio = performance.now();
    const accion = elegirAccionTercetos(vistaTercetos(estado, asiento));
    if (!accion) throw new Error("El asiento de computadora no encontró una acción legal.");
    const bot: DecisionBotV1 = { solicitada: fila.politica, aplicada: politicaTercetos, observacion: "vista-tercetos-v1",
      acciones: "acciones-tercetos-v1", latenciaMs: performance.now() - inicio };
    return {
      asiento, bot,
      actorActual: (humanos: Asiento[]) => asientoBotTercetos(estado, humanos),
      aplicar: (db: PoolClient, humanos: Asiento[]) => confirmarTurnoTercetosDB(db, fila, estado, accion, humanos, bot),
    };
  }
  const formato = formatoMesa(fila.modo, fila.version_senas);
  const mano = restaurar(fila, formato, fila.meta, fila.humanos);
  const asiento = actor(mano, fila.humanos);
  if (asiento === undefined) return null;
  const historial = formato === "pairs-senas" ? turnosDeEquipo(mano.turnos, asiento) : mano.turnos;
  const observacion = observe(mano.estado, asiento, formato, historial, vistaParaPolitica);
  if (formato==="duel" && fila.anteriores) {
    const counts = [Array(12).fill(0), Array(12).fill(0)];
    for(const hand of fila.anteriores) countPublicHand(counts,hand);
    Object.assign(observacion,{rivalCounts:counts[1-asiento]});
  }
  const decision = await servicio.decide(fila.politica, hasSignals(formato)
    ? {...observacion, legalActions: signalRules.legalActions(observacion.legalActions as Move[])} : observacion);
  const bot: DecisionBotV1 = { solicitada: fila.politica, aplicada: decision.policy, observacion: observacion.schema, acciones: versions.actions,
    latenciaMs: decision.latencyMs, ...(decision.fallback !== null && { fallback: decision.fallback }) };
  return {
    asiento, bot,
    actorActual: (humanos: Asiento[]) => actor(mano, humanos),
    async aplicar(db: PoolClient, humanos: Asiento[]) {
      const nueva = prepararTurno(confirmarComputadora(mano, formato, asiento, decision.action), humanos);
      await db.query("UPDATE juego.manos SET acciones=$3, version=version+1 WHERE mesa=$1 AND numero=$2",
        [fila.mesa, fila.numero, JSON.stringify(guardarAcciones(nueva))]);
      await guardarDecisionesReplayDB(db, fila.mesa, [decisionReplay(nueva, decision.action, bot)], fila.meta);
      await programarTurno(db, fila.mesa, nueva, humanos);
    },
  };
}

async function aplicarInferencia(db: PoolClient, fila: Fila, turno: NonNullable<Awaited<ReturnType<typeof decidirTurno>>>) {
  await turno.aplicar(db, fila.humanos);
  await db.query(`INSERT INTO juego.inferencias (mesa,mano,version_anterior,asiento,solicitada,aplicada,fallback,latencia_ms)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [fila.mesa,fila.numero,fila.version,turno.asiento,turno.bot.solicitada,
      turno.bot.aplicada,turno.bot.fallback ?? null,turno.bot.latenciaMs]);
}

/** El trabajador de exhibiciones ya bloqueó esta mesa sin asientos humanos. */
export async function jugarTurnoExhibicion(db: PoolClient, servicio: Inferencia, id: string) {
  const fila = await snapshot(db, id, true);
  if (!fila || fila.humanos.length) throw new Error("Se esperaba un turno pendiente entre computadoras.");
  const turno = await decidirTurno(fila, servicio);
  if (!turno) throw new Error("La exhibición perdió el turno pendiente.");
  await aplicarInferencia(db, fila, turno);
}

/** Inferencia desde una sola lectura sin bloqueo. El único escritor revalida el turno después. */
export async function resolverTurno(pool: Pool, servicio: Inferencia, notificar: (id: string) => void, id?: string) {
  const fila = await snapshot(pool, id);
  if (!fila) return false;
  const turno = await decidirTurno(fila, servicio);
  if (!turno) return false;
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    // Tomar el mismo lock que HTTP antes de leer. Bajo READ COMMITTED esta segunda
    // sentencia ve las jugadas confirmadas mientras esperábamos el lock.
    await db.query("SELECT id FROM juego.mesas WHERE id=$1 FOR UPDATE", [fila.mesa]);
    const actual = await snapshot(db, fila.mesa);
    if (!actual || actual.numero !== fila.numero || actual.version !== fila.version || actual.politica !== fila.politica
      || actual.indicaciones?.length !== fila.indicaciones?.length || actual.pases_pie?.length !== fila.pases_pie?.length
      || turno.actorActual(actual.humanos) !== turno.asiento) {
      await db.query("ROLLBACK");
      return false;
    }
    // Un trabajo creado antes de la espera explícita puede haber quedado programado con el plazo anterior.
    if (turno.espera?.(actual.humanos)) {
      await db.query("UPDATE juego.turnos_bot SET disponible_desde='infinity' WHERE mesa=$1", [fila.mesa]);
    } else {
      await aplicarInferencia(db, actual, turno);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally { db.release(); }
  notificar(fila.mesa);
  return true;
}
