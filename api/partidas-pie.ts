import type { PoolClient } from "pg";
import { elegirIndicacionesPie } from "@eltruco/motor/bot-pie.ts";
import { elegirAccionPoliticaPie } from "@eltruco/motor/modelo-pie.ts";
import { politicaParaAnticipar } from "./politica-pie.ts";
import { aplicarOnline, vistaOnline, type AccionOnline, type EstadoOnline } from "@eltruco/motor/mesa-online.ts";
import type { Asiento } from "@eltruco/motor/reparto.ts";
import type { DecisionBotV1 } from "./replay-chico.ts";
import { crearIndicacionPie, pieQueResponde, vistaDelPie, type IndicacionPie } from "@eltruco/motor/senas-pie.ts";
import { ErrorPeticion } from "./http.ts";
import { asientoBotTercetos, type RegistroTercetos } from "./partidas-tercetos.ts";
import { decisionReplay, decisionTercetos, guardarDecisionesReplayDB, guardarIndicacionReplayDB, type DecisionReplay } from "./replay-db.ts";
import { confirmar, identificador, type ManoPublicable } from "./turnos.ts";

/** El llamador ya tiene el bloqueo de mesa. La palabra y su replay quedan en la misma transacción. */
export async function guardarPalabraPie(db: PoolClient, mesa: string, numero: number, palabra: IndicacionPie) {
  await db.query("UPDATE juego.manos SET indicaciones = indicaciones || $3::jsonb WHERE mesa=$1 AND numero=$2",
    [mesa, numero, JSON.stringify([palabra])]);
  await guardarIndicacionReplayDB(db, mesa, palabra);
}

export function destinosAtendidos(mano: ManoPublicable) {
  return [...(mano.indicaciones ?? []), ...(mano.pasesPie ?? [])];
}

/** La computadora que decide ahora: su pie responde el envido aunque haya compañeros humanos. */
export function asientoBotPie(estado: EstadoOnline, humanos: readonly number[]) {
  return pieQueResponde(estado, humanos) ?? asientoBotTercetos(estado, humanos);
}

/** Sólo se espera cuando la siguiente decisión real del bot es una carta. Los cantos siguen su curso. */
export function esperaDelPie(mano: ManoPublicable, humanos: readonly number[], accion?: AccionOnline): Asiento | undefined {
  if (!mano.indicaciones || !humanos.length) return;
  const { estado, indicaciones } = mano;
  const asiento = asientoBotPie(estado, humanos);
  if (asiento === undefined) return;
  const companero = vistaDelPie(estado, asiento, indicaciones);
  if (!companero || companero.pie === asiento || !humanos.includes(companero.pie)) return;
  const pie = vistaDelPie(estado, companero.pie, destinosAtendidos(mano));
  if (!pie?.opciones.some(o => o.destinatario === asiento)) return;
  const jugada = accion ?? elegirAccionPoliticaPie(politicaParaAnticipar(mano.politicaPie), vistaOnline(estado, asiento), companero, indicaciones);
  return jugada?.tipo === "carta" ? asiento : undefined;
}

/** El pie humano cuya indicación espera la computadora antes de su carta; `undefined` si nadie espera. */
export function pieEsperado(mano: ManoPublicable, humanos: readonly number[]): Asiento | undefined {
  const asiento = esperaDelPie(mano, humanos);
  return asiento === undefined ? undefined : vistaDelPie(mano.estado, asiento, mano.indicaciones ?? [])?.pie;
}

export function vistaPiePrivada(mano: ManoPublicable, asiento: Asiento, humanos: readonly number[]) {
  const vista = vistaDelPie(mano.estado, asiento, destinosAtendidos(mano));
  if (vista?.pie === asiento) {
    const esperando = esperaDelPie(mano, humanos);
    if (vista.opciones.some(o => o.destinatario === esperando)) return { ...vista, esperando };
  }
  const responde = pieQueResponde(mano.estado, humanos);
  if (vista && responde !== undefined && responde !== asiento && vista.pie === responde) return { ...vista, responde };
  return vista;
}

/** El trabajo bloqueado persiste y no compite con otras mesas en la cola del trabajador. */
export async function programarBotPie(db: PoolClient, mesa: string, mano: ManoPublicable, esperan: readonly number[]) {
  if (asientoBotPie(mano.estado, esperan) === undefined) {
    await db.query("DELETE FROM juego.turnos_bot WHERE mesa=$1", [mesa]);
    return;
  }
  const disponible = esperaDelPie(mano, esperan) === undefined ? "-infinity" : "infinity";
  await db.query(`INSERT INTO juego.turnos_bot (mesa, disponible_desde) VALUES ($1, $2)
    ON CONFLICT (mesa) DO UPDATE SET disponible_desde=EXCLUDED.disponible_desde`, [mesa, disponible]);
}

/** Se llama al abrir el reparto o después de persistir exactamente una jugada y su replay. */
export async function continuarAlPie(db: PoolClient, mesa: string, numero: number, mano: ManoPublicable,
    esperan: readonly number[], palabras: readonly IndicacionPie[], anterior?: EstadoOnline): Promise<ManoPublicable> {
  const estado = mano.estado;
  const indicaciones = [...palabras];
  const abreVuelta = !anterior || anterior.mano.vueltas.length !== estado.mano.vueltas.length;
  if (abreVuelta && !estado.resultado && estado.lance?.tipo !== "pico-a-pico") {
    for (const asiento of estado.mano.reparto.manos.keys()) {
      const emisor = asiento as Asiento;
      if (esperan.includes(emisor)) continue;
      const pie = vistaDelPie(estado, emisor, indicaciones);
      if (pie?.pie !== emisor) continue;
      for (const propuesta of elegirIndicacionesPie(vistaOnline(estado, emisor), pie)) {
        const palabra = crearIndicacionPie(estado, emisor, propuesta.destinatario, propuesta.frase, pie.vuelta, indicaciones,
          propuesta.carta);
        if (!palabra) throw new Error("La computadora propuso una indicación fuera de su oportunidad.");
        await guardarPalabraPie(db, mesa, numero, palabra);
        indicaciones.push(palabra);
      }
    }
  }
  const actual = { ...mano, indicaciones };
  await programarBotPie(db, mesa, actual, esperan);
  return actual;
}

export async function confirmarJugadaPieDB(db: PoolClient, fila: Pick<RegistroTercetos, "mesa" | "numero" | "version">,
    mano: ManoPublicable, accion: AccionOnline, esperan: readonly number[], bot?: DecisionBotV1) {
  const pie = bot ? undefined : pieQueResponde(mano.estado, esperan);
  if (pie !== undefined && pie !== accion.asiento) throw new ErrorPeticion(409, "El envido lo responde tu pie.");
  let nueva: ManoPublicable;
  let decision: DecisionReplay;
  const lance = mano.estado.lance;
  if (lance) {
    const paso = aplicarOnline(mano.estado, accion);
    if (!paso.ok) throw new ErrorPeticion(409, "La acción no está permitida en este turno.");
    nueva = { estado: paso.estado, turnos: [] };
    decision = { ...decisionTercetos(mano.estado, paso.estado, accion), ...(bot && { bot }) };
  } else {
    try {
      nueva = confirmar(mano, "pairs-private-senas", accion);
    } catch (e) {
      if (!(e instanceof RangeError || e instanceof TypeError)) throw e;
      throw new ErrorPeticion(409, "La acción no está permitida en este turno.");
    }
    decision = decisionReplay(nueva, bot ? identificador(accion) : undefined, bot);
  }
  const entrada = lance ? { ...accion, duelo: lance.duelo } : accion;
  const escrita = await db.query(`UPDATE juego.manos SET acciones = acciones || $4::jsonb, version=version+1
    WHERE mesa=$1 AND numero=$2 AND version=$3`, [fila.mesa, fila.numero, fila.version, JSON.stringify([entrada])]);
  if (escrita.rowCount !== 1) throw new ErrorPeticion(409, "La mesa cambió. Actualizá la partida.");
  await guardarDecisionesReplayDB(db, fila.mesa, [decision], mano.estado.meta);
  nueva.pasesPie = mano.pasesPie;
  nueva.politicaPie = mano.politicaPie;
  return continuarAlPie(db, fila.mesa, fila.numero, nueva, esperan, mano.indicaciones ?? [], mano.estado);
}
