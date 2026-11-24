import { createHash } from "node:crypto";
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
