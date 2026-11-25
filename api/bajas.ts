import { createCipheriv, createDecipheriv, createPrivateKey, randomBytes, sign } from "node:crypto";
import type { Pool } from "pg";

/** Lo que una baja necesita fuera de la base. Cada paso es idempotente. */
export interface ServiciosBaja {
  /** Borra el usuario de Keycloak; si ya no existe, no es un error. */
  borrarUsuario(sujeto: string): Promise<void>;
  /** El refresh token de Apple guardado al ingresar, si el jugador usó Apple. */
  tokenApple(jugador: string): Promise<string | null>;
  /** Revoca el token en Apple, como exige Apple al eliminar una cuenta. */
  revocarApple(token: string): Promise<void>;
}

export interface ConfigApple { clientId: string; teamId: string; keyId: string; privateKey: string }

// AES-256-GCM: vector (12) | etiqueta (16) | texto cifrado, en base64.
export function cifrar(texto: string, clave: Buffer): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", clave, iv);
  const cuerpo = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
  return Buffer.concat([iv, cifrador.getAuthTag(), cuerpo]).toString("base64");
}

export function descifrar(cifrado: string, clave: Buffer): string {
  const bytes = Buffer.from(cifrado, "base64");
  const descifrador = createDecipheriv("aes-256-gcm", clave, bytes.subarray(0, 12));
  descifrador.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([descifrador.update(bytes.subarray(28)), descifrador.final()]).toString("utf8");
}

/** `client_secret` de Apple: JWT ES256 firmado con la clave .p8, válido 5 minutos. */
export function jwtRevocacion({ clientId, teamId, keyId, privateKey }: ConfigApple, ahora = Math.floor(Date.now() / 1000)): string {
  const parte = (valor: object) => Buffer.from(JSON.stringify(valor)).toString("base64url");
  const firmado = parte({ alg: "ES256", kid: keyId }) + "." +
    parte({ iss: teamId, sub: clientId, aud: "https://appleid.apple.com", iat: ahora, exp: ahora + 300 });
  const firma = sign("sha256", Buffer.from(firmado), { key: createPrivateKey(privateKey), dsaEncoding: "ieee-p1363" });
  return firmado + "." + firma.toString("base64url");
}

/** Keycloak guarda la respuesta del proveedor tal como llegó: JSON o formulario. */
export function refreshDeRespuesta(guardada: string): string | null {
  try {
    const datos = JSON.parse(guardada);
    return typeof datos?.refresh_token === "string" ? datos.refresh_token : null;
  } catch {
    return new URLSearchParams(guardada).get("refresh_token");
  }
}

/**
 * Completa una baja vencida: revoca Apple, borra el usuario de Keycloak y, en una sola transacción,
 * borra lo personal y deja la fila del jugador como marcador anónimo para el historial de los demás.
 * Si un paso externo falla devuelve `false` sin tocar la base: la próxima pasada reintenta.
 */
export async function completarBaja(pool: Pool, jugador: string, servicios: ServiciosBaja): Promise<boolean> {
  const { rows: [fila] } = await pool.query<{ emisor: string; sujeto: string }>(
    "SELECT emisor, sujeto FROM juego.jugadores WHERE id = $1", [jugador]);
  if (!fila) return false;
  if (fila.emisor !== "eliminado") {
    try {
      const token = await servicios.tokenApple(jugador);
      if (token) await servicios.revocarApple(token);
      await servicios.borrarUsuario(fila.sujeto);
    } catch (error) {
      console.warn("No se pudo completar una baja vencida; se reintenta más tarde:", error instanceof Error ? error.message : error);
      return false;
    }
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    for (const tabla of ["reporteros", "sesiones", "canjes", "tokens_apple"]) {
      await db.query(`DELETE FROM juego.${tabla} WHERE jugador = $1`, [jugador]);
    }
    await db.query(`UPDATE juego.jugadores SET nombre = 'Jugador', emisor = 'eliminado', sujeto = gen_random_uuid()::text
      WHERE id = $1 AND emisor <> 'eliminado'`, [jugador]);
    await db.query("DELETE FROM juego.bajas WHERE jugador = $1", [jugador]);
    await db.query("COMMIT");
    return true;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

/** Recorre las bajas vencidas cada `cadaMs`. Devuelve la función que la detiene. */
export function procesarBajas(pool: Pool, servicios: ServiciosBaja, cadaMs = 3_600_000): () => void {
  let enCurso = false;
  async function pasada() {
    if (enCurso) return;
    enCurso = true;
    try {
      const { rows } = await pool.query<{ jugador: string }>(
        "SELECT jugador FROM juego.bajas WHERE vence <= now() ORDER BY vence LIMIT 20");
      for (const { jugador } of rows) await completarBaja(pool, jugador, servicios);
    } catch (error) {
      console.warn("La tarea de bajas falló:", error instanceof Error ? error.message : error);
    } finally {
      enCurso = false;
    }
  }
  void pasada();
  const intervalo = setInterval(() => void pasada(), cadaMs);
  intervalo.unref();
  return () => clearInterval(intervalo);
}

function configApple(env: NodeJS.ProcessEnv): ConfigApple | null {
  const { APPLE_CLIENT_ID: clientId, APPLE_TEAM_ID: teamId, APPLE_KEY_ID: keyId, APPLE_PRIVATE_KEY: privateKey } = env;
  return clientId && teamId && keyId && privateKey ? { clientId, teamId, keyId, privateKey } : null;
}

function claveTokens(env: NodeJS.ProcessEnv): Buffer | null {
  const clave = env.APPLE_TOKENS_KEY ? Buffer.from(env.APPLE_TOKENS_KEY, "base64") : null;
  if (clave && clave.length !== 32) throw new Error("APPLE_TOKENS_KEY debe ser una clave de 32 bytes en base64.");
  return clave;
}

/** Sin el secreto del cliente de servicio `truco-api` no hay bajas que completar: devuelve `null`. */
export function crearServiciosBaja(env: NodeJS.ProcessEnv, pool: Pool): ServiciosBaja | null {
  const secreto = env.KEYCLOAK_API_CLIENT_SECRET;
  if (!secreto || !env.OIDC_BACKEND) return null;
  const backend = new URL(env.OIDC_BACKEND);
  const realm = backend.pathname.split("/").filter(Boolean).at(-1)!;
  // La administración de Keycloak no es pública: en producción se usa la dirección interna.
  const base = (env.KEYCLOAK_ADMIN_URL ?? backend.origin).replace(/\/$/, "");
  const apple = configApple(env);
  const clave = claveTokens(env);
  const revocar = env.APPLE_REVOKE_URL ?? "https://appleid.apple.com/auth/revoke";

  async function tokenServicio() {
    const respuesta = await fetch(`${base}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: "truco-api", client_secret: secreto }),
    });
    if (!respuesta.ok) throw new Error(`Keycloak rechazó el cliente de servicio (${respuesta.status}).`);
    return (await respuesta.json()).access_token as string;
  }

  return {
    async borrarUsuario(sujeto) {
      const respuesta = await fetch(`${base}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(sujeto)}`, {
        method: "DELETE", headers: { authorization: "Bearer " + await tokenServicio() },
      });
      if (respuesta.status !== 204 && respuesta.status !== 404) throw new Error(`Keycloak no borró el usuario (${respuesta.status}).`);
    },
    async tokenApple(jugador) {
      const { rows: [fila] } = await pool.query<{ token: string }>("SELECT token FROM juego.tokens_apple WHERE jugador = $1", [jugador]);
      if (!fila) return null;
      if (!clave) throw new Error("Falta APPLE_TOKENS_KEY para leer el token de Apple.");
      return descifrar(fila.token, clave);
    },
    async revocarApple(token) {
      if (!apple) throw new Error("Falta la configuración de Apple para revocar el token.");
      const respuesta = await fetch(revocar, {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: apple.clientId, client_secret: jwtRevocacion(apple), token, token_type_hint: "refresh_token" }),
      });
      // Un token ya inválido no necesita revocarse.
      if (respuesta.ok) return;
      const error = respuesta.status === 400 ? (await respuesta.json().catch(() => null))?.error : undefined;
      if (error !== "invalid_grant") throw new Error(`Apple no revocó el token (${respuesta.status}).`);
    },
  };
}

/**
 * Al ingresar con Apple, guarda cifrado el refresh token que Keycloak recibió de Apple, para poder revocarlo
 * si el jugador elimina su cuenta. Keycloak solo lo entrega al propio usuario, con su token de acceso.
 */
export function crearCapturaApple(env: NodeJS.ProcessEnv, pool: Pool, esperaMs = 3000): ((jugador: string, acceso: string) => Promise<void>) | null {
  const clave = claveTokens(env);
  if (!clave || !configApple(env) || !env.OIDC_BACKEND) return null;
  const url = env.OIDC_BACKEND.replace(/\/$/, "") + "/broker/apple/token";
  return async (jugador, acceso) => {
    // Corre en cada ingreso: un Keycloak lento no puede demorar el ingreso más de este plazo.
    const respuesta = await fetch(url, { headers: { authorization: "Bearer " + acceso }, signal: AbortSignal.timeout(esperaMs) });
    if (!respuesta.ok) return;
    const token = refreshDeRespuesta(await respuesta.text());
    if (!token) return;
    await pool.query(`INSERT INTO juego.tokens_apple (jugador, token) VALUES ($1, $2)
      ON CONFLICT (jugador) DO UPDATE SET token = EXCLUDED.token, actualizado = now()`, [jugador, cifrar(token, clave)]);
  };
}
