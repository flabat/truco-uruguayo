import type { IncomingMessage, ServerResponse } from "node:http";

export class ErrorPeticion extends Error {
  readonly status: number;
  constructor(status: number, mensaje: string) {
    super(mensaje);
    this.status = status;
  }
}

export function responderJson(res: ServerResponse, status: number, valor: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" })
    .end(JSON.stringify(valor));
}

export async function leerJson(req: IncomingMessage, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ErrorPeticion(415, "Se esperaba un cuerpo JSON.");
  }
  const partes: Buffer[] = [];
  let longitud = 0;
  for await (const parte of req.iterator({ destroyOnReturn: false })) {
    longitud += parte.length;
    if (longitud > maxBytes) {
      req.resume();
      throw new ErrorPeticion(413, "La petición supera el tamaño permitido.");
    }
    partes.push(parte);
  }
  try {
    const valor: unknown = JSON.parse(Buffer.concat(partes).toString("utf8"));
    if (typeof valor === "object" && valor !== null && !Array.isArray(valor)) {
      return valor as Record<string, unknown>;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  throw new ErrorPeticion(400, "Se esperaba un objeto JSON válido.");
}
