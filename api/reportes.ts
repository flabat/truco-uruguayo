import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool, PoolClient } from "pg";
import { jugadorDeSesion } from "./auth.ts";
import { ErrorPeticion, leerCuerpo } from "./http.ts";
import { prepararReporte, type CursorReporte } from "./reporte-contexto.ts";

export const rutaReporte = /^\/api\/mesas\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\/reportes$/i;
const campos = new Set(["mano", "posicion", "vuelta", "puntos", "fase", "cliente", "voz", "duelo"]);
const maxEntero = 2_147_483_647;

function numero(texto: string | null, minimo: number, maximo: number) {
  if (!texto || !/^(0|[1-9][0-9]{0,9})$/.test(texto) || Number(texto) < minimo || Number(texto) > maximo) {
    throw new ErrorPeticion(400, "La posición de la jugada es inválida.");
  }
  return Number(texto);
}

async function leerCursor(req: IncomingMessage): Promise<CursorReporte> {
  if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") {
    throw new ErrorPeticion(415, "Se esperaba el formulario de la mesa.");
  }
  const datos = new URLSearchParams(await leerCuerpo(req, 512));
  for (const nombre of datos.keys()) {
    if (!campos.has(nombre) || datos.getAll(nombre).length !== 1) {
      throw new ErrorPeticion(400, "El formulario de reporte es inválido.");
    }
  }
  const puntos = datos.get("puntos") ?? "";
  const fase = datos.get("fase");
  const cliente = datos.get("cliente") ?? "";
  if (!/^(0|[1-9][0-9]{0,9})-(0|[1-9][0-9]{0,9})$/.test(puntos) || puntos.split("-").some(p => Number(p) > maxEntero)
    || (fase !== "presentacion" && fase !== "jugada" && fase !== "resultado")
    || (cliente !== "" && !/^[a-f0-9]{40}$/.test(cliente))) {
    throw new ErrorPeticion(400, "Los datos de la pantalla son inválidos.");
  }
  return {
    mano: numero(datos.get("mano"), 1, maxEntero),
    posicion: numero(datos.get("posicion"), 0, maxEntero),
    vuelta: numero(datos.get("vuelta"), 1, 3),
    puntos, fase, cliente,
    voz: datos.get("voz") ? numero(datos.get("voz"), 0, 6) : undefined,
    duelo: datos.get("duelo") ? numero(datos.get("duelo"), 1, 3) : undefined,
  };
}

async function guardar(db: PoolClient, web: URL, jugador: string, mesa: string, cursor: CursorReporte) {
  const permiso = await db.query("SELECT 1 FROM juego.reporteros WHERE jugador = $1 FOR SHARE", [jugador]);
  if (!permiso.rowCount) throw new ErrorPeticion(403, "Tu cuenta no está habilitada para reportar.");
  const { rows: [propio] } = await db.query(
    "SELECT asiento FROM juego.asientos WHERE mesa = $1 AND jugador = $2 FOR SHARE", [mesa, jugador],
  );
  if (!propio) throw new ErrorPeticion(404, "No se encontró tu mesa.");

  const { mano, posicion, vuelta, puntos, fase, cliente, voz, duelo } = cursor;
  // Reintentos simultáneos del mismo formulario reciben la misma referencia, aun sin eventos históricos.
  const { rows: [reporte] } = await db.query(`
    INSERT INTO juego.reportes (mesa, mano, posicion, asiento, vuelta, puntos, fase, cliente, voz, duelo)
      SELECT mesa, numero, $3, $4, $5, $6, $7, $8, $9, $10 FROM juego.manos WHERE mesa = $1 AND numero = $2
      ON CONFLICT ON CONSTRAINT reportes_pantalla DO UPDATE SET id = reportes.id
      RETURNING id
  `, [mesa, mano, posicion, propio.asiento, vuelta, puntos, fase, cliente, voz, duelo]);
  const contexto = reporte && await prepararReporte(db, mesa, propio.asiento, cursor, web, reporte.id);
  if (!contexto) throw new ErrorPeticion(409, "No se encontró esa posición de la mano.");
  if (contexto.secuencia !== null) {
    await db.query("UPDATE juego.reportes SET secuencia = $1 WHERE id = $2 AND secuencia IS NULL", [contexto.secuencia, reporte.id]);
  }
  return contexto.url;
}

export async function atenderReporte(pool: Pool, web: URL, mesa: string, req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      throw new ErrorPeticion(405, "El reporte debe abrirse desde la mesa.");
    }
    if (req.headers.origin !== web.origin) throw new ErrorPeticion(403, "El origen no corresponde al juego.");
    const jugador = await jugadorDeSesion(pool, req);
    if (!jugador) throw new ErrorPeticion(401, "Ingresá al juego para reportar una jugada.");
    const cursor = await leerCursor(req);
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const url = await guardar(db, web, jugador.id, mesa, cursor);
      await db.query("COMMIT");
      res.writeHead(303, { Location: url }).end();
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    if (!(error instanceof ErrorPeticion)) throw error;
    res.writeHead(error.status, { "Content-Type": "text/plain; charset=utf-8" }).end(error.message);
  }
}
