// Piezas del salón y la sala con el lenguaje de la mesa nueva: paño, píldoras y hojas de papel.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colores, fuentes } from "../tema.ts";

/** Tarjeta de paño, como el centro de la mesa. */
export function Pano({ children, etiqueta }: { children: ReactNode; etiqueta?: string }) {
  return <View aria-label={etiqueta} role={etiqueta ? "group" : undefined} style={estilos.pano}>{children}</View>;
}

/** Hoja de papel sobre el paño o la página. */
export function Hoja({ children, titulo }: { children: ReactNode; titulo?: string }) {
  return (
    <View style={estilos.hoja}>
      {titulo ? <Text role="heading" aria-level={2} style={estilos.tituloHoja}>{titulo}</Text> : null}
      {children}
    </View>
  );
}

export function Pildora({ children, clara = false }: { children: string; clara?: boolean }) {
  return <Text style={[estilos.pildora, clara && estilos.pildoraClara]}>{children}</Text>;
}

/** Opción de una sola elección (radio) o casilla, con forma de píldora. */
export function Opcion({ titulo, detalle, elegida, alElegir, tipo = "radio", deshabilitada = false }: {
  titulo: string; detalle?: string; elegida: boolean; alElegir: () => void;
  tipo?: "radio" | "checkbox"; deshabilitada?: boolean;
}) {
  return (
    <Pressable
      role={tipo}
      aria-checked={elegida}
      aria-disabled={deshabilitada}
      aria-label={detalle ? `${titulo}, ${detalle}` : titulo}
      disabled={deshabilitada}
      onPress={alElegir}
      style={[estilos.opcion, elegida && estilos.opcionElegida]}
    >
      <View style={[estilos.marca, tipo === "radio" && estilos.marcaRadio, elegida && (tipo === "radio" ? estilos.marcaRadioElegida : estilos.marcaElegida)]}>
        {elegida && tipo === "radio" ? <View style={estilos.puntoRadio} /> : null}
        {elegida && tipo === "checkbox" ? (
          <Svg width={14} height={14} viewBox="0 0 14 14" aria-hidden>
            <Path d="M2.5 7.5l3 3 6-7" fill="none" stroke={colores.panoClaro} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
      <View style={estilos.textos}>
        <Text style={[estilos.tituloOpcion, elegida && estilos.textoElegido]}>{titulo}</Text>
        {detalle ? <Text style={[estilos.detalle, elegida && estilos.textoElegido]}>{detalle}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Enlace con forma de texto subrayado, para volver o ir al perfil. */
export function EnlaceTexto({ children, alTocar }: { children: string; alTocar: () => void }) {
  return (
    <Pressable role="link" onPress={alTocar} hitSlop={8}>
      <Text style={estilos.enlace}>{children}</Text>
    </Pressable>
  );
}

export const estilos = StyleSheet.create({
  pano: {
    backgroundColor: colores.panoClaro,
    borderColor: colores.panoOscuro,
    borderRadius: 20,
    borderWidth: 4,
    gap: 10,
    padding: 16,
  },
  hoja: {
    backgroundColor: "#fffdf6",
    borderColor: colores.borde,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  tituloHoja: { color: colores.tinta, fontFamily: fuentes.titulo, fontSize: 22 },
  pildora: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(250, 248, 240, 0.16)",
    borderRadius: 999,
    color: colores.papel,
    fontFamily: fuentes.textoFuerte,
    fontSize: 13,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pildoraClara: { backgroundColor: "#efe9d6", color: colores.tinta },
  opcion: {
    alignItems: "center",
    borderColor: colores.borde,
    borderRadius: 999,
    borderWidth: 2,
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  opcionElegida: { backgroundColor: colores.panoClaro, borderColor: colores.panoOscuro },
  marca: { alignItems: "center", borderColor: colores.tintaSuave, borderRadius: 4, borderWidth: 2, height: 20, justifyContent: "center", width: 20 },
  marcaRadio: { borderRadius: 10 },
  marcaElegida: { backgroundColor: colores.papel, borderColor: colores.papel },
  marcaRadioElegida: { borderColor: colores.papel },
  puntoRadio: { backgroundColor: colores.papel, borderRadius: 4, height: 8, width: 8 },
  textos: { flex: 1 },
  tituloOpcion: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 16 },
  detalle: { color: colores.tintaSuave, fontFamily: fuentes.texto, fontSize: 14 },
  textoElegido: { color: colores.papel },
  enlace: { color: colores.panoClaro, fontFamily: fuentes.textoFuerte, fontSize: 16, textDecorationLine: "underline" },
});
