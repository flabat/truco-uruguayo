import { StyleSheet, View } from "react-native";
import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import { opcionesCanvasKit } from "./canvaskit.web.ts";
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
