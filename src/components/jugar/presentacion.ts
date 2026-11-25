import { useRef } from "react";
import type { Partida, PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import { usePresentacionTercetos as tercetos } from "@eltruco/cliente/presentacion-tercetos.ts";
import { usePresentacionVueltas as vueltas } from "@eltruco/cliente/presentacion-vueltas.ts";
import type { EsperaDeNaipes } from "@eltruco/cliente/secuencia-de-mesa.ts";

/** La web no descuenta la descarga de un naipe de su tiempo en el tapete. */
function useNaipesDelTablero() {
  const tablero = useRef<HTMLDivElement>(null);
  const esperar: EsperaDeNaipes = () => {
    const naipes = Array.from(tablero.current?.querySelectorAll<HTMLImageElement>(".j-jugada img") ?? []);
    return {
      listos: () => naipes.every(img => img.complete),
      escuchar(alCambiar) {
        for (const img of naipes) {
          img.addEventListener("load", alCambiar);
          img.addEventListener("error", alCambiar);
        }
        return () => {
          for (const img of naipes) {
            img.removeEventListener("load", alCambiar);
            img.removeEventListener("error", alCambiar);
          }
        };
      },
    };
  };
  return { tablero, esperar };
}

export function usePresentacionVueltas(actual: Partida | undefined, presencioReparto: boolean, reconexion: number) {
  const { tablero, esperar } = useNaipesDelTablero();
  return { tablero, ...vueltas(actual, presencioReparto, reconexion, esperar) };
}

export function usePresentacionTercetos(actual: PartidaTercetos, presencioReparto: boolean, reconexion: number) {
  const { tablero, esperar } = useNaipesDelTablero();
  return { tablero, ...tercetos(actual, presencioReparto, reconexion, esperar) };
}
