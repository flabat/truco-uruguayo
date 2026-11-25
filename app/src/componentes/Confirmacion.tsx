import { Modal, StyleSheet, Text, View } from "react-native";
import { colores, fuentes } from "../tema.ts";
import { Boton, Parrafo } from "./ui.tsx";

export function Confirmacion({ visible, titulo, texto, confirmar, ocupado, alConfirmar, alCancelar }: {
  visible: boolean; titulo: string; texto: string; confirmar: string; ocupado: boolean;
  alConfirmar: () => void; alCancelar: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={alCancelar}>
      <View style={estilos.velo}>
        <View role="dialog" aria-modal aria-label={titulo} style={estilos.hoja}>
          <Text role="heading" aria-level={2} style={estilos.titulo}>{titulo}</Text>
          <Parrafo>{texto}</Parrafo>
          <Boton variante="peligro" onPress={alConfirmar} ocupado={ocupado}>{confirmar}</Boton>
          <Boton variante="secundario" onPress={alCancelar} ocupado={ocupado}>Cancelar</Boton>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  velo: { flex: 1, backgroundColor: "rgba(28, 57, 45, 0.6)", justifyContent: "center", padding: 16, alignItems: "center" },
  hoja: { backgroundColor: colores.papel, borderRadius: 16, gap: 16, maxWidth: 480, padding: 20, width: "100%" },
  titulo: { color: colores.tinta, fontFamily: fuentes.titulo, fontSize: 24 },
});
