import { StyleSheet, View } from "react-native";
import Lienzo, { type PropsLienzo } from "./lienzo/Lienzo.tsx";

/** El lienzo al fondo de la mesa. En las apps Skia viene en el binario; la web usa CapaLienzo.web.tsx. */
export function CapaLienzo(props: PropsLienzo) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Lienzo {...props} />
    </View>
  );
}
