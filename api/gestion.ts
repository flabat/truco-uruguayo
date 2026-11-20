import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { identidadDeSesion } from "./auth.ts";
import { leerGestion } from "./gestion-datos.ts";
import { ErrorPeticion, responderJson } from "./http.ts";

export function crearGestion(pool: Pool, emisor: string, sujeto: string | undefined,
    conexiones: () => ReadonlyMap<string, ReadonlySet<string>>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Cache-Control", "no-store");
    const identidad = await identidadDeSesion(pool, req);
    if (!identidad) return responderJson(res, 401, { error: "Ingresá para abrir el panel." });
    if (!sujeto || identidad.emisor !== emisor || identidad.sujeto !== sujeto) {
      return responderJson(res, 403, { error: "Esta cuenta no tiene acceso al panel." });
    }
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return responderJson(res, 405, { error: "El panel es de solo lectura." });
    }
    const url = new URL(req.url!, "http://localhost");
    const recurso = url.pathname.slice("/api/gestion/".length);
    if (recurso !== "vivo" && recurso !== "jugadores" && recurso !== "historial") {
      return responderJson(res, 404, { error: "Sección desconocida." });
    }
    try {
      const datos = await leerGestion(pool, recurso, url.searchParams, conexiones());
      return responderJson(res, 200, datos);
    } catch (error) {
      if (error instanceof ErrorPeticion) return responderJson(res, error.status, { error: error.message });
      throw error;
    }
  };
}
