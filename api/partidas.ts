import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool, PoolClient } from "pg";
import type { Asiento } from "../src/motor/reparto.ts";
import {
  iniciarOnline, marcadorOnline, repartirOnline, versionReglasOnline, vistaOnline,
} from "../src/motor/mesa-online.ts";
import { jugadorDeSesion } from "./auth.ts";
import { ErrorPeticion, leerJson, responderJson } from "./http.ts";
import { formatoMesa, leerMesa, verificarPerfil, type FormatoMesa, type VistaMesa } from "./mesas.ts";
import { confirmar, guardarAcciones, jugarComputadoras, leerAccion, restaurar, turnosDeEquipo,
  type Confirmada, type ManoPublicable } from "./turnos.ts";
import {
  confirmarTurnoTercetosDB, proyectarTercetos, registrarPendienteTercetos,
  repartirTercetosDB, restaurarTercetosDB, type RegistroTercetos,
} from "./partidas-tercetos.ts";
import { incumbent } from "../training/seat/index.ts";
import { programarTurno } from "./bot-pendiente.ts";
import { hasSignals, seatsFor, signalVersionFor } from "../training/contracts/index.ts";

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const rutaPartida = /^\/api\/mesas\/([^/]+)\/(partida|acciones|siguiente)$/;
export const esRutaPartida = (path: string) => rutaPartida.test(path);
type Operacion = "acciones" | "siguiente";
type Tanteador = [number, number];

interface Comando {
  id: string;
  version: number;
  operacion: Operacion;
  accion?: Confirmada;
}

function validar(operacion: Operacion, datos: Record<string, unknown>, asiento: Asiento, formato: FormatoMesa): Comando {
  if (typeof datos.id !== "string" || !uuid.test(datos.id) || typeof datos.version !== "number"
      || !Number.isSafeInteger(datos.version) || datos.version < 0) {
    throw new ErrorPeticion(400, "El comando requiere un identificador y una versión válidos.");
  }
  const comando: Comando = { id: datos.id.toLowerCase(), version: datos.version, operacion };
  if (operacion === "siguiente") {
    if (datos.accion !== undefined) throw new ErrorPeticion(400, "El reparto no lleva una acción.");
    return comando;
  }
  comando.accion = leerAccion(datos.accion, asiento, formato);
  return comando;
}

function ganador(puntos: Tanteador, meta: number) {
  if (puntos[0] >= meta) return 0;
  if (puntos[1] >= meta) return 1;
  return null;
}

function vista(mano: ManoPublicable, formato: FormatoMesa, numero: number, version: number, asiento: Asiento) {
  if (formato === "triples") return proyectarTercetos(mano.estado, numero, version, asiento);
  const puntos = marcadorOnline(mano.estado);
  const { meta } = mano.estado;
  return { version, formato, manoNumero: numero, puntos, meta, ganadorPartida: ganador(puntos, meta),
    ...(hasSignals(formato) && {versionSenas: signalVersionFor(formato), turnos: turnosDeEquipo(mano.turnos, asiento)}),
    vista: vistaOnline(mano.estado, asiento) };
}

function asientosHumanos(mesa: VistaMesa) {
  return mesa.asientos.filter(a => a.tipo === "humano").map(a => a.asiento);
}

async function repartir(db: PoolClient, mesa: string, formato: FormatoMesa, humanos: number[], numero: number,
    version: number, puntos: Tanteador, meta: number, dador?: number, diferida = false) {
  if (formato === "triples") {
    const estado = await repartirTercetosDB(db, mesa, numero, version, puntos, meta, humanos, dador);
    return {estado, turnos: []};
  }
  const reparto = repartirOnline(seatsFor(formato), dador);
  const inicial = {estado: iniciarOnline(reparto, puntos, meta), turnos: []};
  const mano = diferida ? inicial : jugarComputadoras(inicial, formato, humanos);
  await db.query(`INSERT INTO juego.manos (mesa, numero, version, version_reglas, reparto, puntos_inicio, acciones, version_senas)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [mesa, numero, version, versionReglasOnline, reparto, puntos,
    JSON.stringify(guardarAcciones(mano)), signalVersionFor(formato)]);
  if (diferida) await programarTurno(db, mesa, mano, humanos);
  return mano;
}

async function ultimaMano(db: PoolClient, id: string) {
  const {rows: [fila]} = await db.query<RegistroTercetos>("SELECT * FROM juego.manos WHERE mesa=$1 ORDER BY numero DESC LIMIT 1", [id]);
  return fila;
}

function recuperar(fila: RegistroTercetos, formato: FormatoMesa, meta: number): ManoPublicable {
  if (formato === "triples") {
    const estado = restaurarTercetosDB(fila);
    if (estado.meta !== meta) throw new Error("La meta del reparto difiere de la pactada.");
    return { estado, turnos: [] };
  }
  return restaurar(fila, formato, meta);
}

/** Un único paso de una mesa de laboratorio. El servidor reanuda los ensayos reservados en PostgreSQL. */
export async function avanzarEnsayo(pool: Pool) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const {rows: [mesa]} = await db.query<Pick<VistaMesa, "id" | "modo" | "meta"> & {
      version_senas: string | null; perfil_tercetos: string | null;
    }>(`SELECT id, modo, meta, version_senas, perfil_tercetos FROM juego.mesas
      WHERE solo_computadoras AND NOT ensayo_terminado
      AND NOT EXISTS (SELECT 1 FROM juego.turnos_bot t WHERE t.mesa=juego.mesas.id) ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`);
    if (mesa) {
      verificarPerfil(mesa.modo, mesa.perfil_tercetos);
      const formato = formatoMesa(mesa.modo, mesa.version_senas);
      const asientos = await db.query(`SELECT asiento FROM juego.asientos WHERE mesa=$1 AND computadora ORDER BY asiento`, [mesa.id]);
      const capacidad = formato === "triples" ? 6 : seatsFor(formato);
      if (asientos.rows.length !== capacidad || asientos.rows.some((a, i) => a.asiento !== i)) {
        throw new Error("El ensayo requiere un asiento de computadora por posición.");
      }
      const fila = await ultimaMano(db, mesa.id);
      const previo = fila && recuperar(fila, formato, mesa.meta);
      const puntos: Tanteador = previo ? marcadorOnline(previo.estado) : [0, 0];
      if (previo && !previo.estado.resultado) {
        if (formato === "triples") await registrarPendienteTercetos(db, mesa.id, previo.estado, []);
        else await programarTurno(db, mesa.id, previo, []);
        await db.query("COMMIT");
        return true;
      }
      let final = ganador(puntos, mesa.meta) !== null;
      if (!final) {
        const dador = fila ? (fila.reparto.dador + 1) % capacidad : undefined;
        const mano = await repartir(db, mesa.id, formato, [], (fila?.numero ?? 0) + 1,
          (fila?.version ?? 0) + 1, puntos, mesa.meta, dador, true);
        final = ganador(marcadorOnline(mano.estado), mesa.meta) !== null;
      }
      if (final) await db.query("UPDATE juego.mesas SET ensayo_terminado=true WHERE id=$1", [mesa.id]);
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

export function crearPartidas(pool: Pool, web: URL, alCambiar: (mesaId: string) => void = () => {}) {
  async function resolver(db: PoolClient, id: string, jugador: string, op?: Operacion, datos: Record<string, unknown> = {}) {
    if (!uuid.test(id)) throw new ErrorPeticion(404, "No se encontró tu mesa.");
    // Compartido con la toma de asientos: hay un solo reparto inicial y un único escritor por mesa.
    const lock = await db.query(`SELECT m.id FROM juego.mesas m JOIN juego.asientos a ON a.mesa=m.id
      WHERE m.id=$1 AND a.jugador=$2 FOR UPDATE OF m`, [id, jugador]);
    if (!lock.rowCount) throw new ErrorPeticion(404, "No se encontró tu mesa.");
    const mesa = await leerMesa(db, id, jugador, web);
    if (!mesa) throw new ErrorPeticion(404, "No se encontró tu mesa.");
    const asiento = mesa.miAsiento as Asiento;
    const diferida = mesa.politica !== incumbent.id;
    const comando = op && validar(op, datos, asiento, mesa.formato);
    if (!mesa.lista) {
      if (comando) throw new ErrorPeticion(409, "La mesa todavía tiene asientos libres.");
      return { cambio: false, partida: { version: 0, formato: mesa.formato, manoNumero: 0, puntos: [0, 0], meta: mesa.meta, ganadorPartida: null, vista: null } };
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
    const fila = await ultimaMano(db, id);
    if (!fila) {
      if (comando) throw new ErrorPeticion(409, "Actualizá la mesa para recibir tu mano.");
      const mano = await repartir(db, id, mesa.formato, asientosHumanos(mesa), 1, 1, [0, 0], mesa.meta, undefined, diferida);
      return { cambio: true, partida: vista(mano, mesa.formato, 1, 1, asiento) };
    }
    const mano = recuperar(fila, mesa.formato, mesa.meta);
    const estado = mano.estado;
    if (!comando) return { cambio: false, partida: vista(mano, mesa.formato, fila.numero, fila.version, asiento) };
    if (comando.version !== fila.version) throw new ErrorPeticion(409, "La mesa cambió. Actualizá la partida.");
    const version = fila.version + 1;
    let partida;
    if (comando.operacion === "siguiente") {
      const puntos = marcadorOnline(estado);
      if (!estado.resultado || ganador(puntos, mesa.meta) !== null) throw new ErrorPeticion(409, "No corresponde repartir otra mano.");
      const dador = (fila.reparto.dador + 1) % mesa.asientos.length;
      const nueva = await repartir(db, id, mesa.formato, asientosHumanos(mesa), fila.numero + 1, version, puntos, mesa.meta, dador, diferida);
      partida = vista(nueva, mesa.formato, fila.numero + 1, version, asiento);
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
      const siguiente = diferida ? paso : jugarComputadoras(paso, mesa.formato, asientosHumanos(mesa));
      if (diferida) await programarTurno(db, id, siguiente, asientosHumanos(mesa));
      await db.query("UPDATE juego.manos SET version=$3, acciones=$4 WHERE mesa=$1 AND numero=$2",
        [id, fila.numero, version, JSON.stringify(guardarAcciones(siguiente))]);
      partida = vista(siguiente, mesa.formato, fila.numero, version, asiento);
    }
    await db.query("INSERT INTO juego.comandos (mesa,jugador,id,peticion,respuesta) VALUES ($1,$2,$3,$4,$5)",
      [id, jugador, comando.id, comando, partida]);
    return { cambio: true, partida };
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
      if (req.headers.origin !== web.origin) throw new ErrorPeticion(403, "El origen no corresponde al juego.");
      responderJson(res, 200, await transaccion(id, jugador.id, op as Operacion, await leerJson(req)));
    } catch (error) {
      if (!(error instanceof ErrorPeticion)) throw error;
      responderJson(res, error.status, { error: error.message });
    }
  }
  return { leer: (id: string, jugador: string) => transaccion(id, jugador),
    ejecutar: (id: string, jugador: string, op: Operacion, datos: Record<string, unknown>) => transaccion(id, jugador, op, datos), atender };
}
