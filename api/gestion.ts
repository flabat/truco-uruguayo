import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { identidadDeSesion } from "./auth.ts";
import { leerGestion } from "./gestion-datos.ts";
import { guardarTercetos, leerTercetos } from "./funciones.ts";
import { ErrorPeticion, leerJson, responderJson } from "./http.ts";

export function crearGestion(pool: Pool, emisor: string, sujeto: string | undefined,
    conexiones: () => ReadonlyMap<string, ReadonlySet<string>>, origen: string) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Cache-Control", "no-store");
    const identidad = await identidadDeSesion(pool, req);
    if (!identidad) return responderJson(res, 401, { error: "Ingresá para abrir el panel." });
    if (!sujeto || identidad.emisor !== emisor || identidad.sujeto !== sujeto) {
      return responderJson(res, 403, { error: "Esta cuenta no tiene acceso al panel." });
    }
    const url = new URL(req.url!, "http://localhost");
    const recurso = url.pathname.slice("/api/gestion/".length);
    try {
      if (recurso === "funciones/tercetos") {
        if (req.method === "GET") return responderJson(res, 200, await leerTercetos(pool));
        if (req.method === "PUT") {
          if (req.headers.origin !== origen) throw new ErrorPeticion(403, "El origen no corresponde al panel.");
          const datos = await leerJson(req, 64 * 1024);
          return responderJson(res, 200, await guardarTercetos(pool, identidad.id, datos));
        }
        res.setHeader("Allow", "GET, PUT");
        throw new ErrorPeticion(405, "Método no permitido.");
      }
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        throw new ErrorPeticion(405, "Esta sección es de solo lectura.");
      }
      if (recurso !== "vivo" && recurso !== "jugadores" && recurso !== "historial") {
        throw new ErrorPeticion(404, "Sección desconocida.");
      }
      const datos = await leerGestion(pool, recurso, url.searchParams, conexiones());
      return responderJson(res, 200, datos);
    } catch (error) {
      if (error instanceof ErrorPeticion) return responderJson(res, error.status, { error: error.message });
      throw error;
    }
  };
}
