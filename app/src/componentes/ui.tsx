import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colores, fuentes } from "../tema.ts";

/** Pantalla con la franja de paño arriba y una columna de papel centrada. */
export function Pantalla({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <SafeAreaView style={estilos.fondo} edges={["top", "bottom"]}>
      <View style={estilos.pano}>
        <Text style={estilos.marca}>El Truco</Text>
      </View>
      <ScrollView contentContainerStyle={estilos.contenido}>
        <View style={estilos.columna}>
          <Text role="heading" aria-level={1} style={estilos.titulo}>{titulo}</Text>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type Variante = "principal" | "secundario" | "peligro" | "claro";

export function Boton({ children, onPress, variante = "principal", ocupado = false, etiqueta }: {
  children: string; onPress: () => void; variante?: Variante; ocupado?: boolean;
  /** Nombre accesible cuando el texto visible no alcanza («Agregar computadora al asiento 2»). */
  etiqueta?: string;
}) {
  return (
    <Pressable
      role="button"
      aria-label={etiqueta}
      aria-disabled={ocupado}
      disabled={ocupado}
      onPress={onPress}
      style={({ pressed }) => [estilos.boton, estilos[variante], (pressed || ocupado) && estilos.apretado]}
    >
      <Text style={[estilos.textoBoton, variante !== "principal" && { color: variante === "peligro" ? colores.acento : colores.tinta }]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function Parrafo({ children, suave = false }: { children: ReactNode; suave?: boolean }) {
  return <Text style={[estilos.parrafo, suave && { color: colores.tintaSuave }]}>{children}</Text>;
}

export function Aviso({ children }: { children: string }) {
  return <Text role="status" style={estilos.aviso}>{children}</Text>;
}

export function Cargando() {
  return (
    <View style={[estilos.fondo, estilos.centro]}>
      <ActivityIndicator color={colores.panoClaro} accessibilityLabel="Cargando" />
    </View>
  );
}

export const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.papel },
  centro: { alignItems: "center", justifyContent: "center" },
  pano: {
    backgroundColor: colores.panoOscuro,
    borderBottomColor: colores.panoClaro,
    borderBottomWidth: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  marca: { color: colores.papel, fontFamily: fuentes.titulo, fontSize: 22 },
  contenido: { padding: 16, alignItems: "center" },
  columna: { width: "100%", maxWidth: 480, gap: 16 },
  titulo: { color: colores.tinta, fontFamily: fuentes.titulo, fontSize: 32, marginTop: 8 },
  parrafo: { color: colores.tinta, fontFamily: fuentes.texto, fontSize: 16, lineHeight: 24 },
  aviso: {
    backgroundColor: "#efe9d6",
    borderLeftColor: colores.acento,
    borderLeftWidth: 4,
    color: colores.tinta,
    fontFamily: fuentes.texto,
    fontSize: 15,
    lineHeight: 22,
    padding: 12,
  },
  boton: { alignItems: "center", borderRadius: 999, borderWidth: 2, minHeight: 48, justifyContent: "center", paddingHorizontal: 20 },
  principal: { backgroundColor: colores.panoClaro, borderColor: colores.panoClaro },
  secundario: { backgroundColor: "transparent", borderColor: colores.tinta },
  peligro: { backgroundColor: "transparent", borderColor: colores.acento },
  // Sobre el paño: píldora de papel.
  claro: { backgroundColor: colores.papel, borderColor: colores.papel },
  apretado: { opacity: 0.7 },
  textoBoton: { color: colores.papel, fontFamily: fuentes.textoFuerte, fontSize: 16 },
});
