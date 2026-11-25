import type { ServerResponse } from "node:http";
import { versionDesdeEntorno } from "@eltruco/cliente/version.ts";
import { responderJson } from "./http.ts";

export const rutaVersion = "/api/version";

/** `GET /api/version`: la versión grabada en la imagen. Es pública y no toca la base. */
export function crearVersion(entorno: Record<string, string | undefined> = process.env) {
  const version = versionDesdeEntorno(entorno);
  return (metodo: string | undefined, response: ServerResponse) => {
    if (metodo !== "GET" && metodo !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    responderJson(response, 200, version);
  };
}
