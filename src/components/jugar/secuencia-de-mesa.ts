import { useEffect, useRef, useState } from "react";
import type { Voz } from "./Voz";

export const entreCartas = 450;
export const vueltaCompleta = 2000;

export interface Paso<T> {
  partida: T;
  antesDelResultado?: T;
  voz?: Voz;
  espera: number;
}

type Versionada = { version: number; manoNumero: number } | undefined;

export function useSecuenciaDeMesa<T extends Versionada>(actual: T, presencioReparto: boolean, reconexion: number,
    pasosNuevos: (anterior: T | undefined, actual: T, presencio: boolean, pendientes?: Paso<T>[]) => Paso<T>[]) {
  const tablero = useRef<HTMLDivElement>(null);
  const [secuencia, mostrar] = useState(() => ({
    recibida: actual, reconexion, pasos: pasosNuevos(undefined, actual, presencioReparto),
  }));
  if (reconexion !== secuencia.reconexion) {
    mostrar({ recibida: actual, reconexion, pasos: [] });
  } else if (actual?.version !== secuencia.recibida?.version || actual?.manoNumero !== secuencia.recibida?.manoNumero) {
    mostrar({ recibida: actual, reconexion, pasos: pasosNuevos(secuencia.recibida, actual, presencioReparto, secuencia.pasos) });
  }
  const paso = secuencia.pasos[0];
  const [pasoCargado, confirmarCarga] = useState<Paso<T>>();
  useEffect(() => {
    if (!paso?.espera) return;
    // El tiempo de descarga de un naipe no debe descontarse de su tiempo en el tapete.
    const naipes = paso.voz ? [] : Array.from(tablero.current?.querySelectorAll<HTMLImageElement>(".j-jugada img") ?? []);
    let timer: number | undefined;
    function alMostrarCartas() {
      if (timer !== undefined || naipes.some(img => !img.complete)) return;
      if (paso.antesDelResultado) confirmarCarga(paso);
      timer = window.setTimeout(() => {
        mostrar(s => s.pasos[0] === paso ? { ...s, pasos: s.pasos.slice(1) } : s);
      }, paso.espera);
    }
    for (const img of naipes) {
      img.addEventListener("load", alMostrarCartas);
      img.addEventListener("error", alMostrarCartas);
    }
    alMostrarCartas();
    return () => {
      window.clearTimeout(timer);
      for (const img of naipes) {
        img.removeEventListener("load", alMostrarCartas);
        img.removeEventListener("error", alMostrarCartas);
      }
    };
  }, [paso]);

  const mostrandoCartas = Boolean(paso && (paso.partida !== secuencia.recibida || paso.antesDelResultado));
  const enPantalla = paso?.antesDelResultado && paso !== pasoCargado ? paso.antesDelResultado : paso?.partida;
  return { tablero, partida: mostrandoCartas && enPantalla ? enPantalla : actual, mostrandoCartas, voz: paso?.voz };
}
