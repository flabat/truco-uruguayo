import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool, PoolClient } from "pg";
import { signalVersionFor, teamSignalsVersion, versions, type Format } from "../training/contracts/index.ts";
import { esMetaDeChico, metaPorModalidad } from "../src/motor/chico.ts";
import { versionReglasOnline, versionReglasTercetos } from "../src/motor/mesa-online.ts";
import { FalloDiscord } from "./discord.ts";
import type { crearVoz } from "./voz-discord.ts";
import { jugadorDeSesion } from "./auth.ts";
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
}
interface AsientoVista {
  asiento: number;
  equipo: number;
  tipo: "vacio" | "humano" | "computadora";
  nombre: string | null;
}
export interface VistaMesa {
  id: string;
  modo: Modo;
  meta: number;
  creadorId: string;
  formato: FormatoMesa;
  versionReglas: number;
  politica: string;
  miAsiento: number;
  invitacion: string;
  lista: boolean;
  asientos: AsientoVista[];
}

const capacidad: Record<Modo, number> = { "1v1": 2, "2v2": 4, "3v3": 6 };
const esId = (id: string) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
const rutaMesa = /^\/api\/mesas\/([^/]+)(\/computadoras|\/voz)?$/;
const rutaInvitacion = /^\/api\/invitaciones\/([^/]+)\/unirse$/;

export function esRutaMesas(pathname: string) {
  return pathname === "/api/modalidades" || pathname === "/api/mesas" || rutaMesa.test(pathname) || rutaInvitacion.test(pathname);
}

export async function leerMesa(db: Pool | PoolClient, id: string, jugadorId: string, web: URL): Promise<VistaMesa | null> {
  if (!esId(id)) return null;
  const { rows } = await db.query(`
    SELECT m.id, m.modo, m.meta, m.perfil_tercetos, m.creador, m.invitacion, m.version_senas, m.politica, propio.asiento AS mio,
           a.asiento, a.computadora, j.nombre
      FROM juego.mesas m
      JOIN juego.asientos propio ON propio.mesa = m.id AND propio.jugador = $2
      JOIN juego.asientos a ON a.mesa = m.id
      LEFT JOIN juego.jugadores j ON j.id = a.jugador
     WHERE m.id = $1
     ORDER BY a.asiento
  `, [id, jugadorId]);
  if (rows.length === 0) return null;
  const mesa = rows[0];
  verificarPerfil(mesa.modo, mesa.perfil_tercetos);
  const asientos: AsientoVista[] = Array.from({ length: capacidad[mesa.modo as Modo] }, (_, asiento) => {
    const ocupado = rows.find(row => row.asiento === asiento);
    const tipo = !ocupado ? "vacio" : ocupado.computadora ? "computadora" : "humano";
    return {
      asiento, equipo: asiento % 2, tipo,
      nombre: ocupado?.computadora ? `Computadora ${asiento + 1}` : ocupado?.nombre ?? null,
    };
  });
  const enlace = new URL("/jugar/", web);
  enlace.searchParams.set("invitacion", mesa.invitacion);
  return {
    id: mesa.id, modo: mesa.modo, meta: mesa.meta, formato: formatoMesa(mesa.modo, mesa.version_senas),
    versionReglas: mesa.modo === "3v3" ? versionReglasTercetos : versionReglasOnline, politica: mesa.politica,
    creadorId: mesa.creador, miAsiento: mesa.mio, invitacion: enlace.href, lista: rows.length === asientos.length, asientos,
  };
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
  if (modo === "2v2" && versionSenas === versions.signals) return "pairs-senas";
  if (modo === "2v2" && versionSenas === teamSignalsVersion) return "pairs-private-senas";
  throw new Error("Versión de señas desconocida.");
}

async function crear(db: PoolClient, jugador: string, modo: unknown, formato: unknown, metaElegida: unknown, tercetos: boolean): Promise<Cambio> {
  if (modo !== "1v1" && modo !== "2v2" && modo !== "3v3") throw new ErrorPeticion(400, "Modalidad de mesa desconocida.");
  if (modo === "3v3" && !tercetos) throw new ErrorPeticion(400, "La creación de mesas de tercetos está deshabilitada.");
  const meta = metaElegida === undefined ? metaPorModalidad[modo] : metaElegida;
  if (!esMetaDeChico(meta)) throw new ErrorPeticion(400, "Elegí un puntaje par válido para el chico.");
  let nueva = formatoMesa(modo, null);
  // Los clientes históricos también crean mesas con señas de equipo.
  if (modo === "2v2" && (formato === "pairs-private-senas" || formato === "pairs-senas")) nueva = "pairs-private-senas";
  else if (formato !== undefined && formato !== nueva) {
    throw new ErrorPeticion(400, "El formato debe corresponder a la capacidad de la mesa.");
  }
  const token = randomBytes(24).toString("base64url");
  const { rows: [mesa] } = await db.query(`INSERT INTO juego.mesas (modo, creador, invitacion, version_senas, meta, politica, perfil_tercetos) VALUES ($1,$2,$3,$4,$5,
    COALESCE($7, (SELECT pin FROM juego.activaciones WHERE formato=$6), 'incumbent-online-v1'), $8) RETURNING id`,
    [modo, jugador, token, nueva === "triples" ? null : signalVersionFor(nueva), meta, nueva,
      modo === "3v3" ? politicaTercetos : null, modo === "3v3" ? perfilTercetos : null]);
  await db.query("INSERT INTO juego.asientos (mesa, asiento, jugador, computadora) VALUES ($1,0,$2,false)", [mesa.id, jugador]);
  return { id: mesa.id, cambiado: true };
}

async function unir(db: PoolClient, jugador: string, token: string): Promise<Cambio> {
  const { rows: [mesa] } = await db.query<RegistroMesa>("SELECT * FROM juego.mesas WHERE invitacion=$1 FOR UPDATE", [token]);
  if (!mesa) throw new ErrorPeticion(404, "La invitación no es válida.");
  const { rows } = await db.query("SELECT asiento, jugador FROM juego.asientos WHERE mesa=$1", [mesa.id]);
  if (rows.some(a => a.jugador === jugador)) return { id: mesa.id, cambiado: false };
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

export function crearRutasMesas(pool: Pool, web: URL, alCambiar: (mesaId: string) => void = () => {}, tercetos = false, voz?: ReturnType<typeof crearVoz>) {
  return async function mesas(req: IncomingMessage, res: ServerResponse) {
    try {
      const path = (req.url ?? "").split("?")[0];
      if (path === "/api/modalidades") {
        if (req.method !== "GET") throw new ErrorPeticion(405, "Método no permitido.");
        responderJson(res, 200, { modos: tercetos ? ["1v1", "2v2", "3v3"] : ["1v1", "2v2"] });
        return;
      }
      const mesa = rutaMesa.exec(path);
      const invitacion = rutaInvitacion.exec(path);
      const jugador = await jugadorDeSesion(pool, req);
      if (!jugador) throw new ErrorPeticion(401, "Ingresá al juego para usar una mesa.");

      if (req.method === "GET" && mesa && !mesa[2]) {
        const vista = await leerMesa(pool, mesa[1], jugador.id, web);
        if (!vista) throw new ErrorPeticion(404, "No se encontró tu mesa.");
        responderJson(res, 200, { ...vista, vozDisponible: Boolean(voz) });
        return;
      }
      if (req.method !== "POST" || (mesa && !mesa[2])) throw new ErrorPeticion(405, "Método no permitido.");
      if (req.headers.origin !== web.origin) throw new ErrorPeticion(403, "El origen no corresponde al juego.");
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
        else cambio = await crear(db, jugador.id, datos.modo, datos.formato, datos.meta, tercetos);
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
