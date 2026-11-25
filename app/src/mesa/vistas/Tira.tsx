import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Rect } from "@eltruco/mesa-geometria";
import { fuentes } from "../../tema.ts";
import { enRect, mesaColores } from "./estilo.ts";

export type Pestana = "mano" | "tantos" | "voz" | "mas";

export const titulosDePestana = (tercetos: boolean): Record<Pestana, string> => ({
  mano: tercetos ? "Reparto" : "Mano",
  tantos: "Tantos",
  voz: "Voz",
  mas: "Más",
});

const iconos: Record<Pestana, string> = { mano: "📜", tantos: "🔢", voz: "🎙", mas: "⋯" };

/** Las pestañas de abajo en el teléfono. Cada una abre su hoja. */
export function Tira({ rect, tercetos, abrir }: { rect: Rect; tercetos: boolean; abrir: (p: Pestana) => void }) {
  const titulos = titulosDePestana(tercetos);
  return (
    <View style={[enRect(rect), estilos.tira]} accessibilityRole="tablist">
      {(Object.keys(titulos) as Pestana[]).map(p => (
        <Pressable key={p} accessibilityRole="tab" accessibilityLabel={titulos[p]} onPress={() => abrir(p)}
          style={({ pressed }) => [estilos.pestana, pressed && estilos.apretada]}>
          <Text style={estilos.icono} aria-hidden>{iconos[p]}</Text>
          <Text style={estilos.texto}>{titulos[p]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  tira: { alignItems: "stretch", backgroundColor: mesaColores.tira, flexDirection: "row", justifyContent: "space-around" },
  pestana: { alignItems: "center", flex: 1, gap: 2, justifyContent: "center", opacity: 0.9 },
  apretada: { backgroundColor: "rgba(255, 255, 255, 0.08)" },
  icono: { fontSize: 17, lineHeight: 21 },
  texto: { color: mesaColores.crema, fontFamily: fuentes.texto, fontSize: 11.5 },
});
