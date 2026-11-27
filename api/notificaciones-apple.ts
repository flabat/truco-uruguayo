// Notificaciones de servidor a servidor de Sign in with Apple (#468). Apple avisa cuando alguien deja de usar
// su Apple ID con El Truco o elimina su cuenta de Apple. Sin dependencias del cliente OIDC para probarlo con node --test.
import { createPublicKey, verify, type KeyObject } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { adminKeycloak } from "./bajas.ts";
import { ErrorPeticion, leerCuerpo, responderJson } from "./http.ts";
import { hash } from "./sesion.ts";

export const rutaNotificacionesApple = "/api/auth/apple/notificaciones";

export const emisorApple = "https://appleid.apple.com";
/** El bundle de la app; Apple puede mandarlo como `aud` en lugar del Services ID. */
export const idDeLaApp = "co.eltru.app";
const antiguedadMaxima = 86_400; // Segundos: tolera una caída o un despliegue mientras Apple reintenta.
const tolerancia = 300; // Segundos de diferencia de reloj.

/** La firma, los claims o los eventos no valen: el endpoint responde 400. */
export class NotificacionInvalida extends Error {}

export interface EventoApple { tipo: string; sub: string; momento: string }

/** La clave pública de Apple con ese `kid`, o `null` si Apple no la publica. Lanza si no se pudieron bajar. */
export type ClavesApple = (kid: string) => Promise<KeyObject | null>;

/**
 * Las claves de `https://appleid.apple.com/auth/keys` en caché. Vuelve a bajarlas al vencer o ante un `kid` nuevo,
 * salvo dentro de `pausaMs` desde la última bajada: un `kid` inventado no dispara un pedido a Apple en cada aviso.
 * Si Apple no responde, sirven las claves ya bajadas aunque hayan vencido.
 */
export function crearClavesApple(url = emisorApple + "/auth/keys",
  { vigenciaMs = 86_400_000, pausaMs = 60_000, esperaMs = 5000 } = {}): ClavesApple {
  let claves = new Map<string, KeyObject>();
  let bajadas = -Infinity;
  let enCurso: Promise<void> | null = null;

  async function bajar() {
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(esperaMs) });
    if (!respuesta.ok) throw new Error(`Apple no entregó sus claves (${respuesta.status}).`);
    const { keys } = await respuesta.json() as { keys?: unknown };
    if (!Array.isArray(keys)) throw new Error("Apple entregó claves sin la lista keys.");
    const nuevas = new Map<string, KeyObject>();
    for (const clave of keys) {
      if (clave?.kty !== "RSA" || typeof clave.kid !== "string") continue;
      if ((clave.use ?? "sig") !== "sig" || (clave.alg ?? "RS256") !== "RS256") continue;
      nuevas.set(clave.kid, createPublicKey({ key: clave, format: "jwk" }));
    }
    claves = nuevas;
    bajadas = Date.now();
  }

  return async kid => {
    const edad = Date.now() - bajadas;
    if (edad < vigenciaMs && (claves.has(kid) || edad < pausaMs)) return claves.get(kid) ?? null;
    try {
      await (enCurso ??= bajar().finally(() => { enCurso = null; }));
    } catch (error) {
      if (claves.has(kid)) return claves.get(kid)!;
      throw error;
    }
    return claves.get(kid) ?? null;
  };
}

function parteJson(parte: string): Record<string, unknown> {
  try {
    const valor: unknown = JSON.parse(Buffer.from(parte, "base64url").toString("utf8"));
    if (typeof valor === "object" && valor !== null && !Array.isArray(valor)) return valor as Record<string, unknown>;
  } catch {
    // Se rechaza abajo.
  }
  throw new NotificacionInvalida("El JWS no es JSON.");
}

function eventoDe(events: unknown): EventoApple {
  let datos = events;
  if (typeof datos === "string") {
    try { datos = JSON.parse(datos); } catch { throw new NotificacionInvalida("events no es JSON."); }
  }
  const { type, sub, event_time } = (datos ?? {}) as Record<string, unknown>;
  const momentoValido = (typeof event_time === "number" && Number.isFinite(event_time))
    || (typeof event_time === "string" && /^\d+$/.test(event_time));
  if (typeof type !== "string" || !type || typeof sub !== "string" || !sub || !momentoValido) {
    throw new NotificacionInvalida("Al evento le falta type, sub o event_time.");
  }
  return { tipo: type, sub, momento: String(event_time) };
}

/** Verifica el JWS que manda Apple (RS256, `iss`, `aud`, `iat`) y devuelve su evento. */
export async function verificarNotificacion(jws: string,
  { claves, audiencias, ahora = Math.floor(Date.now() / 1000) }: { claves: ClavesApple; audiencias: string[]; ahora?: number }): Promise<EventoApple> {
  const partes = jws.split(".");
  if (partes.length !== 3 || partes.some(parte => !/^[\w-]*$/.test(parte))) throw new NotificacionInvalida("No es un JWS compacto.");
  const [cabecera, cuerpo] = partes.slice(0, 2).map(parteJson);
  if (cabecera.alg !== "RS256" || typeof cabecera.kid !== "string") throw new NotificacionInvalida("Solo vale RS256 con kid.");
  const clave = await claves(cabecera.kid);
  if (!clave) throw new NotificacionInvalida("Apple no publica esa clave.");
  let firmada = false;
  try {
    firmada = verify("sha256", Buffer.from(partes[0] + "." + partes[1]), clave, Buffer.from(partes[2], "base64url"));
  } catch {
    // Una firma mal formada no vale.
  }
  if (!firmada) throw new NotificacionInvalida("La firma no es de Apple.");
  if (cuerpo.iss !== emisorApple) throw new NotificacionInvalida("El emisor no es Apple.");
  const aud = Array.isArray(cuerpo.aud) ? cuerpo.aud : [cuerpo.aud];
  if (!aud.some(valor => typeof valor === "string" && audiencias.includes(valor))) throw new NotificacionInvalida("La notificación es para otra app.");
  const { iat, exp } = cuerpo;
  if (typeof iat !== "number" || iat > ahora + tolerancia || iat < ahora - antiguedadMaxima) throw new NotificacionInvalida("iat no es reciente.");
  if (typeof exp === "number" && exp < ahora - tolerancia) throw new NotificacionInvalida("La notificación venció.");
  return eventoDe(cuerpo.events);
}

/** Lo que una notificación necesita de Keycloak, con el cliente de servicio `truco-api`. */
export interface CuentasKeycloak {
  /** El usuario de Keycloak vinculado a ese `sub` de Apple, o `null`. */
  usuarioDeApple(sub: string): Promise<string | null>;
  /** Si puede entrar sin Apple: otro proveedor vinculado o una contraseña. */
  tieneOtroIngreso(usuario: string): Promise<boolean>;
  desvincularApple(usuario: string): Promise<void>;
  cerrarSesiones(usuario: string): Promise<void>;
}

export function crearCuentasKeycloak(env: NodeJS.ProcessEnv): CuentasKeycloak | null {
  const pedir = adminKeycloak(env);
  if (!pedir) return null;
  const usuario = (id: string) => "/users/" + encodeURIComponent(id);
  async function leer<T>(ruta: string, que: string): Promise<T> {
    const respuesta = await pedir!(ruta);
    if (!respuesta.ok) throw new Error(`Keycloak no pudo ${que} (${respuesta.status}).`);
    return await respuesta.json() as T;
  }
  async function cambiar(ruta: string, method: string, que: string) {
    const respuesta = await pedir!(ruta, { method });
    // 404: el usuario o el vínculo ya no están, que es lo que se buscaba.
    if (respuesta.status !== 204 && respuesta.status !== 404) throw new Error(`Keycloak no pudo ${que} (${respuesta.status}).`);
  }
  return {
    async usuarioDeApple(sub) {
      const consulta = new URLSearchParams({ idpAlias: "apple", idpUserId: sub, briefRepresentation: "true" });
      const [encontrado] = await leer<{ id: string }[]>("/users?" + consulta, "buscar al usuario de Apple");
      return encontrado?.id ?? null;
    },
    async tieneOtroIngreso(id) {
      const vinculos = await leer<{ identityProvider: string }[]>(usuario(id) + "/federated-identity", "leer los vínculos");
      if (vinculos.some(vinculo => vinculo.identityProvider !== "apple")) return true;
      const credenciales = await leer<{ type: string }[]>(usuario(id) + "/credentials", "leer las credenciales");
      return credenciales.some(credencial => credencial.type === "password");
    },
    desvincularApple: id => cambiar(usuario(id) + "/federated-identity/apple", "DELETE", "quitar el vínculo con Apple"),
    cerrarSesiones: id => cambiar(usuario(id) + "/logout", "POST", "cerrar las sesiones"),
  };
}

export type ResultadoAviso = "sin-cambios" | "sin-jugador" | "repetido" | "consentimiento-revocado" | "apple-desvinculado" | "baja-iniciada";

interface OpcionesNotificaciones {
  /** El `iss` de Keycloak con el que se guardan los jugadores (`OIDC_ISSUER`). */
  emisor: string;
  /** La misma baja de 30 días que «Eliminar mi cuenta» (`crearInicioBaja`). */
  iniciarBaja: (jugador: string) => Promise<unknown>;
  cerrarConexiones: (jugador: string) => void;
  claves?: ClavesApple;
  cuentas?: CuentasKeycloak | null;
  alAplicar?: (resultado: ResultadoAviso) => void;
}

/**
 * `POST /api/auth/apple/notificaciones`. Responde 404 sin `APPLE_CLIENT_ID`, 400 si la notificación no vale y 200 si vale,
 * aunque no haya jugador. Si Keycloak o las claves de Apple fallan, el error llega a server.ts (503) y Apple puede reintentar:
 * cada paso se puede repetir, y el aviso se marca como aplicado recién al final.
 */
export function crearNotificacionesApple(pool: Pool, env: NodeJS.ProcessEnv, {
  emisor, iniciarBaja, cerrarConexiones,
  claves = crearClavesApple(env.APPLE_KEYS_URL), cuentas = crearCuentasKeycloak(env), alAplicar = () => {},
}: OpcionesNotificaciones) {
  const audiencias = env.APPLE_CLIENT_ID ? [env.APPLE_CLIENT_ID, idDeLaApp] : [];

  /** Cierra las sesiones y las conexiones en la API y borra el token de Apple guardado. */
  async function cerrarEnLaApi(jugador: string) {
    await pool.query(`WITH sesiones AS (DELETE FROM juego.sesiones WHERE jugador = $1),
      canjes AS (DELETE FROM juego.canjes WHERE jugador = $1)
      DELETE FROM juego.tokens_apple WHERE jugador = $1`, [jugador]);
    cerrarConexiones(jugador);
  }

  /** `null` si hace falta Keycloak y no está configurado. */
  async function aplicar({ tipo, sub, momento }: EventoApple): Promise<ResultadoAviso | null> {
    // email-disabled y email-enabled: el correo de retransmisión de Apple lo maneja Keycloak.
    if (tipo !== "consent-revoked" && tipo !== "account-delete") return "sin-cambios";
    if (!cuentas) return null;
    const usuario = await cuentas.usuarioDeApple(sub);
    if (!usuario) return "sin-jugador";
    const { rows: [jugador] } = await pool.query<{ id: string }>(
      "SELECT id FROM juego.jugadores WHERE emisor = $1 AND sujeto = $2", [emisor, usuario]);
    if (!jugador) return "sin-jugador";
    // Si Apple reenvía un aviso ya aplicado, no cierra las sesiones que el jugador abrió después.
    const clave = hash([tipo, sub, momento].join("\n"));
    if ((await pool.query("SELECT 1 FROM juego.avisos_apple WHERE clave = $1", [clave])).rowCount) return "repetido";
    let resultado: ResultadoAviso;
    if (tipo === "consent-revoked") {
      // Conserva el vínculo: con el mismo sub, vuelve a su jugador si entra otra vez con Apple.
      await cuentas.cerrarSesiones(usuario);
      await cerrarEnLaApi(jugador.id);
      resultado = "consentimiento-revocado";
    } else if (await cuentas.tieneOtroIngreso(usuario)) {
      await cuentas.desvincularApple(usuario);
      await cuentas.cerrarSesiones(usuario);
      await cerrarEnLaApi(jugador.id);
      resultado = "apple-desvinculado";
    } else {
      // Apple era su única forma de entrar. Al vencer la baja se borra el usuario de Keycloak.
      await cuentas.cerrarSesiones(usuario);
      await iniciarBaja(jugador.id);
      await pool.query("DELETE FROM juego.tokens_apple WHERE jugador = $1", [jugador.id]);
      resultado = "baja-iniciada";
    }
    await pool.query("INSERT INTO juego.avisos_apple (clave) VALUES ($1) ON CONFLICT DO NOTHING", [clave]);
    await pool.query("DELETE FROM juego.avisos_apple WHERE recibido < now() - interval '30 days'");
    return resultado;
  }

  return async function notificaciones(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Cache-Control", "no-store");
    if (!audiencias.length) { res.writeHead(404).end(); return; }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return responderJson(res, 405, { error: "Método no permitido." });
    }
    let evento: EventoApple;
    try {
      // Apple manda {"payload": "<JWS>"}; no se exige el Content-Type.
      const datos = JSON.parse(await leerCuerpo(req, 16_384));
      if (typeof datos?.payload !== "string") throw new NotificacionInvalida("Falta payload.");
      evento = await verificarNotificacion(datos.payload, { claves, audiencias });
    } catch (error) {
      if (error instanceof ErrorPeticion) return responderJson(res, error.status, { error: error.message });
      if (!(error instanceof NotificacionInvalida || error instanceof SyntaxError)) throw error;
      console.warn("Notificación de Apple rechazada:", error.message);
      return responderJson(res, 400, { error: "Notificación inválida." });
    }
    const resultado = await aplicar(evento);
    if (!resultado) return responderJson(res, 503, { error: "Falta el cliente de servicio de Keycloak." });
    // Sin el sub ni el correo: alcanza con el tipo y el resultado.
    console.info(`Notificación de Apple ${evento.tipo}: ${resultado}.`);
    alAplicar(resultado);
    responderJson(res, 200, {});
  };
}
