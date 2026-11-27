// Notificaciones de servidor a servidor de Sign in with Apple (#468). Apple avisa cuando alguien deja de usar
// su Apple ID con El Truco o elimina su cuenta de Apple. Sin dependencias del cliente OIDC para probarlo con node --test.
import { createPublicKey, verify, type KeyObject } from "node:crypto";

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
