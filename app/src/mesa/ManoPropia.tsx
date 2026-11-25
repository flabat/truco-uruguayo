import { useCallback, useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { GestureDetector, GestureHandlerRootView, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  measure, useAnimatedRef, useAnimatedStyle, useSharedValue, withTiming, type AnimatedRef, type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import type { Punto, Rect } from "@eltruco/mesa-geometria";
import { nombrar } from "@eltruco/cliente/textos.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { soltarCarta } from "./gesto-carta.ts";
import { arrastrando, enMano, soltada, volverALaMano, type CartaAnimada } from "./useManoAnimada.ts";

const subida = 18;
const escalaLevantada = 0.06;

interface Props {
  mano: Map<CardId, CartaAnimada>;
  pano: Rect;
  habilitada: boolean;
  jugar: (carta: CardId) => void;
}

/**
 * Las vistas transparentes que reciben el toque y el arrastre de la mano propia. Las cartas las
 * dibuja el lienzo con los mismos valores compartidos.
 */
export function ManoPropia({ mano, pano, habilitada, jugar }: Props) {
  const contenedor = useAnimatedRef<Animated.View>();
  // El gesto decide en el hilo de la interfaz con el paño y el permiso vigentes al soltar.
  const panoVivo = useSharedValue(pano);
  const habilitadaViva = useSharedValue(habilitada);
  const { x, y, ancho, alto } = pano;
  useEffect(() => {
    panoVivo.value = { x, y, ancho, alto };
  }, [panoVivo, x, y, ancho, alto]);
  // Al soltar una carta para jugarla, la mano se traba hasta que la mesa responde, para que dos
  // toques rápidos no manden dos jugadas. Si la jugada no prosperó y la carta sigue en la mano
  // cuando la mano se habilita de nuevo, regresa a su lugar.
  useEffect(() => {
    const cartas = [...mano.values()];
    scheduleOnUI(() => {
      "worklet";
      habilitadaViva.value = habilitada;
      if (habilitada) for (const c of cartas) if (c.fase.value === soltada) volverALaMano(c);
    });
  }, [habilitadaViva, habilitada, mano]);

  const ultimoJugar = useRef(jugar);
  ultimoJugar.current = jugar;
  const avisar = useCallback((id: CardId) => ultimoJugar.current(id), []);

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View ref={contenedor} style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {[...mano].map(([id, carta]) => (
          <CartaTocable key={id} id={id} carta={carta} contenedor={contenedor} pano={panoVivo}
            habilitada={habilitadaViva} activa={habilitada} jugar={avisar} />
        ))}
      </Animated.View>
    </GestureHandlerRootView>
  );
}

interface PropsCarta {
  id: CardId;
  carta: CartaAnimada;
  contenedor: AnimatedRef<Animated.View>;
  pano: SharedValue<Rect>;
  habilitada: SharedValue<boolean>;
  activa: boolean;
  jugar: (carta: CardId) => void;
}

function CartaTocable({ id, carta, contenedor, pano, habilitada, activa, jugar }: PropsCarta) {
  // Dónde apoyó el dedo y el origen del contenedor en la ventana, para pasar a puntos de la mesa.
  const inicio = useSharedValue<Punto>({ x: 0, y: 0 });
  const origen = useSharedValue<Punto>({ x: 0, y: 0 });

  const gesto = usePanGesture({
    minDistance: 0,
    enabled: activa,
    onBegin: e => {
      "worklet";
      if (carta.fase.value === soltada) return;
      const m = measure(contenedor);
      origen.value = { x: m?.pageX ?? 0, y: m?.pageY ?? 0 };
      inicio.value = { x: e.absoluteX - origen.value.x, y: e.absoluteY - origen.value.y };
      carta.fase.value = arrastrando;
      carta.dx.value = 0;
      carta.dy.value = 0;
      carta.levantada.value = withTiming(1, { duration: 120 });
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
        habilitada: habilitada.value,
      });
      if (decision === "jugar") {
        carta.fase.value = soltada;
        habilitada.value = false;
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
