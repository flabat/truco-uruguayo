import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Rect } from "@eltruco/mesa-geometria";
import { imagenesDeCartas } from "../../cartas/imagenes.ts";
import { colores, fuentes } from "../../tema.ts";
import type { FinDeMano as DatosFin } from "../modelo.ts";
import { enRect, mesaColores } from "./estilo.ts";

const anchoCarta = 40;
const proporcionCarta = 596 / 384;

/** La tarjeta de fin de mano sobre el paño: quién ganó, por qué, los cobros, las pruebas y el botón grande. */
export function FinDeMano({ fin, rect, alPresionar, deshabilitado }: {
  fin: DatosFin;
  /** `geometria.pano`. */
  rect: Rect;
  alPresionar: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <View testID="fin-de-mano" style={[enRect(rect), estilos.capa]} pointerEvents="box-none">
      <View style={estilos.tarjeta}>
        <ScrollView bounces={false} contentContainerStyle={estilos.contenido}>
          <Text role="heading" aria-level={2} style={estilos.titulo}>{fin.titulo}</Text>
          {fin.motivo ? <Text style={estilos.nota}>{fin.motivo}</Text> : null}
          <Text style={estilos.rotulo}>{fin.tituloCobros}</Text>
          {fin.cobros.map(c => (
            <View key={c.equipo} style={estilos.fila}>
              <Text style={estilos.equipo}>{c.equipo}</Text>
              <Text style={estilos.texto}>{c.texto}</Text>
            </View>
          ))}
          {fin.pruebas.map(p => (
            <View key={p.nombre + p.titulo} style={estilos.prueba} accessibilityLabel={p.nombre + " · " + p.titulo}>
              <Text style={estilos.nota}>{p.nombre} · {p.titulo}</Text>
              <View style={estilos.cartas}>
                {p.cartas.map(carta => (
                  <Image key={carta} source={imagenesDeCartas[carta]} style={estilos.carta} accessibilityIgnoresInvertColors />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
      <Pressable accessibilityRole="button" onPress={alPresionar} disabled={deshabilitado}
        accessibilityState={{ disabled: deshabilitado }}
        style={({ pressed }) => [estilos.boton, (pressed || deshabilitado) && estilos.apretado]}>
        <Text style={estilos.textoBoton}>{fin.boton}</Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  capa: {
    backgroundColor: "rgba(0, 0, 0, 0.2)", borderRadius: 12, gap: 12, justifyContent: "center", paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tarjeta: {
    backgroundColor: mesaColores.hoja, borderRadius: 16, boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)", flexShrink: 1,
    overflow: "hidden",
  },
  contenido: { padding: 14 },
  titulo: { color: colores.tinta, fontFamily: fuentes.titulo, fontSize: 22, lineHeight: 28 },
  nota: { color: mesaColores.gris, fontFamily: fuentes.texto, fontSize: 13, lineHeight: 18 },
  rotulo: {
    color: mesaColores.gris, fontFamily: fuentes.textoFuerte, fontSize: 11, letterSpacing: 0.7, marginTop: 10,
    textTransform: "uppercase",
  },
  fila: {
    borderBottomColor: mesaColores.separador, borderBottomWidth: 1, flexDirection: "row", gap: 10, paddingVertical: 6,
  },
  equipo: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 14, lineHeight: 19, minWidth: 44 },
  texto: { color: colores.tinta, flex: 1, fontFamily: fuentes.texto, fontSize: 14, lineHeight: 19 },
  prueba: { marginTop: 10 },
  cartas: { flexDirection: "row", gap: 4, marginTop: 4 },
  carta: { borderRadius: 3, height: anchoCarta * proporcionCarta, width: anchoCarta },
  boton: {
    alignItems: "center", backgroundColor: colores.acento, borderRadius: 999, boxShadow: "0 4px 10px rgba(0, 0, 0, 0.45)",
    justifyContent: "center", minHeight: 48, paddingHorizontal: 20,
  },
  apretado: { opacity: 0.8 },
  textoBoton: { color: "#ffffff", fontFamily: fuentes.textoFuerte, fontSize: 16 },
});
