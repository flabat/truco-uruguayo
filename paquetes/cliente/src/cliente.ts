import type { VistaOnline } from "@eltruco/motor/mesa-online.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";
import type { Format } from "@eltruco/motor/contratos.ts";
export type { Partida, PartidaJugador, PartidaTercetos, RespuestaPartida } from "@eltruco/motor/partida-jugador.ts";

export type Modo = "1v1" | "2v2" | "3v3";
export interface Jugador {
  salonHabilitado?: boolean;
  puedeReportar?: boolean;
  id: string;
  nombre: string;
}
export interface Asiento {
  asiento: number;
  equipo: 0 | 1;
  tipo: "vacio" | "humano" | "computadora";
  nombre: string | null;
}
export interface EdicionModelo {
  nombre: string;
  publicado: string | null;
}
export interface VersionesMesa {
  versionReglas?: number;
  politica?: string;
  edicionModelo?: EdicionModelo;
}
export interface Mesa extends VersionesMesa {
  versionSenas?: string | null;
  publica: boolean;
  id: string;
  modo: Modo;
  meta: number;
  formato?: Format | "triples";
  creadorId: string;
  miAsiento: number;
  invitacion: string;
  vozDisponible?: boolean;
  lista: boolean;
  /** Se canceló porque quien la creó dejó el juego. */
  cancelada?: boolean;
  asientos: Asiento[];
}
export type Tipo = VistaOnline["legales"][number];
export type Eleccion = { tipo: Exclude<Tipo, "carta"> } | { tipo: "carta"; carta: CardId };

export class ErrorMesa extends Error {
  readonly status: number;
  constructor(status: number, mensaje: string) {
    super(mensaje);
    this.status = status;
  }
}

type ConstructorWebSocket = new (
  url: string,
  protocolos: string | string[],
  // React Native acepta encabezados en el upgrade. El navegador no, y usa la cookie.
  opciones?: { headers: Record<string, string> },
) => WebSocket;

export interface OpcionesCliente {
  /** Origen de la API, por ejemplo `https://eltru.co`. Sin base, la web usa rutas de su mismo origen. */
  base?: string;
  /** La sesión de la app. Con valor se manda `Authorization: Bearer`; sin valor, el navegador manda la cookie. */
  sesion?: () => string | null | undefined;
  fetch?: typeof fetch;
  WebSocket?: ConstructorWebSocket;
}

export interface Cliente {
  pedir<T>(ruta: string, datos?: object, signal?: AbortSignal): Promise<T>;
  /** Abre el WebSocket `truco.v1` de la ruta. */
  vivo(ruta: string): WebSocket;
}

export function crearCliente(opciones: OpcionesCliente = {}): Cliente {
  const base = opciones.base?.replace(/\/+$/, "") ?? "";
  const autorizacion = (): Record<string, string> => {
    const sesion = opciones.sesion?.();
    return sesion ? { Authorization: "Bearer " + sesion } : {};
  };
  return {
    async pedir<T>(ruta: string, datos?: object, signal?: AbortSignal): Promise<T> {
      const headers = { ...(datos ? { "Content-Type": "application/json" } : {}), ...autorizacion() };
      const response = await (opciones.fetch ?? fetch)(base + ruta, {
        method: datos ? "POST" : "GET",
        cache: "no-store",
        signal,
        headers: Object.keys(headers).length ? headers : undefined,
        body: datos ? JSON.stringify(datos) : undefined,
      });
      if (!response.ok) {
        const resultado = await response.json().catch(() => null);
        throw new ErrorMesa(response.status, resultado?.error || "No se pudo abrir la mesa.");
      }
      // Sin contenido (por ejemplo, al abandonar): no hay JSON que leer.
      if (response.status === 204) return undefined as T;
      return response.json();
    },
    vivo(ruta: string) {
      // Solo se lee al conectar: la sala también se renderiza en el servidor, sin página.
      const pagina = (globalThis as { location?: { href: string } }).location?.href;
      if (!base && !pagina) throw new Error("Falta la base de la API para abrir el WebSocket.");
      const url = base ? new URL(base + ruta) : new URL(ruta, pagina);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const encabezados = autorizacion();
      const Socket = opciones.WebSocket ?? (WebSocket as ConstructorWebSocket);
      return Object.keys(encabezados).length
        ? new Socket(url.toString(), "truco.v1", { headers: encabezados })
        : new Socket(url.toString(), "truco.v1");
    },
  };
}

export const mensajeDe = (error: unknown) =>
  error instanceof ErrorMesa ? error.message : "No se pudo contactar con el servidor. Revisá tu conexión.";

/** En React Native hace falta un polyfill de `crypto.getRandomValues` (por ejemplo, el de expo-crypto). */
export function idComando() {
  // getRandomValues también está disponible por HTTP en la red local.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}
