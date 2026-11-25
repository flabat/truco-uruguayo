import type { Efecto } from "../sonido/efectos.ts";
import type { FraseVoz } from "../sonido/frases.ts";

/**
 * Las voces y los efectos de la parte 4e (`app/src/sonido`), que `entrada.tsx` registra con
 * `registrarSonido`. Así la lógica de la mesa no importa `expo-audio` y se prueba con node. La 4e
 * respeta su propio interruptor de sonido, encola las frases de cada asiento e ignora un clip que falta.
 */
export interface Sonido {
  reproducirVoz(asiento: number, frase: FraseVoz): void;
  reproducirEfecto(nombre: Efecto, opciones?: { volumen?: number }): void;
  precargar(asientos: readonly number[]): Promise<void>;
}

let registrado: Sonido | null = null;

export function registrarSonido(s: Sonido | null) {
  registrado = s;
}

/** Sin sonido registrado no hace nada. */
export const sonido: Sonido = {
  reproducirVoz: (asiento, frase) => registrado?.reproducirVoz(asiento, frase),
  reproducirEfecto: (nombre, opciones) => registrado?.reproducirEfecto(nombre, opciones),
  precargar: async asientos => {
    await registrado?.precargar(asientos).catch(() => {});
  },
};
