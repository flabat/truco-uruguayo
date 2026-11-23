import type { PoolClient } from "pg";
import { elegirIndicacionesPie } from "../src/motor/bot-pie.ts";
import { legalesOnline } from "../src/motor/cantos-online.ts";
import { aDecidir, aplicarOnline, vistaOnline, type AccionOnline, type EstadoOnline } from "../src/motor/mesa-online.ts";
import type { Asiento } from "../src/motor/reparto.ts";
import type { DecisionBotV1 } from "../src/motor/replay-chico.ts";
import { crearIndicacionPie, vistaDelPie, type IndicacionPie } from "../src/motor/senas-pie.ts";
import { ErrorPeticion } from "./http.ts";
import type { RegistroTercetos } from "./partidas-tercetos.ts";
import { decisionReplay, decisionTercetos, guardarDecisionesReplayDB, guardarIndicacionReplayDB, type DecisionReplay } from "./replay-db.ts";
import { confirmar, identificador, type ManoPublicable } from "./turnos.ts";

/** El llamador ya tiene el bloqueo de mesa. La palabra y su replay quedan en la misma transacción. */
export async function guardarPalabraPie(db: PoolClient, mesa: string, numero: number, palabra: IndicacionPie) {
  await db.query("UPDATE juego.manos SET indicaciones = indicaciones || $3::jsonb WHERE mesa=$1 AND numero=$2",
    [mesa, numero, JSON.stringify([palabra])]);
  await guardarIndicacionReplayDB(db, mesa, palabra);
}

async function programarBotPie(db: PoolClient, mesa: string, estado: EstadoOnline, humanos: readonly number[]) {
  const posibles = aDecidir(estado);
  const asiento = posibles[0];
  if (asiento === undefined || posibles.some(a => humanos.includes(a))) {
    await db.query("DELETE FROM juego.turnos_bot WHERE mesa=$1", [mesa]);
    return;
  }
  // La ventana depende de quién juega, incluso si ya se pronunció una indicación.
  const pie = vistaDelPie(estado, asiento, [])?.pie;
  const espera = pie !== undefined && pie !== asiento && humanos.includes(pie) && legalesOnline(estado, asiento).includes("carta");
  await db.query(`INSERT INTO juego.turnos_bot (mesa, disponible_desde)
    VALUES ($1, clock_timestamp() + CASE WHEN $2::boolean THEN interval '4 seconds' ELSE interval '0 seconds' END)
    ON CONFLICT (mesa) DO UPDATE SET disponible_desde=EXCLUDED.disponible_desde`, [mesa, espera]);
}

/** Se llama al abrir el reparto o después de persistir exactamente una jugada y su replay. */
export async function continuarAlPie(db: PoolClient, mesa: string, numero: number, mano: ManoPublicable,
    humanos: readonly number[], palabras: readonly IndicacionPie[], anterior?: EstadoOnline): Promise<ManoPublicable> {
  const estado = mano.estado;
  const indicaciones = [...palabras];
  const abreVuelta = !anterior || anterior.mano.vueltas.length !== estado.mano.vueltas.length;
  if (abreVuelta && !estado.resultado && estado.lance?.tipo !== "pico-a-pico") {
    for (const asiento of estado.mano.reparto.manos.keys()) {
      const emisor = asiento as Asiento;
      if (humanos.includes(emisor)) continue;
      const pie = vistaDelPie(estado, emisor, indicaciones);
      if (pie?.pie !== emisor) continue;
      for (const propuesta of elegirIndicacionesPie(vistaOnline(estado, emisor), pie)) {
        const palabra = crearIndicacionPie(estado, emisor, propuesta.destinatario, propuesta.frase, pie.vuelta, indicaciones);
        if (!palabra) throw new Error("La computadora propuso una indicación fuera de su oportunidad.");
        await guardarPalabraPie(db, mesa, numero, palabra);
        indicaciones.push(palabra);
      }
    }
  }
  await programarBotPie(db, mesa, estado, humanos);
  return { ...mano, indicaciones };
}

export async function confirmarJugadaPieDB(db: PoolClient, fila: Pick<RegistroTercetos, "mesa" | "numero" | "version">,
    mano: ManoPublicable, accion: AccionOnline, humanos: readonly number[], bot?: DecisionBotV1) {
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
  return continuarAlPie(db, fila.mesa, fila.numero, nueva, humanos, mano.indicaciones ?? [], mano.estado);
}
