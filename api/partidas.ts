import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool, PoolClient } from "pg";
import { normalizarPartida } from "@eltruco/motor/partida-jugador.ts";
import type { Asiento } from "@eltruco/motor/reparto.ts";
import {
  iniciarOnline, marcadorOnline, repartirOnline, versionReglasOnline, vistaOnline,
} from "@eltruco/motor/mesa-online.ts";
import { crearIndicacionPie, textoFrasePie, versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import { confirmarJugadaPieDB, continuarAlPie, destinosAtendidos, guardarPalabraPie, programarBotPie, vistaPiePrivada } from "./partidas-pie.ts";
import { jugadorDeSesion } from "./auth.ts";
import { origenValido } from "./sesion.ts";
import { ErrorPeticion, leerJson, responderJson } from "./http.ts";
import { formatoMesa, leerMesa, verificarPerfil, type FormatoMesa, type VistaMesa } from "./mesas.ts";
import { confirmar, guardarAcciones, jugarComputadoras, leerAccion, prepararTurno, restaurar, turnosDeEquipo,
  type Confirmada, type ManoPublicable } from "./turnos.ts";
import {
  confirmarTurnoTercetosDB, proyectarTercetos, registrarPendienteTercetos,
  repartirTercetosDB, restaurarTercetosDB, type RegistroTercetos,
} from "./partidas-tercetos.ts";
import { incumbent } from "../training/seat/index.ts";
import { programarTurno } from "./bot-pendiente.ts";
import { esperanDe } from "./cedidos.ts";
import { seatsFor, signalVersionFor, type Format } from "../training/contracts/index.ts";
import { decisionReplay, guardarDecisionesReplayDB, iniciarReplayDB, type DecisionReplay } from "./replay-db.ts";

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const rutaPartida = /^\/api\/mesas\/([^/]+)\/(partida|acciones|siguiente|indicaciones)$/;
export const esRutaPartida = (path: string) => rutaPartida.test(path);
type Operacion = "acciones" | "siguiente" | "indicaciones";
type Tanteador = [number, number];

interface Comando {
  id: string;
  version: number;
  operacion: Operacion;
  accion?: Confirmada;
  indicacion?: { destinatario: number; frase: string; vuelta: number };
}

function validar(operacion: Operacion, datos: Record<string, unknown>, asiento: Asiento, formato: FormatoMesa, alPie: boolean): Comando {
  if (typeof datos.id !== "string" || !uuid.test(datos.id) || typeof datos.version !== "number"
      || !Number.isSafeInteger(datos.version) || datos.version < 0) {
    throw new ErrorPeticion(400, "El comando requiere un identificador y una versión válidos.");
  }
  const comando: Comando = { id: datos.id.toLowerCase(), version: datos.version, operacion };
  if (operacion === "indicaciones") {
    const dato = datos.indicacion;
    if (!alPie || Object.keys(datos).length !== 3 || !dato || typeof dato !== "object" || Array.isArray(dato)
      || Object.keys(dato).length !== 3
      || !("destinatario" in dato) || typeof dato.destinatario !== "number" || !Number.isInteger(dato.destinatario)
      || !("vuelta" in dato) || typeof dato.vuelta !== "number" || !Number.isInteger(dato.vuelta)
      || !("frase" in dato) || typeof dato.frase !== "string" || (dato.frase !== "sin-indicacion" && !Object.hasOwn(textoFrasePie, dato.frase))) {
      throw new ErrorPeticion(400, "Se esperaba una indicación del pie para un compañero de esta vuelta.");
    }
    comando.indicacion = { destinatario: dato.destinatario, frase: dato.frase, vuelta: dato.vuelta };
    return comando;
  }
  if (operacion === "siguiente") {
    if (datos.accion !== undefined) throw new ErrorPeticion(400, "El reparto no lleva una acción.");
    return comando;
  }
  comando.accion = leerAccion(datos.accion, asiento, formato, alPie);
  return comando;
}

function ganador(puntos: Tanteador, meta: number) {
  if (puntos[0] >= meta) return 0;
  if (puntos[1] >= meta) return 1;
  return null;
}

function vista(mano: ManoPublicable, formato: FormatoMesa, numero: number, version: number, asiento: Asiento, humanos: readonly number[]) {
  const pie = mano.indicaciones && { versionSenas: versionSenasPie, indicaciones: mano.indicaciones,
    pie: vistaPiePrivada(mano, asiento, humanos) };
  if (formato === "triples") return { ...proyectarTercetos(mano.estado, numero, version, asiento), ...pie };
  const puntos = marcadorOnline(mano.estado);
  const { meta } = mano.estado;
  const versionSenas = signalVersionFor(formato);
  return normalizarPartida({ version, formato, manoNumero: numero, puntos, meta, ganadorPartida: ganador(puntos, meta),
    ...pie, ...(!pie && versionSenas && {versionSenas, turnos: turnosDeEquipo(mano.turnos, asiento)}),
    vista: vistaOnline(mano.estado, asiento) });
}

/** Humanos para las reglas y el replay, incluidos los asientos cedidos. */
function asientosHumanos(mesa: VistaMesa) {
  return mesa.asientos.filter(a => a.tipo === "humano" || a.cedido).map(a => a.asiento);
}

/** Asientos que esperan a una persona: los cedidos los juega la computadora. */
function asientosQueEsperan(mesa: VistaMesa) {
  return mesa.asientos.filter(a => a.tipo === "humano").map(a => a.asiento);
}

function jugarBotsConReplay(mano: ManoPublicable, formato: Format, humanos: readonly number[], decisiones: DecisionReplay[],
    esperan: readonly number[] = humanos) {
  return jugarComputadoras(mano, formato, humanos, false, (paso, propuesta) => decisiones.push(decisionReplay(paso, propuesta)), esperan);
}

async function repartir(db: PoolClient, mesa: string, formato: FormatoMesa, humanos: number[], numero: number,
    version: number, puntos: Tanteador, meta: number, dador?: number, diferida = false, alPie = false) {
  const cantidad = formato === "triples" ? 6 : seatsFor(formato);
  const computadoras = Array.from({ length: cantidad }, (_, i) => i as Asiento).filter(i => !humanos.includes(i));
  const reparto = repartirOnline(cantidad, dador, computadoras);
  if (formato === "triples") {
    const estado = await repartirTercetosDB(db, mesa, numero, version, puntos, meta, humanos, reparto, alPie);
    await iniciarReplayDB(db, mesa, formato, humanos, estado, numero);
    const mano = {estado, turnos: []};
    return alPie ? continuarAlPie(db, mesa, numero, mano, humanos, []) : mano;
  }
  const inicial = {estado: iniciarOnline(reparto, puntos, meta), turnos: []};
  const decisiones: DecisionReplay[] = [];
  const mano = (diferida || alPie) ? inicial : jugarBotsConReplay(inicial, formato, humanos, decisiones, await esperanDe(db, mesa, humanos));
  await db.query(`INSERT INTO juego.manos (mesa, numero, version, version_reglas, reparto, puntos_inicio, acciones, version_senas)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [mesa, numero, version, versionReglasOnline, reparto, puntos,
    JSON.stringify(guardarAcciones(mano)), alPie ? versionSenasPie : signalVersionFor(formato)]);
  await iniciarReplayDB(db, mesa, formato, humanos, inicial.estado, numero);
  await guardarDecisionesReplayDB(db, mesa, decisiones, meta);
  if (alPie) return continuarAlPie(db, mesa, numero, mano, humanos, []);
  if (diferida) await programarTurno(db, mesa, mano, humanos);
  return mano;
}

async function ultimaMano(db: PoolClient, id: string) {
  const {rows: [fila]} = await db.query<RegistroTercetos>("SELECT * FROM juego.manos WHERE mesa=$1 ORDER BY numero DESC LIMIT 1", [id]);
  return fila;
}

function recuperar(fila: RegistroTercetos, formato: FormatoMesa, meta: number, humanos: readonly number[]): ManoPublicable {
  if (formato === "triples") {
    const estado = restaurarTercetosDB(fila);
    if (estado.meta !== meta) throw new Error("La meta del reparto difiere de la pactada.");
    return { estado, turnos: [], ...(fila.version_senas === versionSenasPie && { indicaciones: fila.indicaciones ?? [], pasesPie: fila.pases_pie ?? [] }) };
  }
  return restaurar(fila, formato, meta, humanos);
}

export type MesaComputadoras = Pick<VistaMesa, "id" | "modo" | "meta"> & {
  version_senas: string | null; perfil_tercetos: string | null;
};

/** La mesa está bloqueada por el llamador. Devuelve si el chico llegó a la meta. */
export async function avanzarManoComputadoras(db: PoolClient, mesa: MesaComputadoras) {
  verificarPerfil(mesa.modo, mesa.perfil_tercetos);
  const formato = formatoMesa(mesa.modo, mesa.version_senas);
  const asientos = await db.query(`SELECT asiento FROM juego.asientos WHERE mesa=$1 AND computadora ORDER BY asiento`, [mesa.id]);
  const capacidad = formato === "triples" ? 6 : seatsFor(formato);
  if (asientos.rows.length !== capacidad || asientos.rows.some((a, i) => a.asiento !== i)) {
    throw new Error("El ensayo requiere un asiento de computadora por posición.");
  }
  const fila = await ultimaMano(db, mesa.id);
  const previo = fila && recuperar(fila, formato, mesa.meta, []);
  const puntos: Tanteador = previo ? marcadorOnline(previo.estado) : [0, 0];
  if (previo && !previo.estado.resultado) {
    if (formato === "triples") await registrarPendienteTercetos(db, mesa.id, previo.estado, []);
    else await programarTurno(db, mesa.id, previo, []);
    return false;
  }
  let final = ganador(puntos, mesa.meta) !== null;
  if (!final) {
    const dador = fila ? (fila.reparto.dador + 1) % capacidad : undefined;
    const mano = await repartir(db, mesa.id, formato, [], (fila?.numero ?? 0) + 1,
      (fila?.version ?? 0) + 1, puntos, mesa.meta, dador, true, mesa.version_senas === versionSenasPie);
    final = ganador(marcadorOnline(mano.estado), mesa.meta) !== null;
  }
  return final;
}

/** Un único paso de una mesa de laboratorio. El servidor reanuda los ensayos reservados en PostgreSQL. */
export async function avanzarEnsayo(pool: Pool) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const {rows: [mesa]} = await db.query<MesaComputadoras>(`SELECT id, modo, meta, version_senas, perfil_tercetos FROM juego.mesas
      WHERE solo_computadoras AND cupo_exhibicion IS NULL AND NOT ensayo_terminado
      AND NOT EXISTS (SELECT 1 FROM juego.turnos_bot t WHERE t.mesa=juego.mesas.id) ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`);
    if (mesa) {
      if (await avanzarManoComputadoras(db, mesa)) await db.query("UPDATE juego.mesas SET ensayo_terminado=true WHERE id=$1", [mesa.id]);
    }
    await db.query("COMMIT");
    return Boolean(mesa);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

/**
 * La mesa está bloqueada por el llamador. Después de ceder un asiento, juega o programa el turno
 * si ahora corresponde a la computadora, igual que después de una jugada humana.
 */
export async function reanudarComputadoras(db: PoolClient, id: string) {
  const { rows: [registro] } = await db.query<MesaComputadoras & { politica: string }>(
    "SELECT id, modo, meta, version_senas, perfil_tercetos, politica FROM juego.mesas WHERE id=$1", [id]);
  const fila = registro && await ultimaMano(db, id);
  if (!fila) return;
  verificarPerfil(registro.modo, registro.perfil_tercetos);
  const formato = formatoMesa(registro.modo, registro.version_senas);
  const { rows: asientos } = await db.query<{ asiento: number; computadora: boolean; cedido: boolean }>(
    "SELECT asiento, computadora, cedido FROM juego.asientos WHERE mesa=$1", [id]);
  const humanos = asientos.filter(a => !a.computadora).map(a => a.asiento);
  const esperan = asientos.filter(a => !a.computadora && !a.cedido).map(a => a.asiento);
  const mano = recuperar(fila, formato, registro.meta, humanos);
  if (mano.estado.resultado) return;
  if (formato === "triples") await registrarPendienteTercetos(db, id, mano.estado, humanos);
  else if (registro.version_senas === versionSenasPie) await programarBotPie(db, id, mano, humanos);
  else if (registro.politica !== incumbent.id) await programarTurno(db, id, mano, humanos);
  else {
    const decisiones: DecisionReplay[] = [];
    const nueva = jugarBotsConReplay(mano, formato, humanos, decisiones, esperan);
    if (!decisiones.length) return;
    await db.query("UPDATE juego.manos SET version=version+1, acciones=$3 WHERE mesa=$1 AND numero=$2",
      [id, fila.numero, JSON.stringify(guardarAcciones(nueva))]);
    await guardarDecisionesReplayDB(db, id, decisiones, registro.meta);
  }
}

export function crearPartidas(pool: Pool, web: URL, alCambiar: (mesaId: string) => void = () => {}) {
  async function resolver(db: PoolClient, id: string, jugador: string, op?: Operacion, datos: Record<string, unknown> = {}) {
    if (!uuid.test(id)) throw new ErrorPeticion(404, "No se encontró tu mesa.");
    // Compartido con la toma de asientos: hay un solo reparto inicial y un único escritor por mesa.
    const lock = await db.query(`SELECT m.id FROM juego.mesas m JOIN juego.asientos a ON a.mesa=m.id
      WHERE m.id=$1 AND a.jugador=$2 FOR UPDATE OF m`, [id, jugador]);
    if (!lock.rowCount) throw new ErrorPeticion(404, "No se encontró tu mesa.");
    const mesa = await leerMesa(db, id, jugador, web);
    if (!mesa) throw new ErrorPeticion(404, "No se encontró tu mesa.");
    if (mesa.cancelada) throw new ErrorPeticion(409, "La mesa se canceló.");
    const asiento = mesa.miAsiento as Asiento;
    const diferida = mesa.politica !== incumbent.id;
    const alPie = mesa.versionSenas === versionSenasPie;
    const comando = op && validar(op, datos, asiento, mesa.formato, alPie);
    if (!mesa.lista) {
      if (comando) throw new ErrorPeticion(409, "La mesa todavía tiene asientos libres.");
      return { cambio: false, partida: normalizarPartida({ version: 0, formato: mesa.formato, manoNumero: 0,
        puntos: [0, 0], meta: mesa.meta, ganadorPartida: null, vista: null, ...(alPie && { versionSenas: versionSenasPie }) }) };
    }
    if (comando) {
      const { rows: [previo] } = await db.query(`SELECT respuesta, peticion = $4::jsonb AS coincide
        FROM juego.comandos WHERE mesa=$1 AND jugador=$2 AND id=$3`, [id, jugador, comando.id, comando]);
      if (previo) {
        if (!previo.coincide) throw new ErrorPeticion(409, "El identificador corresponde a otro comando.");
        // Un recibo anterior a la privacidad de equipo puede contener señas rivales.
        const respuesta = previo.respuesta;
        const partida = respuesta.turnos ? { ...respuesta, turnos: turnosDeEquipo(respuesta.turnos, asiento) } : respuesta;
        return { cambio: false, partida };
      }
    }
    const humanos = asientosHumanos(mesa);
    const esperan = asientosQueEsperan(mesa);
    const fila = await ultimaMano(db, id);
    if (!fila) {
      if (comando) throw new ErrorPeticion(409, "Actualizá la mesa para recibir tu mano.");
      const mano = await repartir(db, id, mesa.formato, humanos, 1, 1, [0, 0], mesa.meta, undefined, diferida, alPie);
      return { cambio: true, partida: vista(mano, mesa.formato, 1, 1, asiento, humanos) };
    }
    if ((fila.version_senas ?? undefined) !== mesa.versionSenas) throw new ErrorPeticion(503, "La mano y la mesa tienen versiones de señas diferentes.");
    const mano = recuperar(fila, mesa.formato, mesa.meta, humanos);
    const estado = mano.estado;
    if (!comando) {
      // Una mano guardada antes de esta regla puede estar esperando la salida humana.
      if (mesa.formato === "duel" && estado.antesDeSalida !== undefined) {
        if (diferida) await programarTurno(db, id, mano, humanos);
        else {
          const decisiones: DecisionReplay[] = [];
          const nueva = jugarBotsConReplay(mano, mesa.formato, humanos, decisiones, esperan);
          await db.query("UPDATE juego.manos SET version=version+1, acciones=$3 WHERE mesa=$1 AND numero=$2",
            [id, fila.numero, JSON.stringify(guardarAcciones(nueva))]);
          await guardarDecisionesReplayDB(db, id, decisiones, mesa.meta);
          return { cambio: true, partida: vista(nueva, mesa.formato, fila.numero, fila.version + 1, asiento, humanos) };
        }
      }
      return { cambio: false, partida: vista(mano, mesa.formato, fila.numero, fila.version, asiento, humanos) };
    }
    // Hablar no depende de cartas o cantos simultáneos de otros asientos. La versión
    // de apertura y la vuelta impiden que una petición vieja se aplique a otro reparto.
    const pase = comando.indicacion?.frase === "sin-indicacion";
    const desde = comando.operacion === "indicaciones" && !pase ? fila.version - fila.acciones.length : fila.version;
    if (comando.version < desde || comando.version > fila.version) throw new ErrorPeticion(409, "La mesa cambió. Actualizá la partida.");
    const version = fila.version + 1;
    let partida;
    if (comando.operacion === "indicaciones") {
      const { destinatario, frase, vuelta } = comando.indicacion!;
      if (pase) {
        const pie = vistaPiePrivada(mano, asiento, humanos);
        if (pie?.esperando === undefined || pie.esperando !== destinatario || pie.vuelta !== vuelta) {
          throw new ErrorPeticion(409, "El compañero no está esperando tu indicación en esta vuelta.");
        }
        const permiso = { vuelta, destinatario: pie.esperando };
        await db.query("UPDATE juego.manos SET pases_pie=pases_pie || $3::jsonb WHERE mesa=$1 AND numero=$2",
          [id, fila.numero, JSON.stringify([permiso])]);
        mano.pasesPie = [...(mano.pasesPie ?? []), permiso];
      } else {
        const palabra = crearIndicacionPie(estado, asiento, destinatario, frase, vuelta, destinosAtendidos(mano));
        if (!palabra) {
          const enVuelta = estado.mano.vueltas[vuelta - 1] ?? (vuelta === estado.mano.vueltas.length + 1 ? estado.mano.vueltaActual : null);
          if (enVuelta?.jugadas.some(j => j.asiento === destinatario)) throw new ErrorPeticion(409, "El compañero ya jugó su carta.");
          throw new ErrorPeticion(409, "No podés dar esa indicación en esta vuelta.");
        }
        await guardarPalabraPie(db, id, fila.numero, palabra);
        mano.indicaciones!.push(palabra);
      }
      await programarBotPie(db, id, mano, humanos);
      partida = vista(mano, mesa.formato, fila.numero, fila.version, asiento, humanos);
    } else if (comando.operacion === "siguiente") {
      const puntos = marcadorOnline(estado);
      if (!estado.resultado || ganador(puntos, mesa.meta) !== null) throw new ErrorPeticion(409, "No corresponde repartir otra mano.");
      const dador = (fila.reparto.dador + 1) % mesa.asientos.length;
      const nueva = await repartir(db, id, mesa.formato, humanos, fila.numero + 1, version, puntos, mesa.meta, dador, diferida, alPie);
      partida = vista(nueva, mesa.formato, fila.numero + 1, version, asiento, humanos);
    } else if (alPie) {
      const nueva = await confirmarJugadaPieDB(db, fila, mano, comando.accion!, humanos);
      partida = vista(nueva, mesa.formato, fila.numero, version, asiento, humanos);
    } else if (mesa.formato === "triples") {
      const nuevo = await confirmarTurnoTercetosDB(db, fila, estado, comando.accion!, asientosHumanos(mesa));
      partida = proyectarTercetos(nuevo, fila.numero, version, asiento);
    } else {
      let paso: ManoPublicable;
      try {
        paso = confirmar(mano, mesa.formato, comando.accion!);
      } catch (error) {
        if (!(error instanceof RangeError || error instanceof TypeError)) throw error;
        throw new ErrorPeticion(409, "La acción no está permitida en este turno.");
      }
      const decisiones = [decisionReplay(paso)];
      const siguiente = diferida ? prepararTurno(paso, humanos) : jugarBotsConReplay(paso, mesa.formato, humanos, decisiones, esperan);
      if (diferida) await programarTurno(db, id, siguiente, humanos);
      await db.query("UPDATE juego.manos SET version=$3, acciones=$4 WHERE mesa=$1 AND numero=$2",
        [id, fila.numero, version, JSON.stringify(guardarAcciones(siguiente))]);
      await guardarDecisionesReplayDB(db, id, decisiones, mesa.meta);
      partida = vista(siguiente, mesa.formato, fila.numero, version, asiento, humanos);
    }
    await db.query("INSERT INTO juego.comandos (mesa,jugador,id,peticion,respuesta) VALUES ($1,$2,$3,$4,$5)",
      [id, jugador, comando.id, comando, partida]);
    return { cambio: !pase, partida };
  }

  async function transaccion(id: string, jugador: string, op?: Operacion, datos?: Record<string, unknown>) {
    const db = await pool.connect();
    let resultado;
    try {
      await db.query("BEGIN");
      resultado = await resolver(db, id, jugador, op, datos);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
    if (resultado.cambio) alCambiar(id);
    return resultado.partida;
  }

  async function atender(req: IncomingMessage, res: ServerResponse) {
    try {
      const ruta = rutaPartida.exec((req.url ?? "").split("?")[0]);
      if (!ruta) throw new ErrorPeticion(404, "Ruta desconocida.");
      const jugador = await jugadorDeSesion(pool, req);
      if (!jugador) throw new ErrorPeticion(401, "Ingresá al juego para jugar.");
      const [, id, op] = ruta;
      if (op === "partida" && req.method === "GET") {
        responderJson(res, 200, await transaccion(id, jugador.id));
        return;
      }
      if (op === "partida" || req.method !== "POST") throw new ErrorPeticion(405, "Método no permitido.");
      if (!origenValido(req, web)) throw new ErrorPeticion(403, "El origen no corresponde al juego.");
      responderJson(res, 200, await transaccion(id, jugador.id, op as Operacion, await leerJson(req)));
    } catch (error) {
      if (!(error instanceof ErrorPeticion)) throw error;
      responderJson(res, error.status, { error: error.message });
    }
  }
  return { leer: (id: string, jugador: string) => transaccion(id, jugador),
    ejecutar: (id: string, jugador: string, op: Operacion, datos: Record<string, unknown>) => transaccion(id, jugador, op, datos), atender };
}
