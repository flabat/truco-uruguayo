import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Rect } from "@eltruco/mesa-geometria";
import { fuentes } from "../../tema.ts";
import type { MesaVisible } from "../modelo.ts";
import { enRect, mesaColores } from "./estilo.ts";

/**
 * El título serif («Tu turno», «Diego tocó envido») y la línea de indicación. `fila` (las frases
 * del pie o la píldora de señas) reemplaza la indicación, en una fila de 26 de alto como máximo.
 */
export function Estado({ rect, estado, fila }: { rect: Rect; estado: MesaVisible["estado"]; fila?: ReactNode }) {
  return (
    <View style={[enRect(rect), estilos.estado]} pointerEvents="box-none" accessibilityLiveRegion="polite">
      <Text role="heading" aria-level={2} style={estilos.titulo} numberOfLines={1}>{estado.titulo}</Text>
      {fila ? (
        <View style={estilos.fila}>{fila}</View>
      ) : estado.indicacion ? (
        <Text style={estilos.indicacion} numberOfLines={1}>{estado.indicacion}</Text>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  estado: { alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  titulo: { color: mesaColores.crema, fontFamily: fuentes.titulo, fontSize: 19, lineHeight: 22 },
  fila: { alignItems: "center", height: 26, justifyContent: "center", maxWidth: "100%" },
  indicacion: { color: mesaColores.crema, fontFamily: fuentes.texto, fontSize: 12.5, lineHeight: 17, opacity: 0.9 },
});
