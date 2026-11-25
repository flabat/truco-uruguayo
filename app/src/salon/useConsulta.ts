import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { cliente } from "../ingreso/plataforma.ts";
import { crearConsulta, type VistaConsulta } from "./consulta.ts";

/** Consulta periódica de una ruta del salón; se suspende con la app en segundo plano. */
export function useConsulta<T>(ruta: string | null, intervalo: number) {
  const [vista, setVista] = useState<VistaConsulta<T>>({ datos: null, estado: "cargando" });
  const actual = useRef<ReturnType<typeof crearConsulta<T>> | null>(null);
  useEffect(() => {
    if (!ruta) return;
    setVista({ datos: null, estado: "cargando" });
    const consulta = crearConsulta<T>({
      leer: (etag, signal) => cliente.consultar<T>(ruta, etag, signal),
      intervalo,
      alCambiar: setVista,
    });
    actual.current = consulta;
    consulta.iniciar();
    const suscripcion = AppState.addEventListener("change", estado => {
      if (estado === "active") consulta.reanudar();
      else consulta.suspender();
    });
    return () => {
      consulta.detener();
      suscripcion.remove();
    };
  }, [ruta, intervalo]);
  return { ...vista, reintentar: () => actual.current?.reintentar() };
}
