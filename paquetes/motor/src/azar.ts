const limite = 2 ** 32;

/**
 * Entero aleatorio uniforme con Web Crypto, para que el motor corra en Node, el navegador y React Native.
 * Misma semántica que `randomInt` de `node:crypto`: con un argumento devuelve `[0, min)`; con dos, `[min, max)`.
 */
export function enteroAleatorio(min: number, max?: number): number {
  if (max === undefined) [min, max] = [0, min];
  const rango = max - min;
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || rango <= 0 || rango > limite) {
    throw new RangeError("El rango debe ser entero, no vacío y de hasta 2^32 valores.");
  }
  // Muestreo por rechazo: se descartan los valores que harían más probables los primeros restos.
  const tope = limite - (limite % rango);
  const muestra = new Uint32Array(1);
  do globalThis.crypto.getRandomValues(muestra);
  while (muestra[0] >= tope);
  return min + (muestra[0] % rango);
}
