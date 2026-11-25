import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Lienzo, { Festejo, type PropsLienzo } from "./lienzo/Lienzo.tsx";
import type { PropsFestejo } from "./lienzo/Festejo.tsx";

// Importala sin extensión (`from "./CapaLienzo"`): con `.tsx`, Metro toma este archivo también en la web,
// Skia entra en la ruta y se pierde el paquete aparte del lienzo. Lo comprueba tests/unit/app-mesa-capas.test.ts.

/** El lienzo al fondo de la mesa. En las apps Skia viene en el binario; la web tiene su propia versión. */
export function CapaLienzo(props: PropsLienzo) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Lienzo {...props} />
    </View>
  );
}

/** El segundo lienzo, chico, con las partículas del festejo: ocupa lo que mida la vista que lo contiene. */
export function CapaFestejo(props: Omit<PropsFestejo, "ancho" | "alto">) {
  const [tamano, medir] = useState<{ ancho: number; alto: number } | null>(null);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}
      onLayout={e => medir({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height })}>
      {tamano ? <Festejo {...props} {...tamano} /> : null}
    </View>
  );
}
