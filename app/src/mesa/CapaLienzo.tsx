import { StyleSheet, View } from "react-native";
import Lienzo, { type PropsLienzo } from "./lienzo/Lienzo.tsx";

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
