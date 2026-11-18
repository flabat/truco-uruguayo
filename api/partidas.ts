import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool, PoolClient } from "pg";
import type { Asiento } from "../src/motor/reparto.ts";
import {
  aDecidir, aplicarOnline, elegirAccionOnline, iniciarOnline, repartirOnline, versionReglasOnline, vistaOnline,
  type AccionOnline, type EstadoOnline, type RepartoOnline,
} from "../src/motor/mesa-online.ts";
import { jugadorDeSesion } from "./auth.ts";
import { ErrorPeticion, leerJson, responderJson } from "./http.ts";
import { leerMesa, type VistaMesa } from "./mesas.ts";

const meta = 40;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const rutaPartida = /^\/api\/mesas\/([^/]+)\/(partida|acciones|siguiente)$/;
export const esRutaPartida = (path: string) => rutaPartida.test(path);
type Operacion = "acciones" | "siguiente";
type Tanteador = [number, number];

interface Registro {
  numero: number;
  version: number;
  version_reglas: number;
  reparto: RepartoOnline;
  puntos_inicio: Tanteador;
  acciones: AccionOnline[];
}

interface Comando {
  id: string;
  version: number;
  operacion: Operacion;
  accion?: AccionOnline;
}

function validar(operacion: Operacion, datos: Record<string, unknown>, asiento: Asiento): Comando {
  if (typeof datos.id !== "string" || !uuid.test(datos.id) || typeof datos.version !== "number"
      || !Number.isSafeInteger(datos.version) || datos.version < 0) {
    throw new ErrorPeticion(400, "El comando requiere un identificador y una versión válidos.");
  }
  const comando: Comando = { id: datos.id.toLowerCase(), version: datos.version, operacion };
  if (operacion === "siguiente") {
    if (datos.accion !== undefined) throw new ErrorPeticion(400, "El reparto no lleva una acción.");
    return comando;
  }
  const accion = datos.accion;
  if (!accion || typeof accion !== "object" || Array.isArray(accion) || !("tipo" in accion) || typeof accion.tipo !== "string") {
    throw new ErrorPeticion(400, "Falta la acción de juego.");
  }
  const claves = accion.tipo === "carta" ? ["tipo", "carta"] : ["tipo"];
  if (Object.keys(accion).length !== claves.length || !claves.every(k => Object.hasOwn(accion, k))) {
    throw new ErrorPeticion(400, "La acción solo admite el canto o la carta elegida.");
  }
  // El motor comprueba el tipo de canto y la carta contra las opciones legales.
  comando.accion = { ...accion, asiento } as AccionOnline;
  return comando;
}

function restaurar(fila: Registro) {
  if (fila.version_reglas !== versionReglasOnline) throw new Error("Versión de reglas desconocida.");
  let estado = iniciarOnline(fila.reparto, fila.puntos_inicio, meta);
  for (const accion of fila.acciones) {
    const paso = aplicarOnline(estado, accion);
    if (!paso.ok) throw new Error("El historial de la mano no se pudo reproducir.");
    estado = paso.estado;
  }
  return estado;
}

function jugarComputadoras(estado: EstadoOnline, mesa: VistaMesa) {
  while (!estado.resultado) {
    const posibles = aDecidir(estado);
    if (posibles.some(i => mesa.asientos[i].tipo === "humano")) break;
    const bot = posibles[0];
    if (bot === undefined) throw new Error("La mano carece de un asiento en turno.");
    const accion = elegirAccionOnline(vistaOnline(estado, bot));
    const paso = accion && aplicarOnline(estado, accion);
    if (!paso?.ok) throw new Error("La computadora no pudo completar su turno.");
    estado = paso.estado;
  }
  return estado;
}

function tantos(estado: EstadoOnline): Tanteador {
  const puntos: Tanteador = [...estado.puntosInicio];
  for (const cobro of estado.cobros) puntos[cobro.equipo] += cobro.tantos;
  return puntos.map(n => Math.min(n, meta)) as Tanteador;
}

function ganador(puntos: Tanteador) {
  if (puntos[0] >= meta) return 0;
  if (puntos[1] >= meta) return 1;
  return null;
}

function vista(estado: EstadoOnline, numero: number, version: number, asiento: Asiento) {
  const puntos = tantos(estado);
  return { version, manoNumero: numero, puntos, meta, ganadorPartida: ganador(puntos), vista: vistaOnline(estado, asiento) };
}

async function repartir(db: PoolClient, mesa: VistaMesa, numero: number, version: number, puntos: Tanteador, dador?: number) {
  const reparto = repartirOnline(mesa.modo === "1v1" ? 2 : 4, dador);
  const estado = jugarComputadoras(iniciarOnline(reparto, puntos, meta), mesa);
  await db.query(`INSERT INTO juego.manos (mesa, numero, version, version_reglas, reparto, puntos_inicio, acciones)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [mesa.id, numero, version, versionReglasOnline, reparto, puntos, JSON.stringify(estado.acciones)]);
  return vista(estado, numero, version, mesa.miAsiento as Asiento);
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
    const comando = op && validar(op, datos, asiento);
    if (!mesa.lista) {
      if (comando) throw new ErrorPeticion(409, "La mesa todavía tiene asientos libres.");
      return { cambio: false, partida: { version: 0, manoNumero: 0, puntos: [0, 0], meta, ganadorPartida: null, vista: null } };
    }
    if (comando) {
      const { rows: [previo] } = await db.query(`SELECT respuesta, peticion = $4::jsonb AS coincide
        FROM juego.comandos WHERE mesa=$1 AND jugador=$2 AND id=$3`, [id, jugador, comando.id, comando]);
      if (previo) {
        if (!previo.coincide) throw new ErrorPeticion(409, "El identificador corresponde a otro comando.");
        return { cambio: false, partida: previo.respuesta };
      }
    }
    const { rows: [fila] } = await db.query<Registro>(
      "SELECT * FROM juego.manos WHERE mesa=$1 ORDER BY numero DESC LIMIT 1", [id]);
    if (!fila) {
      if (comando) throw new ErrorPeticion(409, "Actualizá la mesa para recibir tu mano.");
      return { cambio: true, partida: await repartir(db, mesa, 1, 1, [0, 0]) };
    }
    const estado = restaurar(fila);
    if (!comando) return { cambio: false, partida: vista(estado, fila.numero, fila.version, asiento) };
    if (comando.version !== fila.version) throw new ErrorPeticion(409, "La mesa cambió. Actualizá la partida.");
    const version = fila.version + 1;
    let partida;
    if (comando.operacion === "siguiente") {
      const puntos = tantos(estado);
      if (!estado.resultado || ganador(puntos) !== null) throw new ErrorPeticion(409, "No corresponde repartir otra mano.");
      const dador = (fila.reparto.dador + 1) % mesa.asientos.length;
      partida = await repartir(db, mesa, fila.numero + 1, version, puntos, dador);
    } else {
      const paso = aplicarOnline(estado, comando.accion!);
      if (!paso.ok) throw new ErrorPeticion(409, "La acción no está permitida en este turno.");
      const siguiente = jugarComputadoras(paso.estado, mesa);
      await db.query("UPDATE juego.manos SET version=$3, acciones=$4 WHERE mesa=$1 AND numero=$2",
        [id, fila.numero, version, JSON.stringify(siguiente.acciones)]);
      partida = vista(siguiente, fila.numero, version, asiento);
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
