import { useEffect, useState } from "react";
import type { Voz } from "./voces.ts";

export const entreCartas = 450;
export const vueltaCompleta = 2000;

export interface Paso<T> {
  partida: T;
  antesDelResultado?: T;
  voz?: Voz;
  espera: number;
}

export type PasosNuevos<T> = (anterior: T | undefined, actual: T, presencio: boolean, pendientes?: Paso<T>[]) => Paso<T>[];

/**
 * Los naipes que muestra un paso. La web espera que carguen sus imágenes; quien no
 * pase una espera muestra cada paso apenas llega.
 */
export type EsperaDeNaipes = () => { listos: () => boolean; escuchar: (alCambiar: () => void) => () => void };

type Versionada = { version: number; manoNumero: number; indicaciones?: readonly unknown[] } | undefined;

export function useSecuenciaDeMesa<T extends Versionada>(actual: T, presencioReparto: boolean, reconexion: number,
    pasosNuevos: PasosNuevos<T>, esperar?: EsperaDeNaipes) {
  const [secuencia, mostrar] = useState(() => ({
    recibida: actual, reconexion, pasos: pasosNuevos(undefined, actual, presencioReparto),
  }));
  if (reconexion !== secuencia.reconexion) {
    mostrar({ recibida: actual, reconexion, pasos: [] });
  } else if (actual?.version !== secuencia.recibida?.version || actual?.manoNumero !== secuencia.recibida?.manoNumero
      || actual?.indicaciones?.length !== secuencia.recibida?.indicaciones?.length) {
    mostrar({ recibida: actual, reconexion, pasos: pasosNuevos(secuencia.recibida, actual, presencioReparto, secuencia.pasos) });
  }
  const paso = secuencia.pasos[0];
  const [pasoCargado, confirmarCarga] = useState<Paso<T>>();
  useEffect(() => {
    if (!paso?.espera) return;
    // El tiempo de descarga de un naipe no debe descontarse de su tiempo en el tapete.
    const naipes = paso.voz ? undefined : esperar?.();
    let timer: ReturnType<typeof setTimeout> | undefined;
    function alMostrarCartas() {
      if (timer !== undefined || naipes && !naipes.listos()) return;
      if (paso.antesDelResultado) confirmarCarga(paso);
      timer = setTimeout(() => {
        mostrar(s => s.pasos[0] === paso ? { ...s, pasos: s.pasos.slice(1) } : s);
      }, paso.espera);
    }
    const dejarDeEscuchar = naipes?.escuchar(alMostrarCartas);
    alMostrarCartas();
    return () => {
      clearTimeout(timer);
      dejarDeEscuchar?.();
    };
  }, [paso]);

  const mostrandoCartas = Boolean(paso && (paso.partida !== secuencia.recibida || paso.antesDelResultado));
  const enPantalla = paso?.antesDelResultado && paso !== pasoCargado ? paso.antesDelResultado : paso?.partida;
  return { partida: mostrandoCartas && enPantalla ? enPantalla : actual, mostrandoCartas, voz: paso?.voz };
}
