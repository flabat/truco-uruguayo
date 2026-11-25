import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export const nombreSesion = "truco_sesion";
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function cookieDe(req: IncomingMessage, name: string) {
  return req.headers.cookie?.split(";").map(part => part.trim())
    .find(part => part.startsWith(name + "="))?.slice(name.length + 1) ?? "";
}

/** La app envía `Authorization: Bearer <sesión>`; el navegador, la cookie. Si vienen los dos, manda el encabezado. */
export function sesionDe(req: IncomingMessage): { handle: string; via: "cookie" | "encabezado" } | null {
  const autorizacion = req.headers.authorization;
  if (autorizacion !== undefined) {
    const handle = /^Bearer ([A-Za-z0-9_-]+)$/.exec(autorizacion)?.[1];
    return handle ? { handle, via: "encabezado" } : null;
  }
  const handle = cookieDe(req, nombreSesion);
  return handle ? { handle, via: "cookie" } : null;
}

/** Un sitio ajeno no puede enviar el encabezado, así que solo la cookie exige el origen del juego. */
export function origenValido(req: IncomingMessage, web: URL): boolean {
  return sesionDe(req)?.via === "encabezado" || req.headers.origin === web.origin;
}

/** Desafío S256 de la app: 43 caracteres base64url sin relleno (RFC 7636). */
export function esDesafio(valor: string | null): valor is string {
  return valor !== null && /^[A-Za-z0-9_-]{43}$/.test(valor);
}

export function verificadorCorresponde(verificador: string, desafio: string): boolean {
  // Se compara el texto canónico: decodificar aceptaría variantes del último carácter.
  const calculado = Buffer.from(createHash("sha256").update(verificador).digest("base64url"));
  const esperado = Buffer.from(desafio);
  return esperado.length === calculado.length && timingSafeEqual(calculado, esperado);
}
