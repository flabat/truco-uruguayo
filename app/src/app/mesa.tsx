import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Boton, Pantalla, Parrafo } from "../componentes/ui.tsx";
import { colores, fuentes } from "../tema.ts";

/** Ruta provisoria: la mesa del diseño llega en la parte 4d y reemplaza esta pantalla. */
export default function MesaDePrueba() {
  return (
    <Pantalla titulo="Mesa de prueba">
      <View style={estilos.pano}>
        <Text style={estilos.texto}>Acá va la mesa</Text>
      </View>
      <Parrafo suave>Esta pantalla es provisoria. La mesa nueva llega en una próxima versión de la app.</Parrafo>
      <Boton variante="secundario" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>Volver</Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  pano: {
    alignItems: "center",
    aspectRatio: 1.4,
    backgroundColor: colores.panoClaro,
    borderColor: colores.panoOscuro,
    borderRadius: 24,
    borderWidth: 6,
    justifyContent: "center",
  },
  texto: { color: colores.papel, fontFamily: fuentes.titulo, fontSize: 22 },
});
