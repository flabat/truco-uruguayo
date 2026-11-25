import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colores, fuentes } from "../../tema.ts";
import { mesaColores } from "./estilo.ts";

/** Un apartado de hoja con su rótulo en versalitas, como «Lo que pasó» en la maqueta. */
export function Apartado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={estilos.apartado} accessibilityLabel={titulo}>
      <Text role="heading" aria-level={3} style={estilos.rotulo}>{titulo}</Text>
      {children}
    </View>
  );
}

/** Una fila con separador: el texto a la izquierda y, si hay, el dato a la derecha. */
export function Fila({ children, dato }: { children: ReactNode; dato?: ReactNode }) {
  return (
    <View style={estilos.fila}>
      <Text style={estilos.texto}>{children}</Text>
      {dato != null ? <Text style={estilos.dato}>{dato}</Text> : null}
    </View>
  );
}

export function BotonDeHoja({ children, alPresionar, deshabilitado, principal, descripcion }: {
  children: ReactNode;
  alPresionar: () => void;
  deshabilitado?: boolean;
  principal?: boolean;
  descripcion?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityHint={descripcion} accessibilityState={{ disabled: deshabilitado }}
      disabled={deshabilitado} onPress={alPresionar}
      style={({ pressed }) => [estilos.boton, principal && estilos.principal, (pressed || deshabilitado) && estilos.apretado]}>
      <Text style={[estilos.textoBoton, principal && estilos.textoPrincipal]}>{children}</Text>
    </Pressable>
  );
}

export const estilosDeHoja = StyleSheet.create({
  nota: { color: mesaColores.gris, fontFamily: fuentes.texto, fontSize: 13, lineHeight: 18 },
  botones: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  fuerte: { fontFamily: fuentes.textoFuerte },
});

const estilos = StyleSheet.create({
  apartado: { marginTop: 8 },
  rotulo: {
    color: mesaColores.gris, fontFamily: fuentes.textoFuerte, fontSize: 11, letterSpacing: 0.7, marginBottom: 2,
    textTransform: "uppercase",
  },
  fila: {
    alignItems: "baseline", borderBottomColor: mesaColores.separador, borderBottomWidth: 1, flexDirection: "row", gap: 10,
    justifyContent: "space-between", paddingVertical: 6,
  },
  texto: { color: colores.tinta, flexShrink: 1, fontFamily: fuentes.texto, fontSize: 14, lineHeight: 19 },
  dato: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 14, lineHeight: 19, textAlign: "right" },
  boton: {
    alignItems: "center", borderColor: mesaColores.bordeBoton, borderRadius: 10, borderWidth: 1, justifyContent: "center",
    minHeight: 40, paddingHorizontal: 12, paddingVertical: 8,
  },
  principal: { backgroundColor: colores.tinta, borderColor: colores.tinta },
  apretado: { opacity: 0.6 },
  textoBoton: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 14 },
  textoPrincipal: { color: colores.papel },
});
