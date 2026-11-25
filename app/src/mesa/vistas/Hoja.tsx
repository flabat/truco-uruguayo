import { useEffect, useRef, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { Rect } from "@eltruco/mesa-geometria";
import { mesaColores } from "./estilo.ts";

const subida = 240;
const fuera = 2000;

/**
 * La hoja inferior. Informa con `alMedir` el alto que pide su contenido; la geometría le devuelve
 * en `rect` el lugar que le deja sin tapar la mano, y si no le alcanza, el contenido se desplaza.
 * Si es cerrable, se cierra deslizándola hacia abajo; tocar el paño la cierra desde `MesaPantalla`.
 */
export function Hoja({ abierta, cerrable, alCerrar, alMedir, rect, relleno, etiqueta, children }: {
  abierta: boolean;
  cerrable: boolean;
  alCerrar: () => void;
  alMedir: (alto: number) => void;
  /** `geometria.hoja`: en el escritorio queda dentro de la columna central. */
  rect: Rect | null;
  /** El área segura de abajo, que la hoja cubre por debajo de su rectángulo. */
  relleno: number;
  etiqueta: string;
  children: ReactNode;
}) {
  const alto = rect?.alto ?? 0;
  const desplazamiento = useSharedValue(fuera);
  const medida = alto > 0;
  useEffect(() => {
    if (abierta && medida) desplazamiento.value = withTiming(0, { duration: subida });
    if (!abierta) desplazamiento.value = fuera;
  }, [abierta, medida, desplazamiento]);

  const total = alto + relleno;
  const arrastre = usePanGesture({
    enabled: cerrable,
    activeOffsetY: 6,
    onUpdate: e => {
      "worklet";
      desplazamiento.value = Math.max(0, e.translationY);
    },
    onDeactivate: e => {
      "worklet";
      if (e.translationY > Math.min(80, total / 3) || e.velocityY > 700) {
        desplazamiento.value = withTiming(total, { duration: 160 }, terminado => {
          if (terminado) scheduleOnRN(alCerrar);
        });
      } else {
        desplazamiento.value = withTiming(0, { duration: 160 });
      }
    },
  });
  const animado = useAnimatedStyle(() => ({ transform: [{ translateY: desplazamiento.value }] }));

  // Si el contenido no entra, la barra de desplazamiento parpadea una vez para avisar que hay más.
  const desplazable = useRef<ScrollViewInstance>(null);
  const avisado = useRef(false);
  useEffect(() => {
    if (!abierta) avisado.current = false;
  }, [abierta]);
  const medirContenido = (h: number) => {
    const pedido = Math.ceil(h + altoAsidero);
    alMedir(pedido);
    if (medida && pedido > alto + 1 && !avisado.current) {
      avisado.current = true;
      desplazable.current?.flashScrollIndicators();
    }
  };

  if (!abierta || !rect) return null;
  return (
    <Animated.View accessibilityLabel={etiqueta} accessibilityViewIsModal={!cerrable}
      style={[estilos.hoja, { left: rect.x, top: rect.y, width: rect.ancho, height: total, paddingBottom: relleno }, animado]}>
      <GestureDetector gesture={arrastre}>
        <View style={estilos.asidero}>
          {cerrable ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar la hoja" onPress={alCerrar} hitSlop={10} style={estilos.zonaAsa}>
              <View style={estilos.asa} />
            </Pressable>
          ) : (
            <View style={estilos.zonaAsa}><View style={estilos.asa} /></View>
          )}
        </View>
      </GestureDetector>
      <ScrollView ref={desplazable} style={estilos.desplazable} contentContainerStyle={estilos.contenido}
        onContentSizeChange={(_, h) => medirContenido(h)} bounces={false} persistentScrollbar>
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const altoAsidero = 20;

const estilos = StyleSheet.create({
  hoja: {
    backgroundColor: mesaColores.hoja,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    boxShadow: "0 -6px 20px rgba(0, 0, 0, 0.4)",
    overflow: "hidden",
    position: "absolute",
  },
  asidero: { alignItems: "center", height: altoAsidero, justifyContent: "center" },
  zonaAsa: { alignItems: "center", height: altoAsidero, justifyContent: "center", width: 80 },
  asa: { backgroundColor: mesaColores.asa, borderRadius: 2, height: 4, width: 36 },
  desplazable: { flex: 1 },
  contenido: { paddingBottom: 14, paddingHorizontal: 14 },
});
