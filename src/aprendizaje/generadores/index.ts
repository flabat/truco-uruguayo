import { mazo, pieza, type CardId } from "../../motor/cartas.ts";
import { crearAzar, esSemilla } from "../../motor/reparto.ts";
import type { ProveedorSituaciones, SolicitudSituacion, Situacion } from "../tipos.ts";
import { evaluarRespuesta, explicarSituacion } from "./evaluacion.ts";
import { esFamiliaDe, muestrasDe, pertenece, type Familia } from "./familias.ts";

export { familiasPorHabilidad, type Habilidad } from "./familias.ts";
export { evaluarRespuesta } from "./evaluacion.ts";

/** La muestra tiene un papel fijo. Reordenar las opciones conserva la identidad del ejercicio. */
export function claveSituacion(muestra: CardId, cartas: readonly CardId[]): string {
  return [muestra, ...cartas.toSorted()].join("/");
}

function cartasDe(familia: Familia, muestra: CardId, cantidad: number, azar: () => number): CardId[] {
  const restantes = mazo.filter((carta) => carta !== muestra);
  const baraja: CardId[] = [];
  while (restantes.length) {
    const indice = Math.floor(azar() * restantes.length);
    baraja.push(restantes.splice(indice, 1)[0]);
  }

  // Primero probamos pares o ternas disjuntos en el orden de la mezcla.
  for (let i = 0; i + cantidad <= baraja.length; i += cantidad) {
    const cartas = baraja.slice(i, i + cantidad);
    if (pertenece(familia, cartas, muestra)) return cartas;
  }

  // Construcción directa para la flor más rara: toda muestra habilita cinco piezas efectivas.
  if (familia === "tres-piezas") return baraja.filter((carta) => pieza(carta, muestra) !== null).slice(0, 3);

  // Alternativa finita, en el mismo orden sembrado. A lo sumo C(39,2) pares o C(39,3) ternas.
  for (let i = 0; i < baraja.length; i++) {
    for (let j = i + 1; j < baraja.length; j++) {
      if (cantidad === 2) {
        const par = [baraja[i], baraja[j]];
        if (pertenece(familia, par, muestra)) return par;
      } else {
        for (let k = j + 1; k < baraja.length; k++) {
          const terna = [baraja[i], baraja[j], baraja[k]];
          if (pertenece(familia, terna, muestra)) return terna;
        }
      }
    }
  }
  throw new Error(`La familia ${familia} carece de ejemplos con la muestra ${muestra}.`);
}

export function generarSituacion({ habilidad, familia, semilla, recientes }: SolicitudSituacion): Situacion {
  if (!esFamiliaDe(habilidad, familia)) throw new RangeError(`Familia desconocida para ${habilidad}: ${familia}.`);
  if (!esSemilla(semilla)) throw new RangeError("La semilla debe ser un entero sin signo de 32 bits.");

  // Cada bloque completo de 16 semillas tiene 16 muestras distintas, incluso en el límite uint32.
  // Así podemos eludir hasta 15 claves recientes y guardar la semilla que reproduce la alternativa.
  const bloque = semilla - semilla % 16;
  const muestras = muestrasDe(familia);
  const inicio = Math.floor(crearAzar(bloque)() * muestras.length);
  const evitar = new Set(recientes.slice(0, 15));
  for (let intento = 0; intento <= evitar.size; intento++) {
    const posicion = (semilla + intento) % 16;
    const efectiva = bloque + posicion;
    const muestra = muestras[(inicio + posicion) % muestras.length];
    const cartas = cartasDe(familia, muestra, habilidad === "comparar-cartas" ? 2 : 3, crearAzar(efectiva));
    const clave = claveSituacion(muestra, cartas);
    if (!evitar.has(clave)) {
      const id = `${habilidad}/${familia}/${efectiva}`;
      return { habilidad, familia, semilla: efectiva, muestra, cartas, clave, id,
        explicacion: explicarSituacion(habilidad, cartas, muestra) };
    }
  }
  throw new Error("Se agotaron las muestras de la familia.");
}

export const proveedorSituaciones: ProveedorSituaciones = { generar: generarSituacion, evaluar: evaluarRespuesta };

/** Dos o tres cartas de una familia para una muestra fija. También las usa el generador de reels de video/. */
export { cartasDe as cartasDeFamilia };
