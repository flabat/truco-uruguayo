import { Pressable, StyleSheet, Text, View } from "react-native";
import { canto } from "@eltruco/cliente/cantos.ts";
import { colores, fuentes } from "../../tema.ts";
import type { Canto, HojaCantos as Hoja } from "../hoja-cantos.ts";
import { mesaColores } from "./estilo.ts";

function Boton({ tipo, principal = false, grande = false, cantar }: {
  tipo: Canto; principal?: boolean; grande?: boolean; cantar: (tipo: Canto) => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={() => cantar(tipo)}
      style={({ pressed }) => [estilos.boton, grande && estilos.botonGrande, principal && estilos.principal, pressed && estilos.apretado]}>
      <Text style={[estilos.textoBoton, grande && estilos.textoGrande, principal && estilos.textoPrincipal]}>{canto[tipo]}</Text>
    </Pressable>
  );
}

/** El contenido de la hoja de Cantos: respuestas grandes arriba, los cantos legales agrupados y el mazo aparte. */
export function HojaCantos({ hoja, cantar }: { hoja: Hoja; cantar: (tipo: Canto) => void }) {
  return (
    <View style={estilos.hoja}>
      <View style={estilos.cabecera}>
        <Text role="heading" aria-level={2} style={estilos.encabezado}>{hoja.encabezado}</Text>
        {hoja.detalle ? <Text style={estilos.detalle}>{hoja.detalle}</Text> : null}
      </View>
      {hoja.respuestas.length > 0 ? (
        <View style={estilos.grupo}>
          {hoja.modo === "respuesta" ? <Text style={estilos.nombreGrupo}>Responder</Text> : null}
          <View style={estilos.fila}>
            {hoja.respuestas.map((tipo, i) => (
              <View key={tipo} style={estilos.celda}>
                <Boton tipo={tipo} principal={i === 0} grande cantar={cantar} />
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {hoja.grupos.map(g => (
        <View key={g.nombre} style={estilos.grupo}>
          <Text style={estilos.nombreGrupo}>{g.nombre}</Text>
          <View style={estilos.fila}>
            {g.opciones.map(tipo => <Boton key={tipo} tipo={tipo} cantar={cantar} />)}
          </View>
        </View>
      ))}
      {hoja.notas.map(nota => <Text key={nota} style={estilos.nota}>{nota}</Text>)}
      {hoja.mazo ? (
        <View style={estilos.pie}>
          <Pressable accessibilityRole="button" onPress={() => cantar("mazo")}
            style={({ pressed }) => [estilos.boton, estilos.mazo, pressed && estilos.apretado]}>
            <Text style={[estilos.textoBoton, estilos.textoMazo]}>Irme al mazo</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  hoja: { gap: 4 },
  cabecera: { alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  encabezado: { color: colores.tinta, flexShrink: 1, fontFamily: fuentes.titulo, fontSize: 20 },
  detalle: { color: mesaColores.gris, fontFamily: fuentes.texto, fontSize: 13 },
  grupo: { gap: 5, marginTop: 4 },
  nombreGrupo: {
    color: mesaColores.gris, fontFamily: fuentes.textoFuerte, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase",
  },
  fila: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  celda: { flex: 1 },
  boton: {
    alignItems: "center", backgroundColor: "#fffdf6", borderColor: mesaColores.bordeBoton, borderRadius: 10, borderWidth: 1,
    justifyContent: "center", minHeight: 44, minWidth: 72, paddingHorizontal: 14, paddingVertical: 8,
  },
  botonGrande: { minHeight: 52 },
  principal: { backgroundColor: colores.tinta, borderColor: colores.tinta },
  apretado: { opacity: 0.75 },
  textoBoton: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 14 },
  textoGrande: { fontSize: 17 },
  textoPrincipal: { color: colores.papel },
  nota: { color: mesaColores.gris, fontFamily: fuentes.texto, fontSize: 12, lineHeight: 16, marginTop: 6 },
  pie: { borderTopColor: mesaColores.separador, borderTopWidth: 1, flexDirection: "row", marginTop: 10, paddingTop: 8 },
  mazo: { borderColor: mesaColores.bordeMazo },
  textoMazo: { color: colores.acento },
});
