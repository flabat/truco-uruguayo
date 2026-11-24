import { useEffect, useRef, useState } from "react";

type Estado = "cargando" | "listo" | "error" | "no-disponible" | "sin-sesion";

export function useConsultaSalon<T>(url: string, intervalo: number) {
  const [vista, mostrar] = useState<{ datos: T | null; estado: Estado }>({ datos: null, estado: "cargando" });
  const consultar = useRef<() => void>(() => {});

  useEffect(() => {
    let pendiente: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let etag: string | null = null;
    let final = false;
    mostrar({ datos: null, estado: "cargando" });

    async function leer() {
      clearTimeout(timer);
      if (final || document.hidden || pendiente) return;
      const solicitud = new AbortController();
      pendiente = solicitud;
      try {
        const respuesta = await fetch(url, {
          cache: "no-store", signal: solicitud.signal,
          headers: etag ? { "If-None-Match": etag } : undefined,
        });
        if (solicitud.signal.aborted) return;
        if (respuesta.status === 401 || respuesta.status === 404) {
          final = true;
          mostrar({ datos: null, estado: respuesta.status === 401 ? "sin-sesion" : "no-disponible" });
        } else if (respuesta.status === 304 && etag) {
          mostrar(actual => ({ ...actual, estado: "listo" }));
        } else {
          if (!respuesta.ok) throw new Error();
          const datos: T = await respuesta.json();
          if (solicitud.signal.aborted) return;
          etag = respuesta.headers.get("ETag");
          mostrar({ datos, estado: "listo" });
        }
      } catch {
        if (!solicitud.signal.aborted) mostrar(actual => ({ ...actual, estado: "error" }));
      } finally {
        if (pendiente === solicitud) {
          pendiente = undefined;
          if (!final && !document.hidden) timer = setTimeout(leer, intervalo);
        }
      }
    }

    function suspender() {
      clearTimeout(timer);
      pendiente?.abort();
      pendiente = undefined;
    }
    const visibilidad = () => document.hidden ? suspender() : void leer();
    consultar.current = () => { final = false; void leer(); };
    void leer();
    document.addEventListener("visibilitychange", visibilidad);
    return () => {
      final = true;
      suspender();
      document.removeEventListener("visibilitychange", visibilidad);
    };
  }, [url, intervalo]);
  return { ...vista, reintentar: () => consultar.current() };
}
