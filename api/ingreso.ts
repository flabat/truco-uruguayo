// Los pasos del ingreso que comparten el retorno del proveedor de identidad y el ingreso de prueba (AUTH_DEV).
// Sin dependencias del cliente OIDC para probarlos con node --test.
import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { hash } from "./sesion.ts";

export const secreto = () => randomBytes(32).toString("base64url");
export const diasSiete = 604800;

type Consultas = Pick<Pool, "query">;

/**
 * Crea o actualiza el jugador de la identidad. Volver a ingresar dentro de los 30 días cancela la baja.
 * `null` si la baja ya venció y la cuenta se está borrando.
 */
export async function registrarJugador(pool: Consultas, emisor: string, sujeto: string, nombre: string) {
  const { rows: [jugador] } = await pool.query<{ id: string }>(`
    INSERT INTO juego.jugadores (emisor, sujeto, nombre) VALUES ($1,$2,$3)
    ON CONFLICT (emisor, sujeto) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id
  `, [emisor, sujeto, nombre]);
  const { rows: [baja] } = await pool.query("SELECT vence > now() AS vigente FROM juego.bajas WHERE jugador = $1", [jugador.id]);
  const cancelada = Boolean(baja) && (await pool.query(
    "DELETE FROM juego.bajas WHERE jugador = $1 AND vence > now()", [jugador.id])).rowCount === 1;
  if (baja && !cancelada) return null;
  return { id: jugador.id, cancelada };
}

/** La app recibe un código de un solo uso, inútil sin el verificador que nunca salió del teléfono. */
export async function emitirCanje(pool: Consultas, jugador: string, desafio: string, cancelada: boolean) {
  const codigo = secreto();
  await pool.query("INSERT INTO juego.canjes (clave, jugador, desafio, baja_cancelada) VALUES ($1,$2,$3,$4)",
    [hash(codigo), jugador, desafio, cancelada]);
  return codigo;
}

/** La sesión anterior de este navegador se reemplaza en el mismo commit que crea la nueva. Devuelve la cookie. */
export async function abrirSesionWeb(pool: Consultas, claveAnterior: string, jugador: string) {
  const handle = secreto();
  await pool.query(`
    WITH anterior AS (DELETE FROM juego.sesiones WHERE clave = $1)
    INSERT INTO juego.sesiones (clave, jugador) VALUES ($2, $3)
  `, [claveAnterior, hash(handle), jugador]);
  return handle;
}
