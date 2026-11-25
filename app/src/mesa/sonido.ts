import type { NombreEfecto } from "./efectos.ts";

/**
 * Lo que la parte 4e (los clips) implementa y entrega con `registrarSonido`. `asiento` elige la
 * voz; `frase` es el texto tal cual lo anuncia la cola («Truco», «Me voy al mazo», «Vení»,
 * «33 de envido»). Un clip que falta se ignora.
 */
export interface Sonido {
  reproducirVoz(asiento: number, frase: string): void;
  reproducirEfecto(nombre: NombreEfecto): void;
}

let registrado: Sonido | null = null;
// Apagado hasta que `useEfectos` lee la preferencia: así no suena nada antes de saber si se pidió.
let encendido = false;

export function registrarSonido(s: Sonido | null) {
  registrado = s;
}

/** Lo fija `useEfectos` con la preferencia de sonido. */
export function configurarSonido(activo: boolean) {
  encendido = activo;
}

/** Sin sonido registrado, o con el sonido apagado, no hace nada. */
export const sonido: Sonido = {
  reproducirVoz: (asiento, frase) => {
    if (encendido) registrado?.reproducirVoz(asiento, frase);
  },
  reproducirEfecto: nombre => {
    if (encendido) registrado?.reproducirEfecto(nombre);
  },
};
