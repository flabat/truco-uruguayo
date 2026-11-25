import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { ErrorMesa, idComando, mensajeDe, type Cliente, type Eleccion } from "@eltruco/cliente/cliente.ts";
import type { FrasePie } from "@eltruco/motor/senas-pie.ts";

type Camino = "/acciones" | "/siguiente" | "/indicaciones";

/**
 * Un solo envío a la vez: mientras hay uno en curso, otro vuelve sin pedir. Devuelve el mensaje
 * para mostrar o null. Una versión vieja (409) no se muestra: llama a `alVersionVieja` y se refresca.
 */
export function crearEnvio(pedir: Cliente["pedir"], ruta: string, alVersionVieja?: () => void) {
  let enCurso = false;
  return async (camino: Camino, datos: object): Promise<string | null> => {
    if (enCurso) return null;
    enCurso = true;
    try {
      // Ante una confirmación perdida, el segundo envío usa la misma clave de comando.
      try {
        await pedir(ruta + camino, datos);
      } catch (e) {
        if (e instanceof ErrorMesa || !("id" in datos)) throw e;
        await pedir(ruta + camino, datos);
      }
      return null;
    } catch (e) {
      if (e instanceof ErrorMesa && e.status === 409) {
        alVersionVieja?.();
        return null;
      }
      return mensajeDe(e);
    } finally {
      enCurso = false;
    }
  };
}

/**
 * Envía las jugadas a la mesa en vivo con la versión vigente y refresca al terminar. `jugar` e
 * `indicar` resuelven verdadero si el servidor aceptó el comando; falso si había otro envío en
 * curso, falló o se rechazó (así la carta soltada vuelve a la mano).
 */
export function useJugadas(cliente: Cliente, ruta: string, refrescar: RefObject<() => Promise<void>>,
    version: number | undefined) {
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const ocupado = useRef(false);
  const vieja = useRef(false);
  const enviar = useMemo(() => crearEnvio(cliente.pedir, ruta, () => { vieja.current = true; }), [cliente, ruta]);

  const mandar = useCallback(async (camino: Camino, datos: object) => {
    if (ocupado.current || version === undefined) return false;
    ocupado.current = true;
    vieja.current = false;
    setEnviando(true);
    setAviso("");
    try {
      const mensaje = await enviar(camino, { id: idComando(), version, ...datos });
      if (mensaje) setAviso(mensaje);
      return mensaje === null && !vieja.current;
    } finally {
      await refrescar.current();
      ocupado.current = false;
      setEnviando(false);
    }
  }, [enviar, refrescar, version]);

  const jugar = useCallback((accion?: Eleccion & { sena?: undefined }) =>
    mandar(accion ? "/acciones" : "/siguiente", accion ? { accion } : {}), [mandar]);
  const indicar = useCallback((destinatario: number, frase: FrasePie | "sin-indicacion", vuelta: number) =>
    mandar("/indicaciones", { indicacion: { destinatario, frase, vuelta } }), [mandar]);

  return { enviando, aviso, jugar, indicar };
}
