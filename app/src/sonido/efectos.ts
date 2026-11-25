/**
 * Efectos de la mesa. Los genera `scripts/voces/efectos.ts`.
 * - `naipe`: carta sobre el paño. Para la carta de otro jugador, con `volumen: 0.5`.
 * - `reparto`: roce de naipe, uno por carta repartida.
 * - `ficha`: se cobran tantos.
 * - `festejo`: se gana el chico.
 */
export type Efecto = "naipe" | "reparto" | "ficha" | "festejo";

export const efectos: readonly Efecto[] = ["naipe", "reparto", "ficha", "festejo"];
