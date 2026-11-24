import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import type { PoolClient } from "pg";
import { marcadorOnline, type AccionOnline, type EstadoOnline } from "@eltruco/motor/mesa-online.ts";
import { cobrosDeDecision } from "./replay-chico-online.ts";
import type { DecisionBotV1, EventoChicoV1, ReplayChicoPie, ReplayChicoV1 } from "./replay-chico.ts";
import { versionSenasPie, type IndicacionPie } from "@eltruco/motor/senas-pie.ts";
import { versions, type ActionId } from "../training/contracts/index.ts";
import { incumbent } from "../training/seat/index.ts";
import type { FormatoMesa } from "./mesas.ts";
import { identificador, type ManoPublicable } from "./turnos.ts";

export type DecisionReplay = Omit<Extract<EventoChicoV1, { tipo: "decision" }>, "secuencia">;

// Calculada una vez sobre los módulos instalados. También funciona en la imagen de la API sin .git.
const motor = new URL("../paquetes/motor/src/", import.meta.url);
const hash = createHash("sha256");
for (const ruta of [
  ...readdirSync(motor).filter(n => n.endsWith(".ts")).sort().map(n => "../paquetes/motor/src/" + n),
  "./replay-chico.ts", "./replay-chico-online.ts", "./turnos.ts", "../training/contracts/index.ts", "../training/seat/index.ts", "../training/signals/index.ts",
]) hash.update(ruta).update("\0").update(readFileSync(new URL(ruta, import.meta.url))).update("\0");
const build = "sha256:" + hash.digest("hex");

export function decisionReplay(mano: ManoPublicable, propuesta?: ActionId, bot?: DecisionBotV1): DecisionReplay {
  const turno = mano.turnos.at(-1);
  if (!turno) throw new Error("Falta el turno confirmado para el replay.");
  const accion = turno.signal ? { ...turno.action, sena: turno.signal } : turno.action;
  const decision: DecisionReplay = { tipo: "decision", accion, cobros: turno.awards, puntos: marcadorOnline(mano.estado) };
  if (propuesta !== undefined) {
    const politica = bot ?? { solicitada: incumbent.id, aplicada: incumbent.id, observacion: "vista-para-politica-v1", acciones: versions.actions };
    decision.bot = propuesta === identificador(accion) ? politica : { ...politica, propuesta };
  }
  return decision;
}

export function decisionTercetos(antes: EstadoOnline, despues: EstadoOnline, accion: AccionOnline): DecisionReplay {
  if (!antes.lance) throw new Error("Falta el lance del turno de tercetos.");
  return { tipo: "decision", accion, duelo: antes.lance.duelo, cobros: cobrosDeDecision(antes, despues), puntos: marcadorOnline(despues) };
}

/** Los escritores ya tienen el lock de la mesa. Los índices salen de las acciones confirmadas
 * en juego.manos, independientemente de la cantidad de pedidos HTTP, reintentos o turnos de bot. */
async function posicionActual(db: PoolClient, mesa: string) {
  const { rows: [fila] } = await db.query<{ mano: number; decisiones: number; palabras: number; inicio: string }>(`
    SELECT h.numero AS mano, jsonb_array_length(h.acciones) AS decisiones,
      (SELECT count(*)::integer FROM juego.eventos_chico i WHERE i.mesa=h.mesa AND i.mano=h.numero AND i.posicion IS NULL) AS palabras,
      COALESCE(e.secuencia, (SELECT 1 + COALESCE(sum(1 + jsonb_array_length(p.acciones) + jsonb_array_length(p.indicaciones)), 0)
        FROM juego.manos p WHERE p.mesa=h.mesa AND p.numero<h.numero)) AS inicio
    FROM juego.manos h
    LEFT JOIN juego.eventos_chico e ON e.mesa=h.mesa AND e.mano=h.numero AND e.posicion=0
    WHERE h.mesa=$1 ORDER BY h.numero DESC LIMIT 1`, [mesa]);
  if (!fila) throw new Error("Falta la mano persistida para el replay.");
  return { ...fila, inicio: Number(fila.inicio) };
}

/** Llamar al repartir con la misma conexión y transacción que inserta juego.manos. */
export async function iniciarReplayDB(db: PoolClient, mesa: string, formato: FormatoMesa, humanos: readonly number[],
    estado: EstadoOnline, numero: number) {
  const reparto = estado.mano.reparto;
  if (numero === 1 && formato !== "pairs-senas") {
    const { rows: [datos] } = await db.query<{ id: string; politica: string; version_senas: string | null; inicio: Date }>(
      "SELECT id, politica, version_senas, clock_timestamp() AS inicio FROM juego.mesas WHERE id=$1", [mesa]);
    const cabecera: Omit<ReplayChicoV1, "eventos"> | Omit<ReplayChicoPie, "eventos"> = {
      ...(datos.version_senas === versionSenasPie ? { version: "chico-v2", versionSenas: versionSenasPie } as const : { version: "chico-v1" } as const),
      id: datos.id, origen: "mesa", inicio: datos.inicio.toISOString(), meta: estado.meta,
      variante: formato === "triples" ? "tercetos" : formato === "duel" ? "duelo" : "parejas",
      perfil: formato === "triples" ? "tercetos-v1" : formato,
      motor: { version: reparto.versionReparto, build },
      asientos: reparto.manos.map((_, i) => humanos.includes(i) ? { tipo: "humano" } : { tipo: "computadora", politica: datos.politica }),
    };
    await db.query("INSERT INTO juego.replays_chico(mesa,cabecera) VALUES ($1,$2)", [mesa, cabecera]);
  }
  const { inicio, mano } = await posicionActual(db, mesa);
  if (mano !== numero) throw new Error("El reparto no corresponde a la mano vigente.");
  const evento = { tipo: "reparto", manoNumero: numero, puntosInicio: estado.puntosInicio, reparto };
  await db.query("INSERT INTO juego.eventos_chico(mesa,mano,posicion,secuencia,evento,build) VALUES ($1,$2,0,$3,$4,$5)",
    [mesa, numero, inicio, evento, build]);
}

/** Un lote incluye las decisiones automáticas disparadas por el comando. Un cierre pertenece a esa misma escritura. */
export async function guardarDecisionesReplayDB(db: PoolClient, mesa: string, decisiones: readonly DecisionReplay[], meta: number) {
  if (!decisiones.length) return;
  const { mano, inicio, palabras, decisiones: cantidad } = await posicionActual(db, mesa);
  const anterior = cantidad - decisiones.length;
  if (anterior < 0) throw new Error("El bloque de decisiones excede las acciones confirmadas de la mano.");
  const puntos = decisiones[decisiones.length - 1].puntos;
  const ganador = puntos.indexOf(meta);
  const eventos = ganador < 0 ? decisiones : [...decisiones, { tipo: "cierre", estado: "terminado", puntos, ganador }];
  await db.query(`INSERT INTO juego.eventos_chico(mesa, mano, posicion, secuencia, evento, build)
    SELECT $1, $2, $3::integer + i, $4::bigint + i, CASE WHEN dato->>'tipo'='cierre' THEN
      dato || jsonb_build_object('fecha', to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      ELSE dato END, $6
    FROM jsonb_array_elements($5::jsonb) WITH ORDINALITY AS lote(dato, i)`,
    [mesa, mano, anterior, inicio + anterior + palabras, JSON.stringify(eventos), build]);
}

/** Las palabras tienen secuencia de replay pero jamás ocupan una posición de carta/canto. */
export async function guardarIndicacionReplayDB(db: PoolClient, mesa: string, indicacion: IndicacionPie) {
  const { mano, inicio, palabras, decisiones } = await posicionActual(db, mesa);
  if (indicacion.indiceAccion !== decisiones) throw new Error("El consejo no corresponde a la última jugada confirmada.");
  await db.query("INSERT INTO juego.eventos_chico(mesa,mano,posicion,secuencia,evento,build) VALUES ($1,$2,NULL,$3,$4,$5)",
    [mesa, mano, inicio + decisiones + palabras + 1, { tipo: "indicacion", indicacion }, build]);
}
