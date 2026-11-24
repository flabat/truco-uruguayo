import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { jugadorDeSesion } from "./auth.ts";
import { responderJson } from "./http.ts";
import { retirarJugador } from "./retiro.ts";
import { nombreSesion, origenValido } from "./sesion.ts";

export const rutaEliminarCuenta = "/api/cuenta/eliminar";

/** Pedido de eliminación: cierra todas las sesiones, saca al jugador de sus mesas y deja 30 días para arrepentirse. */
export function crearCuenta(pool: Pool, web: URL, cerrarConexiones: (jugador: string) => void, alCambiar: (mesa: string) => void) {
  return async function cuenta(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return responderJson(res, 405, { error: "Método no permitido." });
    }
    const jugador = await jugadorDeSesion(pool, req);
    if (!jugador) return responderJson(res, 401, { error: "Ingresá para eliminar tu cuenta." });
    if (!origenValido(req, web)) return responderJson(res, 403, { error: "El origen no corresponde al juego." });
    const db = await pool.connect();
    let vence: Date;
    let mesas: string[];
    try {
      await db.query("BEGIN");
      // Un pedido repetido conserva la fecha del primero.
      await db.query("INSERT INTO juego.bajas (jugador) VALUES ($1) ON CONFLICT (jugador) DO NOTHING", [jugador.id]);
      ({ rows: [{ vence }] } = await db.query("SELECT vence FROM juego.bajas WHERE jugador = $1", [jugador.id]));
      await db.query("DELETE FROM juego.sesiones WHERE jugador = $1", [jugador.id]);
      await db.query("DELETE FROM juego.canjes WHERE jugador = $1", [jugador.id]);
      mesas = await retirarJugador(db, jugador.id);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
    cerrarConexiones(jugador.id);
    for (const mesa of mesas) alCambiar(mesa);
    res.setHeader("Set-Cookie", nombreSesion + "=; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=0" + (web.protocol === "https:" ? "; Secure" : ""));
    responderJson(res, 200, { vence: vence.toISOString() });
  };
}
