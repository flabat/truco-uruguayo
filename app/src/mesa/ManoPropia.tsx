import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { StyleSheet } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  measure, useAnimatedRef, useAnimatedStyle, useSharedValue, withTiming, type AnimatedRef, type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import type { Punto, Rect } from "@eltruco/mesa-geometria";
import { nombrar } from "@eltruco/cliente/textos.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { vibrar } from "./hapticos.ts";
import { soltarCarta } from "./gesto-carta.ts";
import { arrastrando, enMano, soltada, volverALaMano, type CartaAnimada } from "./useManoAnimada.ts";

/** Juega una carta sin gesto (los atajos de teclado). */
export type JugarSinGesto = (carta: CardId) => void;

const subida = 18;
const escalaLevantada = 0.06;

interface Props {
  mano: Map<CardId, CartaAnimada>;
  pano: Rect;
  habilitada: boolean;
  jugar: (carta: CardId) => void;
  /**
   * Cuántas jugadas rechazó el servidor o no se pudieron enviar. Una carta soltada para jugarla
   * queda donde se soltó, y la mano trabada, hasta que sale de `mano` (el estado la puso en el
   * paño) o cambia este número: entonces vuelve a la mano y la mano se destraba.
   */
  rechazos: number;
  /**
   * `ManoPropia` deja acá una función que juega una carta por el mismo camino que el toque: solo
   * si la mano está habilitada y no trabada, la levanta, traba la mano y llama a `jugar`.
   */
  sinGesto?: RefObject<JugarSinGesto | null>;
  /** Vibra al levantar (liviano) y al apoyar para jugar (medio). */
  hapticos?: boolean;
}

/**
 * Las vistas transparentes que reciben el toque y el arrastre de la mano propia. Las cartas las
 * dibuja el lienzo con los mismos valores compartidos.
 */
export function ManoPropia({ mano, pano, habilitada, jugar, rechazos, sinGesto, hapticos = false }: Props) {
  const contenedor = useAnimatedRef<Animated.View>();
  // El gesto decide en el hilo de la interfaz con el paño y el permiso vigentes al soltar.
  const panoVivo = useSharedValue(pano);
  const habilitadaViva = useSharedValue(habilitada);
  const hapticosVivos = useSharedValue(hapticos);
  const { x, y, ancho, alto } = pano;
  useEffect(() => {
    panoVivo.value = { x, y, ancho, alto };
  }, [panoVivo, x, y, ancho, alto]);
  useEffect(() => {
    habilitadaViva.value = habilitada;
  }, [habilitadaViva, habilitada]);
  useEffect(() => {
    hapticosVivos.value = hapticos;
  }, [hapticosVivos, hapticos]);

  // Con una carta soltada la mano queda trabada, para que dos toques rápidos no manden dos jugadas.
  const trabada = useSharedValue(false);
  useEffect(() => {
    const cartas = [...mano.values()];
    scheduleOnUI(() => {
      "worklet";
      trabada.value = cartas.some(c => c.fase.value === soltada);
    });
  }, [trabada, mano]);

  const rechazosVistos = useRef(rechazos);
  useEffect(() => {
    if (rechazos === rechazosVistos.current) return;
    rechazosVistos.current = rechazos;
    const cartas = [...mano.values()];
    scheduleOnUI(() => {
      "worklet";
      for (const c of cartas) if (c.fase.value === soltada) volverALaMano(c);
      trabada.value = false;
    });
  }, [rechazos, mano, trabada]);

  const ultimoJugar = useRef(jugar);
  useLayoutEffect(() => {
    ultimoJugar.current = jugar;
  }, [jugar]);
  const avisar = useCallback((id: CardId) => ultimoJugar.current(id), []);

  useLayoutEffect(() => {
    if (!sinGesto) return;
    sinGesto.current = id => {
      const carta = mano.get(id);
      if (!carta) return;
      scheduleOnUI(() => {
        "worklet";
        if (!habilitadaViva.value || trabada.value || carta.fase.value !== enMano) return;
        carta.fase.value = soltada;
        carta.levantada.value = withTiming(1, { duration: 120 });
        trabada.value = true;
        scheduleOnRN(avisar, id);
      });
    };
    return () => {
      sinGesto.current = null;
    };
  }, [sinGesto, mano, habilitadaViva, trabada, avisar]);

  return (
    <Animated.View ref={contenedor} style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {[...mano].map(([id, carta]) => (
        <CartaTocable key={id} id={id} carta={carta} contenedor={contenedor} pano={panoVivo}
          habilitada={habilitadaViva} trabada={trabada} hapticos={hapticosVivos} activa={habilitada} jugar={avisar} />
      ))}
    </Animated.View>
  );
}

interface PropsCarta {
  id: CardId;
  carta: CartaAnimada;
  contenedor: AnimatedRef<Animated.View>;
  pano: SharedValue<Rect>;
  habilitada: SharedValue<boolean>;
  trabada: SharedValue<boolean>;
  hapticos: SharedValue<boolean>;
  activa: boolean;
  jugar: (carta: CardId) => void;
}

function CartaTocable({ id, carta, contenedor, pano, habilitada, trabada, hapticos, activa, jugar }: PropsCarta) {
  // Dónde apoyó el dedo y el origen del contenedor en la ventana, para pasar a puntos de la mesa.
  const inicio = useSharedValue<Punto>({ x: 0, y: 0 });
  const origen = useSharedValue<Punto>({ x: 0, y: 0 });

  const gesto = usePanGesture({
    minDistance: 0,
    enabled: activa,
    onBegin: e => {
      "worklet";
      if (trabada.value) return;
      const m = measure(contenedor);
      origen.value = { x: m?.pageX ?? 0, y: m?.pageY ?? 0 };
      inicio.value = { x: e.absoluteX - origen.value.x, y: e.absoluteY - origen.value.y };
      carta.fase.value = arrastrando;
      carta.dx.value = 0;
      carta.dy.value = 0;
      carta.levantada.value = withTiming(1, { duration: 120 });
      if (hapticos.value) scheduleOnRN(vibrar, "liviano");
    },
    onUpdate: e => {
      "worklet";
      carta.dx.value = e.translationX;
      carta.dy.value = e.translationY;
    },
    // Llega también cuando un toque sin movimiento termina sin activar el arrastre.
    onFinalize: e => {
      "worklet";
      if (carta.fase.value !== arrastrando) return;
      const fin = { x: e.absoluteX - origen.value.x, y: e.absoluteY - origen.value.y };
      carta.dx.value = fin.x - inicio.value.x;
      carta.dy.value = fin.y - inicio.value.y;
      const decision = soltarCarta({
        inicio: inicio.value,
        fin,
        carta: {
          x: carta.x.value, y: carta.y.value, ancho: carta.ancho.value, alto: carta.alto.value,
          rotacion: carta.rotacion.value,
        },
        pano: pano.value,
        habilitada: habilitada.value && !trabada.value,
      });
      if (decision === "jugar") {
        carta.fase.value = soltada;
        trabada.value = true;
        if (hapticos.value) scheduleOnRN(vibrar, "medio");
        scheduleOnRN(jugar, id);
      } else {
        volverALaMano(carta);
      }
    },
  });

  const estilo = useAnimatedStyle(() => ({
    left: carta.x.value,
    top: carta.y.value,
    width: carta.ancho.value,
    height: carta.alto.value,
    zIndex: carta.fase.value === enMano ? 0 : 1,
    transform: [
      { translateX: carta.dx.value },
      { translateY: carta.dy.value - subida * carta.levantada.value },
      { rotate: `${carta.rotacion.value}deg` },
      { scale: 1 + escalaLevantada * carta.levantada.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesto}>
      <Animated.View testID={"carta-" + id} accessibilityLabel={"Jugar " + nombrar(id)}
        accessibilityRole="button" style={[styles.carta, estilo]} />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  carta: { position: "absolute" },
});
