import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import { opcionesCanvasKit } from "./canvaskit.web.ts";
import type { PropsFestejo } from "./lienzo/Festejo.tsx";
import type { PropsLienzo } from "./lienzo/Lienzo.tsx";

// Mientras baja CanvasKit la mesa se ve igual en vistas, sobre el color del paño y sin cartas dibujadas.
const respaldo = <View style={[StyleSheet.absoluteFill, { backgroundColor: "#244936" }]} />;

/** El lienzo al fondo de la mesa. En la web, Skia y el lienzo se cargan aparte con `import()`. */
export function CapaLienzo(props: PropsLienzo) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <WithSkiaWeb opts={opcionesCanvasKit} getComponent={() => import("./lienzo/Lienzo.tsx")}
        fallback={respaldo} componentProps={props} />
    </View>
  );
}

// El mismo `import()` que el lienzo: el festejo no trae un paquete propio ni otra copia de Skia.
const cargarFestejo = () => import("./lienzo/Lienzo.tsx").then(m => ({ default: m.Festejo }));

/**
 * El segundo lienzo, chico, con las partículas del festejo. Cuando aparece, CanvasKit ya está
 * cargado por el lienzo del fondo (`LoadSkiaWeb` no lo vuelve a bajar).
 */
export function CapaFestejo(props: Omit<PropsFestejo, "ancho" | "alto">) {
  const [tamano, medir] = useState<{ ancho: number; alto: number } | null>(null);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}
      onLayout={e => medir({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height })}>
      {tamano ? <WithSkiaWeb opts={opcionesCanvasKit} getComponent={cargarFestejo} componentProps={{ ...props, ...tamano }} /> : null}
    </View>
  );
}
