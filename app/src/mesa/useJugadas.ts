import { useCallback, useMemo, useState, type RefObject } from "react";
import { ErrorMesa, idComando, mensajeDe, type Cliente, type Eleccion } from "@eltruco/cliente/cliente.ts";
import type { CartaPedida, FrasePie } from "@eltruco/motor/senas-pie.ts";

type Camino = "/acciones" | "/siguiente" | "/indicaciones";

export type ResultadoEnvio =
  | { tipo: "aceptado" }
  | { tipo: "ocupado" }
  | { tipo: "vieja" }
  | { tipo: "error"; mensaje: string };

/**
 * Un solo envío a la vez: mientras hay uno en curso, otro vuelve «ocupado» sin pedir. Una
 * versión vieja (409) no se muestra como error: la mesa se refresca y la jugada no cuenta.
 */
export function crearEnvio(pedir: Cliente["pedir"], ruta: string) {
  let enCurso = false;
  return async (camino: Camino, datos: object): Promise<ResultadoEnvio> => {
    if (enCurso) return { tipo: "ocupado" };
    enCurso = true;
    try {
      // Ante una confirmación perdida, el segundo envío usa la misma clave de comando.
      try {
        await pedir(ruta + camino, datos);
      } catch (e) {
        if (e instanceof ErrorMesa || !("id" in datos)) throw e;
        await pedir(ruta + camino, datos);
      }
      return { tipo: "aceptado" };
    } catch (e) {
      if (e instanceof ErrorMesa && e.status === 409) return { tipo: "vieja" };
      return { tipo: "error", mensaje: mensajeDe(e) };
    } finally {
      enCurso = false;
    }
  };
}

/**
 * Envía las jugadas a la mesa en vivo con la versión vigente y refresca al terminar. `jugar` e
 * `indicar` resuelven verdadero si el servidor aceptó el comando; falso si había otro envío en
 * curso, falló o se rechazó (así la carta soltada vuelve a la mano). El aviso se limpia en el
 * próximo envío o cuando llega otra versión de la partida.
 */
export function useJugadas(cliente: Cliente, ruta: string, refrescar: RefObject<() => Promise<void>>,
    version: number | undefined) {
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; version: number | undefined }>({ texto: "", version: undefined });
  const enviar = useMemo(() => crearEnvio(cliente.pedir, ruta), [cliente, ruta]);

  const mandar = useCallback(async (camino: Camino, datos: object) => {
    if (version === undefined) return false;
    // Con otro envío en curso `enviando` ya es verdadero, y ese envío lo baja al terminar.
    setEnviando(true);
    const resultado = await enviar(camino, { id: idComando(), version, ...datos });
    if (resultado.tipo === "ocupado") return false;
    setAviso({ texto: resultado.tipo === "error" ? resultado.mensaje : "", version });
    await refrescar.current();
    setEnviando(false);
    return resultado.tipo === "aceptado";
  }, [enviar, refrescar, version]);

  const jugar = useCallback((accion?: Eleccion & { sena?: undefined }) =>
    mandar(accion ? "/acciones" : "/siguiente", accion ? { accion } : {}), [mandar]);
  const indicar = useCallback((destinatario: number, frase: FrasePie | "sin-indicacion", vuelta: number, carta?: CartaPedida) =>
    mandar("/indicaciones", { indicacion: { destinatario, frase, vuelta, ...(carta && { carta }) } }), [mandar]);

  return { enviando, aviso: aviso.version === version ? aviso.texto : "", jugar, indicar };
}
