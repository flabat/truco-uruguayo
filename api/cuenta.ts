import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { jugadorDeSesion } from "./auth.ts";
import { responderJson } from "./http.ts";
import { retirarJugador } from "./retiro.ts";
import { nombreSesion, origenValido } from "./sesion.ts";

export const rutaEliminarCuenta = "/api/cuenta/eliminar";

/**
 * Empieza la baja: cierra todas las sesiones, saca al jugador de sus mesas y deja 30 días para arrepentirse.
 * Devuelve el vencimiento; un pedido repetido conserva el del primero. La usan el perfil y las notificaciones de Apple.
 */
export function crearInicioBaja(pool: Pool, cerrarConexiones: (jugador: string) => void, alCambiar: (mesa: string) => void) {
  return async function iniciarBaja(jugador: string): Promise<Date> {
    const db = await pool.connect();
    let vence: Date;
    let mesas: string[];
    try {
      await db.query("BEGIN");
      await db.query("INSERT INTO juego.bajas (jugador) VALUES ($1) ON CONFLICT (jugador) DO NOTHING", [jugador]);
      ({ rows: [{ vence }] } = await db.query("SELECT vence FROM juego.bajas WHERE jugador = $1", [jugador]));
      await db.query("DELETE FROM juego.sesiones WHERE jugador = $1", [jugador]);
      await db.query("DELETE FROM juego.canjes WHERE jugador = $1", [jugador]);
      mesas = await retirarJugador(db, jugador);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
    cerrarConexiones(jugador);
    for (const mesa of mesas) alCambiar(mesa);
    return vence;
  };
}

/** Pedido de eliminación desde el perfil, con la sesión del jugador. */
export function crearCuenta(pool: Pool, web: URL, iniciarBaja: (jugador: string) => Promise<Date>) {
  return async function cuenta(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return responderJson(res, 405, { error: "Método no permitido." });
    }
    const jugador = await jugadorDeSesion(pool, req);
    if (!jugador) return responderJson(res, 401, { error: "Ingresá para eliminar tu cuenta." });
    if (!origenValido(req, web)) return responderJson(res, 403, { error: "El origen no corresponde al juego." });
    const vence = await iniciarBaja(jugador.id);
    res.setHeader("Set-Cookie", nombreSesion + "=; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=0" + (web.protocol === "https:" ? "; Secure" : ""));
    responderJson(res, 200, { vence: vence.toISOString() });
  };
}
