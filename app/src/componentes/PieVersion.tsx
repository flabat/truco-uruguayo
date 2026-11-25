import { leerVersionServidor, textoDeVersion } from "@eltruco/cliente/version.ts";
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { baseDeLaApi } from "../configuracion.ts";
import { colores, fuentes } from "../tema.ts";

/** Rama y commit del servidor, en una esquina y sin tomar toques. Se oculta en los lanzamientos y si no hay API. */
export function PieVersion() {
  const [texto, setTexto] = useState<string | null>(null);
  const margen = useSafeAreaInsets();

  useEffect(() => {
    const control = new AbortController();
    fetch(baseDeLaApi.replace(/\/+$/, "") + "/api/version", { cache: "no-store", signal: control.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(datos => {
        const version = leerVersionServidor(datos);
        setTexto(version && textoDeVersion(version));
      })
      .catch(() => {});
    return () => control.abort();
  }, []);

  if (!texto) return null;
  return (
    <Text
      testID="pie-version"
      aria-label={"Versión del servidor: " + texto}
      pointerEvents="none"
      style={[estilos.pie, { left: margen.left + 6, bottom: margen.bottom + 2 }]}
    >
      {texto}
    </Text>
  );
}

const estilos = StyleSheet.create({
  pie: {
    position: "absolute",
    color: colores.tintaSuave,
    fontFamily: fuentes.texto,
    fontSize: 10,
    opacity: 0.7,
  },
});
