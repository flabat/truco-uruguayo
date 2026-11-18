import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";

const protocolo = "truco.v1";
const ruta = /^\/api\/mesas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/vivo$/i;

interface ServiciosVivo {
  autenticar(req: IncomingMessage): Promise<string | null>;
  leerMesa(mesa: string, jugador: string): Promise<unknown>;
  ejecutar(mesa: string, jugador: string, operacion: "acciones" | "siguiente", datos: unknown): Promise<unknown>;
}

interface Comando {
  tipo: "accion" | "siguiente";
  id: string;
  version: number;
  accion?: unknown;
}

function esComando(valor: unknown): valor is Comando {
  if (!valor || typeof valor !== "object") return false;
  const { tipo, id, version } = valor as Partial<Comando>;
  return (tipo === "accion" || tipo === "siguiente") && typeof id === "string" && id.length <= 64
    && Number.isSafeInteger(version) && (tipo !== "accion" || "accion" in valor);
}

interface Conexion {
  ws: WebSocket;
  req: IncomingMessage;
  mesa: string;
  jugador: string;
  respondePing: boolean;
}
function httpError(socket: Duplex, estado: number) {
  const motivos: Record<number, string> = { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 503: "Service Unavailable" };
  socket.end("HTTP/1.1 " + estado + " " + (motivos[estado] ?? "Bad Request") + "\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
}

function fallo(error: unknown) {
  if (error instanceof Error && "status" in error && typeof error.status === "number"
    && error.status >= 400 && error.status < 500) {
    return { status: error.status, mensaje: error.message };
  }
  return { status: 503, mensaje: "El servicio de la mesa no está disponible." };
}

function enviar(ws: WebSocket, mensaje: object) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > 64 * 1024) ws.close(1013, "Volvé a conectar a la mesa.");
  else ws.send(JSON.stringify(mensaje));
}

export function crearVivo(server: Server, web: URL, servicios: ServiciosVivo) {
  const wss = new WebSocketServer({
    noServer: true, maxPayload: 8192, clientTracking: false, handleProtocols: protocolos => protocolos.has(protocolo) && protocolo,
  });
  const mesas = new Map<string, Set<Conexion>>();
  let cerrado = false;

  async function sigueEnLaMesa(conexion: Conexion) {
    const jugador = await servicios.autenticar(conexion.req);
    if (jugador !== conexion.jugador || !await servicios.leerMesa(conexion.mesa, jugador)) {
      conexion.ws.close(1008, "Ingresá nuevamente a la mesa.");
      return false;
    }
    return true;
  }

  async function comando(conexion: Conexion, datos: Comando) {
    const { ws, mesa, jugador } = conexion;
    try {
      if (!await sigueEnLaMesa(conexion)) return;
      // HTTP y WebSocket pasan por la misma clave idempotente y el mismo control de versión.
      const { tipo, id, version, accion } = datos;
      const partida = await servicios.ejecutar(mesa, jugador, tipo === "accion" ? "acciones" : "siguiente",
        tipo === "accion" ? { id, version, accion } : { id, version });
      if (await sigueEnLaMesa(conexion)) enviar(ws, { tipo: "confirmacion", id, partida });
    } catch (error) {
      const { status, mensaje } = fallo(error);
      if (status === 401 || status === 403 || status === 404) ws.close(1008, "Ingresá nuevamente a la mesa.");
      else enviar(ws, { tipo: "error", id: datos.id, mensaje });
    }
  }

  function conectar(ws: WebSocket, req: IncomingMessage, mesa: string, jugador: string) {
    const c: Conexion = { ws, req, mesa, jugador, respondePing: true };
    const grupo = mesas.get(mesa) ?? new Set<Conexion>();
    mesas.set(mesa, grupo);
    grupo.add(c);
    ws.on("pong", () => { c.respondePing = true; });
    ws.on("error", () => ws.terminate());
    ws.on("close", () => {
      grupo.delete(c);
      if (!grupo.size) mesas.delete(mesa);
    });
    let enCurso = false;
    ws.on("message", (buffer, binario) => {
      if (binario) return ws.close(1003, "Usá mensajes JSON de texto.");
      let datos: unknown;
      try { datos = JSON.parse(buffer.toString()); } catch { return ws.close(1007, "JSON inválido."); }
      if (!esComando(datos)) return enviar(ws, { tipo: "error", id: null, mensaje: "Comando de mesa inválido." });
      if (enCurso) return enviar(ws, { tipo: "error", id: datos.id, mensaje: "Esperá la respuesta a tu jugada anterior." });
      enCurso = true;
      void comando(c, datos).finally(() => { enCurso = false; });
    });
    // La vista inicial se recupera también si hubo un cambio durante el upgrade.
    enviar(ws, { tipo: "actualizar" });
  }

  function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const destruir = () => socket.destroy();
    socket.on("error", destruir);
    const mesa = ruta.exec(req.url ?? "")?.[1];
    if (!mesa) return httpError(socket, 404);
    if (req.headers.origin !== web.origin) return httpError(socket, 403);
    if (!req.headers["sec-websocket-protocol"]?.split(",").some(p => p.trim() === protocolo)) return httpError(socket, 400);
    void (async () => {
      const jugador = await servicios.autenticar(req);
      if (!jugador) return httpError(socket, 401);
      if (!await servicios.leerMesa(mesa, jugador)) return httpError(socket, 404);
      if (cerrado || socket.destroyed) return socket.destroy();
      socket.removeListener("error", destruir);
      wss.handleUpgrade(req, socket, head, ws => conectar(ws, req, mesa, jugador));
    })().catch(error => httpError(socket, fallo(error).status));
  }

  server.on("upgrade", upgrade);
  const latidos = setInterval(() => {
    for (const grupo of mesas.values()) for (const conexion of grupo) {
      if (!conexion.respondePing) conexion.ws.terminate();
      else if (conexion.ws.readyState === WebSocket.OPEN) {
        conexion.respondePing = false;
        conexion.ws.ping();
      }
    }
  }, 30_000);
  latidos.unref();

  function alCambiar(mesa: string) {
    // El aviso no incluye datos de la mesa. Cada cliente relee su vista autenticada.
    for (const { ws } of mesas.get(mesa) ?? []) enviar(ws, { tipo: "actualizar" });
  }

  function cerrar() {
    cerrado = true;
    clearInterval(latidos);
    server.off("upgrade", upgrade);
    for (const grupo of mesas.values()) for (const { ws } of grupo) ws.terminate();
    wss.close();
  }
  return { alCambiar, cerrar };
}
