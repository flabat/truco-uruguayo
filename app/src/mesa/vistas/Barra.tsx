import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Rect } from "@eltruco/mesa-geometria";
import { fuentes } from "../../tema.ts";
import type { MesaVisible } from "../modelo.ts";
import { enRect, mesaColores } from "./estilo.ts";

const forma = /^(.+) (\d+) · (\d+) (.+) · a (\d+)$/;

/** «Nos 12 · 9 Ellos · a 30» con los números destacados, como en la maqueta. */
function Tanteador({ texto }: { texto: string }) {
  const partes = forma.exec(texto);
  if (!partes) return <Text style={estilos.tanteador}>{texto}</Text>;
  const [, nos, puntosNos, puntosEllos, ellos, meta] = partes;
  return (
    <Text style={estilos.tanteador} numberOfLines={1}>
      {nos} <Text style={estilos.puntos}>{puntosNos}</Text> · <Text style={estilos.puntos}>{puntosEllos}</Text> {ellos}
      <Text style={estilos.meta}> · a {meta}</Text>
    </Text>
  );
}

export function Barra({ rect, tanteador, conectada, abrirMas }: {
  rect: Rect; tanteador: MesaVisible["tanteador"]; conectada: boolean; abrirMas: () => void;
}) {
  return (
    <View style={[enRect(rect), estilos.barra]} pointerEvents="box-none">
      <View style={estilos.pildoras} pointerEvents="none">
        <View accessibilityLabel="Tanteador" style={estilos.pildora}>
          <Tanteador texto={tanteador.texto} />
        </View>
        {conectada ? null : (
          <View style={estilos.pildora} accessibilityLiveRegion="polite">
            <Text style={estilos.red}>Reconectando…</Text>
          </View>
        )}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Más" onPress={abrirMas} hitSlop={8} style={estilos.menu}>
        <Text style={estilos.icono}>☰</Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 4 },
  pildoras: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: 6 },
  pildora: { backgroundColor: mesaColores.sombra, borderRadius: 999, flexShrink: 1, paddingHorizontal: 12, paddingVertical: 5 },
  tanteador: { color: mesaColores.crema, fontFamily: fuentes.texto, fontSize: 13 },
  puntos: { fontFamily: fuentes.textoFuerte, fontSize: 16 },
  meta: { fontSize: 12, opacity: 0.8 },
  red: { color: mesaColores.brillo, fontFamily: fuentes.textoFuerte, fontSize: 12 },
  menu: {
    alignItems: "center", backgroundColor: mesaColores.sombra, borderRadius: 18, height: 36, justifyContent: "center", width: 36,
  },
  icono: { color: mesaColores.crema, fontSize: 17 },
});
