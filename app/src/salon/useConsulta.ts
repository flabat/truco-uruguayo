import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import { cliente } from "../ingreso/plataforma.ts";
import { crearConsulta, type VistaConsulta } from "./consulta.ts";

/** Consulta la ruta al volver a la pantalla y periódicamente mientras está visible. */
export function useConsulta<T>(ruta: string | null, intervalo: number) {
  const [vista, setVista] = useState<VistaConsulta<T>>({ datos: null, estado: "cargando" });
  const actual = useRef<ReturnType<typeof crearConsulta<T>> | null>(null);
  useFocusEffect(useCallback(() => {
    if (!ruta) return;
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
      actual.current = null;
    };
  }, [ruta, intervalo]));
  return { ...vista, reintentar: () => actual.current?.reintentar() };
}
