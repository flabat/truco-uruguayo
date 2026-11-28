import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool, PoolClient } from "pg";
import type { EdicionModelo } from "../src/lib/modelos.ts";
import { signalVersionFor, teamSignalsVersion, versions, type Format } from "../training/contracts/index.ts";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import { politicaPie } from "@eltruco/motor/bot-pie.ts";
import { politicaPieParejas } from "@eltruco/motor/modelo-pie.ts";
import { esMetaDeChico, metaPorModalidad } from "@eltruco/motor/chico.ts";
import { versionReglasOnline, versionReglasTercetos } from "@eltruco/motor/mesa-online.ts";
import { FalloDiscord } from "./discord.ts";
import type { crearVoz } from "./voz-discord.ts";
import { permiteTercetos, exigirTercetos } from "./funciones.ts";
import { jugadorDeSesion } from "./auth.ts";
import { origenValido } from "./sesion.ts";
import { ErrorPeticion, leerJson, responderJson } from "./http.ts";

type Modo = "1v1" | "2v2" | "3v3";
export type FormatoMesa = Format | "triples";
export const politicaTercetos = "tercetos-basica-v1";
export const perfilTercetos = "tercetos-v1";
interface RegistroMesa {
  id: string;
  modo: Modo;
  creador: string;
  invitacion: string;
  cancelada: Date | null;
}
interface AsientoVista {
  asiento: number;
  equipo: number;
  tipo: "vacio" | "humano" | "computadora";
  nombre: string | null;
  /** Humano para las reglas, jugado por una computadora porque su jugador dejó el juego. */
  cedido?: true;
}
export interface VistaMesa {
  id: string;
  modo: Modo;
  meta: number;
  publica: boolean;
  cancelada: boolean;
  creadorId: string;
  formato: FormatoMesa;
  versionReglas: number;
  versionSenas?: string;
  politica: string;
  edicionModelo?: EdicionModelo;
  miAsiento: number;
  invitacion: string;
  lista: boolean;
  asientos: AsientoVista[];
}

const capacidad: Record<Modo, number> = { "1v1": 2, "2v2": 4, "3v3": 6 };
const esId = (id: string) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
const rutaMesa = /^\/api\/mesas\/([^/]+)(\/computadoras|\/voz)?$/;
const rutaInvitacion = /^\/api\/invitaciones\/([^/]+)(\/unirse)?$/;

export function esRutaMesas(pathname: string) {
  return pathname === "/api/modalidades" || pathname === "/api/mesas" || rutaMesa.test(pathname) || rutaInvitacion.test(pathname);
}

export async function leerMesa(db: Pool | PoolClient, id: string, jugadorId: string, web: URL): Promise<VistaMesa | null> {
  if (!esId(id)) return null;
  const { rows } = await db.query(`
    SELECT m.id, m.modo, m.meta, m.publica, m.cancelada, m.perfil_tercetos, m.creador, m.invitacion, m.version_senas, m.politica, propio.asiento AS mio,
           p.nombre AS nombre_modelo, to_char(p.publicada_el, 'YYYY-MM-DD') AS fecha_modelo,
           a.asiento, a.computadora, a.cedido, j.nombre
      FROM juego.mesas m
      JOIN juego.asientos propio ON propio.mesa = m.id AND propio.jugador = $2 AND NOT propio.cedido AND propio.salida IS NULL
      JOIN juego.asientos a ON a.mesa = m.id
      LEFT JOIN juego.jugadores j ON j.id = a.jugador
      LEFT JOIN juego.publicaciones_modelo p ON p.pin = m.politica
     WHERE m.id = $1
     ORDER BY a.asiento
  `, [id, jugadorId]);
  if (rows.length === 0) return null;
  const mesa = rows[0];
  verificarPerfil(mesa.modo, mesa.perfil_tercetos);
  const asientos: AsientoVista[] = Array.from({ length: capacidad[mesa.modo as Modo] }, (_, asiento) => {
    const ocupado = rows.find(row => row.asiento === asiento);
    const computadora = ocupado?.computadora || ocupado?.cedido;
    const tipo = !ocupado ? "vacio" : computadora ? "computadora" : "humano";
    return {
      asiento, equipo: asiento % 2, tipo,
      nombre: computadora ? `Computadora ${asiento + 1}` : ocupado?.nombre ?? null,
      ...(ocupado?.cedido && { cedido: true as const }),
    };
  });
  const enlace = new URL("/jugar/", web);
  enlace.searchParams.set("invitacion", mesa.invitacion);
  return {
    id: mesa.id, modo: mesa.modo, meta: mesa.meta, formato: formatoMesa(mesa.modo, mesa.version_senas),
    versionReglas: mesa.modo === "3v3" ? versionReglasTercetos : versionReglasOnline, politica: mesa.politica,
    ...(mesa.version_senas && { versionSenas: mesa.version_senas }),
    edicionModelo: mesa.nombre_modelo == null ? undefined : { nombre: mesa.nombre_modelo, publicado: mesa.fecha_modelo },
    publica: mesa.publica, cancelada: mesa.cancelada !== null, creadorId: mesa.creador, miAsiento: mesa.mio, invitacion: enlace.href, lista: rows.length === asientos.length, asientos,
  };
}

type Salida = "abandonada" | "desconectada";

/**
 * Por qué alguien que tuvo asiento ya no ve la mesa: abandonó, lo reemplazaron, el rival cobró la partida
 * o se dio de baja. Una desconexión sin asiento cedido cerró la mesa: nadie lo reemplazó.
 */
export function textoDeSalida(asiento: { cedido: boolean; salida: Salida | null }) {
  if (asiento.salida === "abandonada") return "Abandonaste esta partida.";
  if (asiento.salida === "desconectada") {
    return asiento.cedido ? "Una computadora te reemplazó porque te desconectaste." : "Tu rival cobró la partida porque te desconectaste.";
  }
  return asiento.cedido ? "Una computadora juega tu asiento en esta mesa." : null;
}

/** Si el jugador salió de la mesa por abandono o desconexión, responde 409 con el motivo. */
export async function exigirSinSalida(db: Pool | PoolClient, mesa: string, jugador: string) {
  if (!esId(mesa)) return;
  const { rows: [propio] } = await db.query("SELECT cedido, salida FROM juego.asientos WHERE mesa=$1 AND jugador=$2", [mesa, jugador]);
  if (propio?.salida) throw new ErrorPeticion(409, textoDeSalida(propio)!);
}

export function verificarPerfil(modo: Modo, perfil: string | null) {
  if (modo === "3v3" && perfil !== perfilTercetos) {
    throw new ErrorPeticion(503, "Esta mesa requiere otra versión del árbitro de tercetos.");
  }
}

interface Cambio { id: string; cambiado: boolean }
export function formatoMesa(modo: "1v1" | "2v2", versionSenas: string | null): Format;
export function formatoMesa(modo: "3v3", versionSenas: string | null): "triples";
export function formatoMesa(modo: Modo, versionSenas: string | null): FormatoMesa;
export function formatoMesa(modo: Modo, versionSenas: string | null): FormatoMesa {
  if (!versionSenas) {
    if (modo === "3v3") return "triples";
    return modo === "1v1" ? "duel" : "pairs";
  }
  if (versionSenas === versionSenasPie && modo === "3v3") return "triples";
  if (versionSenas === versionSenasPie && modo === "2v2") return "pairs-private-senas";
  if (modo === "2v2" && versionSenas === versions.signals) return "pairs-senas";
  if (modo === "2v2" && versionSenas === teamSignalsVersion) return "pairs-private-senas";
  throw new Error("Versión de señas desconocida.");
}

const altasPie = (tercetos: boolean): Modo[] => [
  ...(process.env.SENAS_PIE_PAREJAS === "0" ? [] : ["2v2" as const]),
  ...(tercetos && process.env.SENAS_PIE_TERCETOS !== "0" ? ["3v3" as const] : []),
];

async function crear(db: PoolClient, jugador: string, datos: Record<string, unknown>, salonHabilitado: boolean): Promise<Cambio> {
  const { modo, formato, meta: metaElegida, publica = false } = datos;
  if (typeof publica !== "boolean" || (publica && modo === "3v3")) {
    throw new ErrorPeticion(400, "Solo duelo y parejas admiten una mesa pública. Indicá la visibilidad con verdadero o falso.");
  }
  if (publica && !salonHabilitado) throw new ErrorPeticion(409, "El salón está cerrado. Podés crear una mesa privada.");
  if (modo !== "1v1" && modo !== "2v2" && modo !== "3v3") throw new ErrorPeticion(400, "Modalidad de mesa desconocida.");
  if (modo === "3v3") await exigirTercetos(db, jugador);
  const meta = metaElegida === undefined ? metaPorModalidad[modo] : metaElegida;
  if (!esMetaDeChico(meta)) throw new ErrorPeticion(400, "Elegí un puntaje par válido para el chico.");
  let nueva = formatoMesa(modo, null);
  // Los clientes históricos también crean mesas con señas de equipo.
  if (modo === "2v2" && (formato === "pairs-private-senas" || formato === "pairs-senas")) nueva = "pairs-private-senas";
  else if (formato !== undefined && formato !== nueva) {
    throw new ErrorPeticion(400, "El formato debe corresponder a la capacidad de la mesa.");
  }
  const alPie = datos.versionSenas === versionSenasPie;
  if (datos.versionSenas !== undefined && (!alPie || (nueva !== "pairs-private-senas" && nueva !== "triples"))) {
    throw new ErrorPeticion(400, "La versión de señas no corresponde a esta mesa.");
  }
  if (alPie && !altasPie(true).includes(modo)) throw new ErrorPeticion(409, "Las señas al pie están deshabilitadas en esta modalidad.");
  const versionSenas = alPie ? versionSenasPie : nueva === "triples" ? null : signalVersionFor(nueva);
  const mejorada = modo === "2v2" && meta >= 20 && meta <= 80 && process.env.MODELO_PIE_PAREJAS !== "0";
  // Un actor aprendido activado al pie (policyctl.ts, claves pairs-pie y triples-pie) reemplaza a la política fija.
  const aprendidaPie = alPie && (modo === "3v3" || mejorada) ? (await db.query<{ pin: string }>(
    "SELECT pin FROM juego.activaciones WHERE formato=$1", [modo === "3v3" ? "triples-pie" : "pairs-pie"])).rows[0]?.pin : undefined;
  const politicaAlPie = aprendidaPie ?? (mejorada ? politicaPieParejas : politicaPie);
  const politica = alPie ? politicaAlPie : modo === "3v3" ? politicaTercetos : null;
  const token = randomBytes(24).toString("base64url");
  const { rows: [mesa] } = await db.query(`INSERT INTO juego.mesas (modo, creador, invitacion, version_senas, meta, politica, perfil_tercetos, publica) VALUES ($1,$2,$3,$4,$5,
    COALESCE($7, (SELECT pin FROM juego.activaciones WHERE formato=$6), 'incumbent-online-v1'), $8, $9) RETURNING id`,
    [modo, jugador, token, versionSenas, meta, nueva,
      politica, modo === "3v3" ? perfilTercetos : null, publica]);
  await db.query("INSERT INTO juego.asientos (mesa, asiento, jugador, computadora) VALUES ($1,0,$2,false)", [mesa.id, jugador]);
  return { id: mesa.id, cambiado: true };
}

async function unir(db: PoolClient, jugador: string, token: string): Promise<Cambio> {
  const { rows: [mesa] } = await db.query<RegistroMesa>("SELECT * FROM juego.mesas WHERE invitacion=$1 FOR UPDATE", [token]);
  if (!mesa) throw new ErrorPeticion(404, "La invitación no es válida.");
  if (mesa.cancelada) throw new ErrorPeticion(409, "La mesa se canceló.");
  const { rows } = await db.query("SELECT asiento, jugador, cedido, salida FROM juego.asientos WHERE mesa=$1", [mesa.id]);
  const propio = rows.find(a => a.jugador === jugador);
  const salida = propio && textoDeSalida(propio);
  if (salida) throw new ErrorPeticion(409, salida);
  if (propio) return { id: mesa.id, cambiado: false };
  if (mesa.modo === "3v3") await exigirTercetos(db, jugador);
  const libres = Array.from({ length: capacidad[mesa.modo] }, (_, i) => i);
  const asiento = libres.find(i => !rows.some(a => a.asiento === i));
  if (asiento === undefined) throw new ErrorPeticion(409, "La mesa ya está completa.");
  await db.query("INSERT INTO juego.asientos (mesa, asiento, jugador, computadora) VALUES ($1,$2,$3,false)", [mesa.id, asiento, jugador]);
  return { id: mesa.id, cambiado: true };
}

async function agregarComputadora(db: PoolClient, id: string, jugador: string, asiento: unknown): Promise<Cambio> {
  if (!esId(id)) throw new ErrorPeticion(404, "No se encontró la mesa.");
  const { rows: [mesa] } = await db.query<RegistroMesa>(`
    SELECT m.* FROM juego.mesas m WHERE m.id=$1
    AND EXISTS (SELECT 1 FROM juego.asientos a WHERE a.mesa=m.id AND a.jugador=$2) FOR UPDATE
  `, [id, jugador]);
  if (!mesa) throw new ErrorPeticion(404, "No se encontró la mesa.");
  if (mesa.cancelada) throw new ErrorPeticion(409, "La mesa se canceló.");
  if (mesa.creador !== jugador) throw new ErrorPeticion(403, "Solo quien creó la mesa puede sumar computadoras.");
  if (typeof asiento !== "number" || !Number.isInteger(asiento) || asiento < 0 || asiento >= capacidad[mesa.modo]) {
    throw new ErrorPeticion(400, "Ese asiento no pertenece a la mesa.");
  }
  const { rows: [ocupante] } = await db.query("SELECT computadora FROM juego.asientos WHERE mesa=$1 AND asiento=$2", [id, asiento]);
  if (ocupante?.computadora) return { id, cambiado: false };
  if (ocupante) throw new ErrorPeticion(409, "El asiento ya está ocupado.");
  await db.query("INSERT INTO juego.asientos (mesa, asiento, computadora) VALUES ($1,$2,true)", [id, asiento]);
  return { id, cambiado: true };
}

export function crearRutasMesas(pool: Pool, web: URL, alCambiar: (mesaId: string) => void = () => {}, voz?: ReturnType<typeof crearVoz>, salonHabilitado = false) {
  return async function mesas(req: IncomingMessage, res: ServerResponse) {
    try {
      const path = (req.url ?? "").split("?")[0];
      if (path === "/api/modalidades") {
        if (req.method !== "GET") throw new ErrorPeticion(405, "Método no permitido.");
        const jugador = await jugadorDeSesion(pool, req);
        const tercetos = jugador && await permiteTercetos(pool, jugador.id);
        responderJson(res, 200, { modos: tercetos ? ["1v1", "2v2", "3v3"] : ["1v1", "2v2"], senasPie: altasPie(tercetos === true) });
        return;
      }
      const mesa = rutaMesa.exec(path);
      const invitacion = rutaInvitacion.exec(path);
      const jugador = await jugadorDeSesion(pool, req);
      if (!jugador) throw new ErrorPeticion(401, "Ingresá al juego para usar una mesa.");

      if (invitacion && !invitacion[2]) {
        if (req.method !== "GET") throw new ErrorPeticion(405, "Método no permitido.");
        const { rows: [info] } = await pool.query(`
          SELECT m.publica, m.modo, a.mesa AS id FROM juego.mesas m
          LEFT JOIN juego.asientos a ON a.mesa=m.id AND a.jugador=$2
          WHERE m.invitacion=$1`, [invitacion[1], jugador.id]);
        if (!info) throw new ErrorPeticion(404, "La invitación no es válida.");
        if (!info.id && info.modo === "3v3") await exigirTercetos(pool, jugador.id);
        responderJson(res, 200, { publica: info.publica, sentada: Boolean(info.id), ...(info.id && { id: info.id }) });
        return;
      }
      if (req.method === "GET" && mesa && !mesa[2]) {
        const vista = await leerMesa(pool, mesa[1], jugador.id, web);
        if (!vista) await exigirSinSalida(pool, mesa[1], jugador.id);
        if (!vista) throw new ErrorPeticion(404, "No se encontró tu mesa.");
        responderJson(res, 200, { ...vista, vozDisponible: Boolean(voz) });
        return;
      }
      if (req.method !== "POST" || (mesa && !mesa[2])) throw new ErrorPeticion(405, "Método no permitido.");
      if (!origenValido(req, web)) throw new ErrorPeticion(403, "El origen no corresponde al juego.");
      if (mesa?.[2] === "/voz") {
        const vista = await leerMesa(pool, mesa[1], jugador.id, web);
        if (!vista) throw new ErrorPeticion(404, "No se encontró tu mesa.");
        if (!voz) throw new ErrorPeticion(503, "La voz con Discord está desactivada.");
        responderJson(res, 200, await voz.abrir(vista.id, vista.modo));
        return;
      }
      const datos = invitacion ? {} : await leerJson(req);
      const db = await pool.connect();
      let cambio: Cambio;
      let vista: VistaMesa | null;
      try {
        await db.query("BEGIN");
        if (invitacion) cambio = await unir(db, jugador.id, invitacion[1]);
        else if (mesa) cambio = await agregarComputadora(db, mesa[1], jugador.id, datos.asiento);
        else cambio = await crear(db, jugador.id, datos, salonHabilitado);
        vista = await leerMesa(db, cambio.id, jugador.id, web);
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      } finally {
        db.release();
      }
      if (cambio.cambiado) alCambiar(cambio.id);
      responderJson(res, path === "/api/mesas" ? 201 : 200, vista);
    } catch (error) {
      if (!(error instanceof ErrorPeticion)) throw error;
      if (error instanceof FalloDiscord && error.espera) res.setHeader("Retry-After", String(error.espera));
      responderJson(res, error.status, { error: error.message });
    }
  };
}
