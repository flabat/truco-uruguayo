import { useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import { Canvas, Group, Rect } from "@shopify/react-native-skia";
import { Easing, useDerivedValue, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import { particulasDelFestejo, posicionDeParticula, type Particula } from "../movimiento.ts";

export interface PropsFestejo {
  /** El tamaño del cartel sobre el que se dibuja. */
  ancho: number;
  alto: number;
  cantidad: number;
  /** Cuándo salen, en ms desde que se monta: cuando el cartel ya apareció. */
  demora: number;
  duracion: number;
}

/**
 * Las partículas del chico ganado, en un segundo lienzo chico sobre el cartel (regla 2 del diseño:
 * el lienzo principal queda al fondo). Un solo reloj mueve todas.
 */
export default function Festejo({ ancho, alto, cantidad, demora, duracion }: PropsFestejo) {
  const particulas = useMemo(() => particulasDelFestejo(ancho, alto, cantidad, duracion), [ancho, alto, cantidad, duracion]);
  const reloj = useSharedValue(-1);
  useEffect(() => {
    reloj.value = withDelay(demora, withTiming(duracion, { duration: duracion, easing: Easing.linear }));
  }, [reloj, demora, duracion]);
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      {particulas.map((p, i) => <Papelito key={i} particula={p} reloj={reloj} duracion={duracion} />)}
    </Canvas>
  );
}

function Papelito({ particula, reloj, duracion }: { particula: Particula; reloj: SharedValue<number>; duracion: number }) {
  const ahora = useDerivedValue(() => posicionDeParticula(particula, reloj.value, duracion));
  const transform = useDerivedValue(() => [
    { translateX: ahora.value.x },
    { translateY: ahora.value.y },
    { rotate: (ahora.value.rotacion * Math.PI) / 180 },
  ]);
  const opacidad = useDerivedValue(() => ahora.value.opacidad);
  const { lado, color } = particula;
  return (
    <Group transform={transform} opacity={opacidad}>
      <Rect x={-lado / 2} y={-lado / 4} width={lado} height={lado / 2} color={color} />
    </Group>
  );
}
