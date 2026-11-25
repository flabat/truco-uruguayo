import { useEffect, useMemo, useRef } from "react";
import { makeMutable, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";
import type { Carta } from "@eltruco/mesa-geometria";
import type { CardId } from "@eltruco/motor/cartas.ts";

/** En la mano, sin tocar. */
export const enMano = 0;
/** Con el dedo encima. */
export const arrastrando = 1;
/** Soltada para jugarla: queda donde se soltó hasta que la mesa la pone en el paño. */
export const soltada = 2;

/**
 * Una carta de la mano propia en valores compartidos, para que la vista que recibe el gesto y el
 * lienzo la dibujen igual. La carta se ve en `x + dx`, `y + dy - 18 * levantada`, con su `rotacion`
 * y escala `1 + 0.06 * levantada`.
 */
export interface CartaAnimada {
  x: SharedValue<number>;
  y: SharedValue<number>;
  ancho: SharedValue<number>;
  alto: SharedValue<number>;
  rotacion: SharedValue<number>;
  /** De 0 (en la mano) a 1 (levantada por el dedo). */
  levantada: SharedValue<number>;
  /** Desplazamiento del arrastre. */
  dx: SharedValue<number>;
  dy: SharedValue<number>;
  /** `enMano`, `arrastrando` o `soltada`. */
  fase: SharedValue<number>;
  /** Su lugar en la mano según la geometría vigente, adonde vuelve si no se juega. */
  lugar: SharedValue<Carta>;
}

export const duracionDeMano = 220;

function crear(c: Carta): CartaAnimada {
  return {
    x: makeMutable(c.x),
    y: makeMutable(c.y),
    ancho: makeMutable(c.ancho),
    alto: makeMutable(c.alto),
    rotacion: makeMutable(c.rotacion),
    levantada: makeMutable(0),
    dx: makeMutable(0),
    dy: makeMutable(0),
    fase: makeMutable(enMano),
    lugar: makeMutable(c),
  };
}

/** Lleva la carta a su lugar en la mano: la que no se juega y la que se acomoda a una geometría nueva. */
export function volverALaMano(a: CartaAnimada): void {
  "worklet";
  const l = a.lugar.value;
  const t = { duration: duracionDeMano };
  a.fase.value = enMano;
  a.x.value = withTiming(l.x, t);
  a.y.value = withTiming(l.y, t);
  a.ancho.value = withTiming(l.ancho, t);
  a.alto.value = withTiming(l.alto, t);
  a.rotacion.value = withTiming(l.rotacion, t);
  a.dx.value = withTiming(0, t);
  a.dy.value = withTiming(0, t);
  a.levantada.value = withTiming(0, t);
}

/**
 * Los valores animados de la mano propia: `cartas[i]` va a `destino[i]`. Con una geometría nueva,
 * las cartas en la mano se acomodan; la que se arrastra o ya se soltó solo cambia de lugar de vuelta.
 */
export function useManoAnimada(cartas: CardId[], destino: Carta[]): Map<CardId, CartaAnimada> {
  const guardadas = useRef(new Map<CardId, CartaAnimada>());
  const clave = cartas.join(" ");

  // Las cartas nuevas aparecen en su lugar; el reparto lo anima el lienzo.
  // Se arma de nuevo solo cuando cambian las cartas, no con cada geometría.
  const mano = useMemo(() => {
    const nueva = new Map<CardId, CartaAnimada>();
    cartas.forEach((id, i) => {
      const lugar = destino[i];
      const animada = guardadas.current.get(id) ?? (lugar ? crear(lugar) : undefined);
      if (animada) nueva.set(id, animada);
    });
    guardadas.current = nueva;
    return nueva;
  }, [clave, destino.length]);

  useEffect(() => {
    const pares: { animada: CartaAnimada; lugar: Carta }[] = [];
    cartas.forEach((id, i) => {
      const animada = mano.get(id);
      const lugar = destino[i];
      if (animada && lugar) pares.push({ animada, lugar });
    });
    // En el hilo de la interfaz, para no pisar un gesto que empieza en el mismo cuadro.
    scheduleOnUI(() => {
      "worklet";
      for (const { animada, lugar } of pares) {
        const antes = animada.lugar.value;
        const igual = antes.x === lugar.x && antes.y === lugar.y && antes.ancho === lugar.ancho
          && antes.alto === lugar.alto && antes.rotacion === lugar.rotacion;
        // La geometría se recalcula en cada render: sin cambios, no reinicia la animación en curso.
        if (igual) continue;
        animada.lugar.value = lugar;
        if (animada.fase.value === enMano) volverALaMano(animada);
      }
    });
  }, [mano, destino]);

  return mano;
}
