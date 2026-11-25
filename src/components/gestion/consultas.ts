import { useEffect, useState } from "react";

export type Acceso = "comprobando" | "autorizado" | 401 | 403;
export interface Consulta { acceso: (estado: Acceso) => void }
export interface Pagina<T> { elementos: T[]; total: number; pagina: number; porPagina: number }
export type Modo = "1v1" | "2v2" | "3v3";
export interface Asiento {
  asiento: number; equipo: number; tipo: "humano" | "computadora"; jugador: string | null;
  nombre: string; conectado: boolean;
}
export interface Mesa {
  id: string; modo: Modo; meta: number; mano: number | null; estado: "esperando" | "sin-terminar" | "terminada";
  puntos: [number, number] | null; ganador: number | null; inicio: string | null; fin: string | null; asientos: Asiento[];
}
export interface Vivo extends Pagina<Mesa> { sesionesVigentes: number; personasConectadas: number; partidasEnCurso: number }
export interface Jugador {
  id: string; nombre: string; sesionVigente: boolean; terminadas: number; ganadas: number; mesasConectadas: string[];
}

interface Respuesta<T> { ruta: string; datos?: T; actualizado?: Date; error?: boolean }

export function useConsulta<T>(ruta: string, acceso: Consulta["acceso"], enVivo = false) {
  const [respuesta, guardar] = useState<Respuesta<T>>({ ruta });
  const [intento, cambiarIntento] = useState(0);
  useEffect(() => {
    const control = new AbortController();
    let ocupado = false;
    async function leer() {
      if (ocupado) return;
      ocupado = true;
      try {
        const r = await fetch(ruta, { signal: control.signal, cache: "no-store", credentials: "same-origin" });
        if (control.signal.aborted) return;
        if (r.status === 401 || r.status === 403) {
          guardar({ ruta });
          acceso(r.status);
          return;
        }
        if (!r.ok) throw new Error();
        const datos = await r.json() as T;
        if (!control.signal.aborted) {
          guardar({ ruta, datos, actualizado: new Date() });
          acceso("autorizado");
        }
      } catch {
        if (!control.signal.aborted) guardar(previa => ({ ...(previa.ruta === ruta ? previa : {}), ruta, error: true }));
      } finally { ocupado = false; }
    }
    function siVisible() { if (!document.hidden) void leer(); }
    void leer();
    const timer = enVivo ? window.setInterval(siVisible, 15_000) : undefined;
    document.addEventListener("visibilitychange", siVisible);
    return () => {
      control.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", siVisible);
    };
  }, [ruta, acceso, enVivo, intento]);
  return {
    ...(respuesta.ruta === ruta ? respuesta : { ruta }),
    recargar: () => cambiarIntento(n => n + 1),
  };
}

export function rutaGestion(recurso: string, pagina: number, filtros: Record<string,string> = {}) {
  const params = new URLSearchParams({ pagina: String(pagina) });
  for (const [llave, valor] of Object.entries(filtros)) if (valor) params.set(llave, valor);
  return "/api/gestion/" + recurso + "?" + params;
}
