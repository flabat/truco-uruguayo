import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Rect } from "@eltruco/mesa-geometria";
import { fuentes } from "../../tema.ts";
import { enRect, mesaColores } from "./estilo.ts";

/** Donde el jugador tiene su mano, el espectador ve que está mirando y la salida al salón. */
export function PieDelEspectador({ rect, salir }: { rect: Rect; salir: () => void }) {
  return (
    <View testID="pie-espectador" style={[enRect(rect), estilos.fila]} pointerEvents="box-none">
      <View style={estilos.pildora}>
        <Text style={estilos.texto}>👁 Mirando</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={salir} hitSlop={6}
        style={({ pressed }) => [estilos.pildora, estilos.boton, pressed && estilos.apretado]}>
        <Text style={estilos.texto}>Volver al salón</Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12 },
  pildora: { backgroundColor: mesaColores.sombra, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  boton: { borderColor: "rgba(255, 248, 231, 0.4)", borderWidth: 1 },
  apretado: { opacity: 0.8 },
  texto: { color: mesaColores.crema, fontFamily: fuentes.textoFuerte, fontSize: 13 },
});
