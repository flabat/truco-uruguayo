import { StyleSheet, Text, View } from "react-native";
import type { Rect } from "@eltruco/mesa-geometria";
import { fuentes } from "../../tema.ts";
import type { MesaVisible } from "../modelo.ts";
import { enRect, mesaColores } from "./estilo.ts";

/** El título serif («Tu turno», «Diego tocó envido») y la línea de indicación. */
export function Estado({ rect, estado }: { rect: Rect; estado: MesaVisible["estado"] }) {
  return (
    <View style={[enRect(rect), estilos.estado]} pointerEvents="none" accessibilityLiveRegion="polite">
      <Text role="heading" aria-level={2} style={estilos.titulo} numberOfLines={1}>{estado.titulo}</Text>
      {estado.indicacion ? <Text style={estilos.indicacion} numberOfLines={1}>{estado.indicacion}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  estado: { alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  titulo: { color: mesaColores.crema, fontFamily: fuentes.titulo, fontSize: 19, lineHeight: 24 },
  indicacion: { color: mesaColores.crema, fontFamily: fuentes.texto, fontSize: 12.5, lineHeight: 17, opacity: 0.9 },
});
