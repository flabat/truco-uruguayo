import { useEffect, useRef, useState } from "react";
import type { LanceTercetos, ResumenLance, VistaOnline, VistaTercetos } from "../../motor/mesa-online";
import type { IndicacionPie, VistaPie } from "../../motor/senas-pie";
import type { CardId } from "../../motor/cartas";
import type { EdicionModelo } from "../../lib/modelos";

import type { Format, PublicTurn } from "../../../training/contracts/index";

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
  asientos: Asiento[];
}
interface Marcador {
  versionSenas?: string | null;
  pie?: VistaPie;
  indicaciones?: readonly IndicacionPie[];
  /** Sólo de presentación. Se fija al observar la apertura de esta vuelta en vivo. */
  llegadaEnVivo?: boolean;
  version: number;
  manoNumero: number;
  puntos: [number, number];
  meta: number;
  ganadorPartida: 0 | 1 | null;
}
export interface Partida extends Marcador {
  formato?: Format;
  turnos?: readonly PublicTurn[];
  vista: VistaOnline | null;
}
export interface PartidaTercetos extends Marcador {
  formato: "triples";
  lance: LanceTercetos;
  historialLances: readonly ResumenLance[];
  vista: VistaTercetos;
}
type PartidaRecibida = Partida | PartidaTercetos;
export type Tipo = VistaOnline["legales"][number];
export type Eleccion = { tipo: Exclude<Tipo, "carta"> } | { tipo: "carta"; carta: CardId };

export class ErrorMesa extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}
export async function pedir<T>(url: string, datos?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: datos ? "POST" : "GET",
    cache: "no-store",
    signal,
    headers: datos ? { "Content-Type": "application/json" } : undefined,
    body: datos ? JSON.stringify(datos) : undefined,
  });
  if (!response.ok) {
    const resultado = await response.json().catch(() => null);
    throw new ErrorMesa(response.status, resultado?.error || "No se pudo abrir la mesa.");
  }
  return response.json();
}
export const mensajeDe = (error: unknown) =>
  error instanceof ErrorMesa ? error.message : "No se pudo contactar con el servidor. Revisá tu conexión.";

export function idComando() {
  // getRandomValues también está disponible por HTTP en la red local.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export function useMesa(id: string, recienCreada = false) {
  const ruta = "/api/mesas/" + encodeURIComponent(id);
  const [mesa, setMesa] = useState<Mesa>();
  const [partida, setPartida] = useState<PartidaRecibida>();
  const [conectada, setConectada] = useState(false);
  const [error, setError] = useState<ErrorMesa | null>(null);
  const refrescar = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const cancel = new AbortController();
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let demora = 400;
    let lectura: Promise<void> | undefined;
    let faltaLeer = false;
    let primeraLectura = true;
    let recuperando = false;
    let ultimaApertura: string | undefined;
    let animar = false;

    function leer(): Promise<void> {
      faltaLeer = true;
      lectura ??= actualizar().finally(() => {
        lectura = undefined;
      });
      return lectura;
    }

    async function actualizar() {
      try {
        // Si llega una novedad durante la lectura, consultar de nuevo en orden.
        while (faltaLeer && !cancel.signal.aborted) {
          faltaLeer = false;
          const canal = socket?.readyState === WebSocket.OPEN ? socket : undefined;
          const sala = await pedir<Mesa>(ruta, undefined, cancel.signal);
          const mano = sala.lista
            ? await pedir<PartidaRecibida>(ruta + "/partida", undefined, cancel.signal)
            : undefined;
          if (cancel.signal.aborted) return;
          if (mano?.pie) {
            const apertura = mano.manoNumero + "." + mano.pie.vuelta;
            if (ultimaApertura !== apertura) {
              const esRepartoInicial = recienCreada && mano.manoNumero === 1 && mano.pie.vuelta === 1
                && mano.vista?.acciones.length === 0;
              animar = !recuperando && (!primeraLectura || esRepartoInicial);
              ultimaApertura = apertura;
            }
            if (recuperando) animar = false;
            mano.llegadaEnVivo = animar;
          }
          if (canal && canal === socket && canal.readyState === WebSocket.OPEN) recuperando = false;
          primeraLectura = false;
          setMesa(sala);
          setPartida(mano);
          setError(null);
          setConectada(
            Boolean(canal && canal === socket && canal.readyState === WebSocket.OPEN && !faltaLeer),
          );
          if (!socket) conectar();
        }
      } catch (e) {
        if (cancel.signal.aborted) return;
        setConectada(false);
        if (e instanceof ErrorMesa && [401, 403, 404].includes(e.status)) {
          setError(e);
          clearTimeout(timer);
          if (socket) {
            socket.onclose = null;
            socket.close();
            socket = undefined;
          }
        } else {
          clearTimeout(timer);
          timer = setTimeout(leer, 1500);
        }
      }
    }

    function conectar() {
      const url = new URL(ruta + "/vivo", window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const actual = new WebSocket(url, "truco.v1");
      socket = actual;
      actual.onopen = () => {
        demora = 400;
        void leer();
      };
      actual.onmessage = ({ data }) => {
        try {
          if (JSON.parse(data).tipo === "actualizar") void leer();
        } catch {
          /* Un aviso desconocido no cambia la vista de la mesa. */
        }
      };
      actual.onclose = () => {
        if (cancel.signal.aborted) return;
        socket = undefined;
        recuperando = true;
        setConectada(false);
        clearTimeout(timer);
        timer = setTimeout(leer, demora);
        demora = Math.min(5000, demora * 2);
      };
    }

    function sinRed() {
      setConectada(false);
      socket?.close();
    }
    refrescar.current = leer;
    void leer();
    window.addEventListener("online", leer);
    window.addEventListener("offline", sinRed);
    window.addEventListener("pageshow", leer);
    return () => {
      cancel.abort();
      clearTimeout(timer);
      socket?.close();
      window.removeEventListener("online", leer);
      window.removeEventListener("offline", sinRed);
      window.removeEventListener("pageshow", leer);
    };
  }, [ruta, recienCreada]);

  return { ruta, mesa, partida, conectada, error, refrescar };
}
