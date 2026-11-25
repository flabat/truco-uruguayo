import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { GeometriaAsiento, Rect } from "@eltruco/mesa-geometria";
import { mesaColores } from "./estilo.ts";

const separacion = 6;
const punta = 7;

type Punta = "arriba" | "abajo" | "izquierda" | "derecha";

function cajaDe(a: GeometriaAsiento): Rect {
  const partes = [a.rotulo, a.jugada, ...a.dorsos].filter((r): r is Rect => r != null);
  if (partes.length === 0) return { x: a.ancla.x, y: a.ancla.y, ancho: 0, alto: 0 };
  const x = Math.min(...partes.map(p => p.x));
  const y = Math.min(...partes.map(p => p.y));
  return {
    x, y,
    ancho: Math.max(...partes.map(p => p.x + p.ancho)) - x,
    alto: Math.max(...partes.map(p => p.y + p.alto)) - y,
  };
}

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

/**
 * Dónde va un globo de `ancho` × `alto` para el asiento `a`. «costado» (cantos y frases) se abre
 * hacia el centro del paño; «debajo» (señas del pie) cuelga del asiento. El de abajo, el propio,
 * siempre va encima del estado.
 */
export function lugarDelGlobo(
  a: GeometriaAsiento, posicion: "costado" | "debajo", tamano: { ancho: number; alto: number },
  limites: { columna: Rect; arriba: number; estado: Rect },
): { left: number; top: number; punta: Punta; puntaEn: number } {
  const { columna, arriba, estado } = limites;
  const caja = cajaDe(a);
  const minX = columna.x + 4;
  const maxX = columna.x + columna.ancho - tamano.ancho - 4;
  const centrado = (x: number) => limitar(x - tamano.ancho / 2, minX, maxX);
  if (a.lugar === "abajo") {
    const left = centrado(a.ancla.x);
    return { left, top: estado.y - tamano.alto - separacion, punta: "abajo", puntaEn: a.ancla.x - left };
  }
  if (posicion === "debajo") {
    const left = centrado(a.ancla.x);
    return { left, top: caja.y + caja.alto + separacion, punta: "arriba", puntaEn: a.ancla.x - left };
  }
  const top = limitar(caja.y + (a.rotulo?.alto ?? 0) / 2 - punta - 6, arriba, estado.y - tamano.alto);
  const aLaDerecha = caja.x + caja.ancho + separacion;
  const aLaIzquierda = caja.x - separacion - tamano.ancho;
  const haciaLaDerecha = a.lugar.includes("izquierda") || (!a.lugar.includes("derecha") && aLaDerecha <= maxX);
  if (haciaLaDerecha && aLaDerecha <= maxX + 4) return { left: aLaDerecha, top, punta: "izquierda", puntaEn: 14 };
  if (aLaIzquierda >= minX - 4) return { left: aLaIzquierda, top, punta: "derecha", puntaEn: 14 };
  const left = centrado(a.ancla.x);
  return { left, top: caja.y + caja.alto + separacion, punta: "arriba", puntaEn: a.ancla.x - left };
}

/** Un globo de papel que salta desde su asiento. */
export function Globo({ asiento, posicion, limites, testID, etiqueta, children }: {
  asiento: GeometriaAsiento;
  posicion: "costado" | "debajo";
  limites: { columna: Rect; arriba: number; estado: Rect };
  testID?: string;
  etiqueta?: string;
  children: ReactNode;
}) {
  const [tamano, cambiarTamano] = useState<{ ancho: number; alto: number } | null>(null);
  const escala = useSharedValue(0);
  useEffect(() => {
    if (tamano) escala.value = withTiming(1, { duration: 220 });
  }, [escala, tamano !== null]);
  const animado = useAnimatedStyle(() => ({ opacity: escala.value, transform: [{ scale: 0.6 + 0.4 * escala.value }] }));

  const medir = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!tamano || Math.abs(tamano.ancho - width) > 0.5 || Math.abs(tamano.alto - height) > 0.5)
      cambiarTamano({ ancho: width, alto: height });
  };

  const lugar = tamano ? lugarDelGlobo(asiento, posicion, tamano, limites) : null;
  const maxAncho = Math.min(240, limites.columna.ancho - 8);
  const estiloPunta = lugar && {
    arriba: { top: -punta, left: limitar(lugar.puntaEn - punta, 10, (tamano?.ancho ?? 0) - 24), ...triangulo("arriba") },
    abajo: { bottom: -punta, left: limitar(lugar.puntaEn - punta, 10, (tamano?.ancho ?? 0) - 24), ...triangulo("abajo") },
    izquierda: { left: -punta, top: lugar.puntaEn - punta / 2, ...triangulo("izquierda") },
    derecha: { right: -punta, top: lugar.puntaEn - punta / 2, ...triangulo("derecha") },
  }[lugar.punta];

  return (
    <Animated.View testID={testID} accessibilityLabel={etiqueta} onLayout={medir} pointerEvents="none"
      style={[estilos.globo, { maxWidth: maxAncho }, lugar ? { left: lugar.left, top: lugar.top } : estilos.oculto, animado]}>
      {children}
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
  punta: { height: 0, position: "absolute", width: 0 },
});
