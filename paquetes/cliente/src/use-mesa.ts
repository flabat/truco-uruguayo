import { useEffect, useRef, useState } from "react";
import { normalizarPartida, type PartidaJugador, type RespuestaPartida } from "@eltruco/motor/partida-jugador.ts";
import { ErrorMesa, type Cliente, type Mesa } from "./cliente.ts";

/**
 * Avisa cuándo volver a leer la mesa (vuelve la red, se reabre la página o la app)
 * y cuándo se perdió la red. Devuelve cómo dejar de avisar. Tiene que ser estable.
 */
export type AvisosDeRed = (al: { leer: () => void; sinRed: () => void }) => () => void;

// WebSocket.OPEN, sin depender de que el entorno exponga la constante.
const abierto = 1;

/** `cliente` y `avisos` tienen que ser estables: un cambio reabre la conexión. */
export function useMesa(cliente: Cliente, id: string, recienCreada = false, avisos?: AvisosDeRed) {
  const ruta = "/api/mesas/" + encodeURIComponent(id);
  const [mesa, setMesa] = useState<Mesa>();
  const [partida, setPartida] = useState<PartidaJugador>();
  const [reconexion, setReconexion] = useState(0);
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
    let generacion = 0;

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
          const alComenzar = generacion;
          const canal = socket?.readyState === abierto ? socket : undefined;
          const sala = await cliente.pedir<Mesa>(ruta, undefined, cancel.signal);
          const mano = sala.lista
            ? normalizarPartida(await cliente.pedir<RespuestaPartida>(ruta + "/partida", undefined, cancel.signal))
            : undefined;
          if (cancel.signal.aborted) return;
          // Un corte durante la lectura exige una instantánea del nuevo período de conexión.
          if (alComenzar !== generacion) {
            faltaLeer = true;
            continue;
          }
          setReconexion(generacion);
          if (mano?.indicaciones) mano.reconexion = generacion;
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
          if (canal && canal === socket && canal.readyState === abierto) recuperando = false;
          primeraLectura = false;
          setMesa(sala);
          setPartida(mano);
          setError(null);
          setConectada(
            Boolean(canal && canal === socket && canal.readyState === abierto && !faltaLeer),
          );
          if (!socket) conectar();
        }
      } catch (e) {
        if (cancel.signal.aborted) return;
        recuperando = true;
        generacion++;
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
      const actual = cliente.vivo(ruta + "/vivo");
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
        generacion++;
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
    const dejarDeAvisar = avisos?.({ leer: () => void leer(), sinRed });
    return () => {
      cancel.abort();
      clearTimeout(timer);
      socket?.close();
      dejarDeAvisar?.();
    };
  }, [cliente, ruta, recienCreada, avisos]);

  return { ruta, mesa, partida, conectada, reconexion, error, refrescar };
}
