import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { GeometriaAsiento } from "@eltruco/mesa-geometria";
import { lugarDelGlobo, punta, type Limites, type Punta } from "../lugar-globo.ts";
import { curvaDeGlobo, movimiento } from "../movimiento.ts";
import { mesaColores } from "./estilo.ts";

const curva = Easing.bezier(...curvaDeGlobo);

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

/** Un globo de papel que salta desde su asiento. Con `alTocar`, tocarlo lo achica. */
export function Globo({ asiento, posicion, limites, testID, etiqueta, liviano = false, alTocar, children }: {
  asiento: GeometriaAsiento;
  posicion: "costado" | "debajo";
  limites: Limites;
  testID?: string;
  etiqueta?: string;
  liviano?: boolean;
  alTocar?: () => void;
  children: ReactNode;
}) {
  const { duracion } = movimiento(liviano).globo;
  const [tamano, cambiarTamano] = useState<{ ancho: number; alto: number } | null>(null);
  const escala = useSharedValue(0);
  // Se mide antes de saltar: hasta saber su tamaño no sabe de qué lado está el asiento.
  useEffect(() => {
    if (tamano) escala.value = withTiming(1, { duration: duracion, easing: curva });
  }, [escala, tamano !== null]);
  const animado = useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }));

  const medir = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!tamano || Math.abs(tamano.ancho - width) > 0.5 || Math.abs(tamano.alto - height) > 0.5)
      cambiarTamano({ ancho: width, alto: height });
  };

  const lugar = tamano ? lugarDelGlobo(asiento, posicion, tamano, limites) : null;
  const maxAncho = Math.min(240, limites.columna.ancho - 8);
  const estiloPunta = lugar?.punta && {
    arriba: { top: -punta, left: limitar(lugar.puntaEn - punta, 10, (tamano?.ancho ?? 0) - 24), ...triangulo("arriba") },
    abajo: { bottom: -punta, left: limitar(lugar.puntaEn - punta, 10, (tamano?.ancho ?? 0) - 24), ...triangulo("abajo") },
    izquierda: { left: -punta, top: lugar.puntaEn - punta / 2, ...triangulo("izquierda") },
    derecha: { right: -punta, top: lugar.puntaEn - punta / 2, ...triangulo("derecha") },
  }[lugar.punta];
  // Salta desde la punta, que señala al asiento.
  const origen = lugar?.punta && tamano && {
    arriba: `${lugar.puntaEn}px 0px`,
    abajo: `${lugar.puntaEn}px ${tamano.alto}px`,
    izquierda: `0px ${lugar.puntaEn}px`,
    derecha: `${tamano.ancho}px ${lugar.puntaEn}px`,
  }[lugar.punta];

  return (
    <Animated.View testID={testID} accessibilityLabel={alTocar ? undefined : etiqueta} onLayout={medir}
      pointerEvents={alTocar ? "box-none" : "none"}
      style={[estilos.globo, { maxWidth: maxAncho }, lugar ? { left: lugar.left, top: lugar.top, transformOrigin: origen || "center" } : estilos.oculto, animado]}>
      {alTocar ? (
        <Pressable accessibilityRole="button" accessibilityLabel={etiqueta} accessibilityHint="Lo achica junto al nombre"
          onPress={alTocar} style={estilos.tocable}>
          {children}
        </Pressable>
      ) : children}
      {estiloPunta ? <View style={[estilos.punta, estiloPunta]} /> : null}
    </Animated.View>
  );
}

function triangulo(hacia: Punta) {
  const transparente = "transparent";
  const base = { borderTopColor: transparente, borderBottomColor: transparente, borderLeftColor: transparente, borderRightColor: transparente };
  switch (hacia) {
    case "arriba": return { ...base, borderBottomColor: mesaColores.hoja, borderBottomWidth: punta, borderLeftWidth: punta, borderRightWidth: punta };
    case "abajo": return { ...base, borderTopColor: mesaColores.hoja, borderTopWidth: punta, borderLeftWidth: punta, borderRightWidth: punta };
    case "izquierda": return { ...base, borderRightColor: mesaColores.hoja, borderRightWidth: punta, borderTopWidth: punta, borderBottomWidth: punta };
    case "derecha": return { ...base, borderLeftColor: mesaColores.hoja, borderLeftWidth: punta, borderTopWidth: punta, borderBottomWidth: punta };
  }
}

const estilos = StyleSheet.create({
  globo: {
    backgroundColor: mesaColores.hoja,
    borderRadius: 14,
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.45)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: "absolute",
  },
  oculto: { left: -9999, top: 0 },
  // El toque cubre también el margen del globo.
  tocable: { marginHorizontal: -10, marginVertical: -6, paddingHorizontal: 10, paddingVertical: 6 },
  punta: { height: 0, position: "absolute", width: 0 },
});
