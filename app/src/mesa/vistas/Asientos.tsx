import { StyleSheet, Text, View } from "react-native";
import type { Geometria, GeometriaAsiento } from "@eltruco/mesa-geometria";
import { nombrar } from "@eltruco/cliente/textos.ts";
import { fuentes } from "../../tema.ts";
import type { AsientoVisible, MesaVisible } from "../modelo.ts";
import { enRect, mesaColores } from "./estilo.ts";
import { cajasDelMazo, Globo } from "./Globo.tsx";

const colorDeEquipo = ["#d8a24a", "#7fb4d8"] as const;

function Rotulo({ asiento, geo, propio }: { asiento: AsientoVisible; geo: GeometriaAsiento; propio: boolean }) {
  const rect = geo.rotulo!;
  const papel = [propio ? null : asiento.papel, ...asiento.etiquetas].filter(Boolean).join(" · ");
  const etiqueta = [asiento.nombre, propio ? "Vos" : null, papel, asiento.turno ? "tiene el turno" : null].filter(Boolean).join(", ");

  if (geo.forma === "punto") {
    return (
      <View style={[enRect(rect), estilos.centro, estilos.tenue]} accessibilityLabel={etiqueta}>
        <Text style={estilos.nombreChico} numberOfLines={1}>{asiento.nombre}</Text>
        {asiento.estadoPico ? <Text style={estilos.papel} numberOfLines={1}>{asiento.estadoPico}</Text> : null}
      </View>
    );
  }
  if (geo.forma === "circulo") {
    return (
      <View style={[enRect(rect), estilos.centro]} accessibilityLabel={etiqueta}>
        <View style={[estilos.circulo, { borderColor: colorDeEquipo[asiento.equipo] }, asiento.turno && estilos.circuloDeTurno]}>
          <Text style={estilos.inicial}>{asiento.inicial}</Text>
        </View>
        <Text style={[estilos.nombreChico, asiento.turno && estilos.nombreDeTurno]} numberOfLines={1}>{asiento.nombre}</Text>
      </View>
    );
  }
  return (
    <View style={[enRect(rect), propio ? estilos.izquierda : estilos.centro]} accessibilityLabel={etiqueta}>
      <View style={[estilos.placa, asiento.turno && estilos.placaDeTurno]}>
        <Text style={[estilos.nombre, asiento.turno && estilos.nombreDeTurno]} numberOfLines={1}>
          {propio ? asiento.nombre + " · Vos" : asiento.nombre}
        </Text>
        {papel ? <Text style={estilos.papel} numberOfLines={1}>{papel}</Text> : null}
      </View>
    </View>
  );
}

/** El rótulo de la muestra entra en una línea: se ensancha alrededor del mazo, dentro de la columna. */
function rotuloDeMuestra({ mazo, columna }: Geometria) {
  const ancho = Math.max(mazo.rotulo.ancho, 136);
  const centro = mazo.rotulo.x + mazo.rotulo.ancho / 2;
  const x = Math.max(columna.x + 2, Math.min(centro - ancho / 2, columna.x + columna.ancho - ancho - 2));
  return { ...mazo.rotulo, x, ancho };
}

/**
 * Nombre y papel de cada asiento, los globos de canto que saltan desde su ancla y el rótulo de la
 * muestra. Las cartas las dibuja el lienzo.
 */
export function Asientos({ mesa, geometria }: { mesa: MesaVisible; geometria: Geometria }) {
  const limites = {
    columna: geometria.columna, arriba: geometria.barra.y + geometria.barra.alto, estado: geometria.estado,
    evitar: cajasDelMazo(geometria),
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {mesa.asientos.map(a => {
        const geo = geometria.asientos[a.asiento];
        if (!geo?.rotulo) return null;
        return <Rotulo key={a.asiento} asiento={a} geo={geo} propio={a.asiento === mesa.propio} />;
      })}
      <View style={[enRect(rotuloDeMuestra(geometria)), estilos.centro]}>
        <Text style={estilos.muestra} numberOfLines={1}>
          Muestra · <Text style={estilos.muestraCarta}>{nombrar(mesa.muestra)}</Text>
        </Text>
      </View>
      {mesa.voces.map(voz => {
        const geo = geometria.asientos[voz.asiento];
        if (!geo) return null;
        const nombre = mesa.asientos[voz.asiento]?.nombre ?? "";
        return (
          <Globo key={voz.asiento + ":" + voz.indice + ":" + voz.texto} asiento={geo} posicion="costado"
            limites={limites} testID={"globo-voz-" + voz.asiento} etiqueta={nombre + ": " + voz.texto}>
            <Text style={estilos.voz}>{voz.texto}</Text>
          </Globo>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  centro: { alignItems: "center", justifyContent: "center" },
  izquierda: { alignItems: "flex-start", justifyContent: "center" },
  tenue: { opacity: 0.55 },
  placa: { alignItems: "center", borderColor: "transparent", borderRadius: 10, borderWidth: 1, maxWidth: "100%", paddingHorizontal: 6 },
  placaDeTurno: { backgroundColor: "rgba(255, 232, 132, 0.16)", borderColor: "rgba(255, 232, 132, 0.75)" },
  nombre: { color: mesaColores.crema, fontFamily: fuentes.textoFuerte, fontSize: 13, lineHeight: 16 },
  nombreChico: { color: mesaColores.crema, fontFamily: fuentes.textoFuerte, fontSize: 11, lineHeight: 14 },
  nombreDeTurno: { color: mesaColores.brillo },
  papel: { color: mesaColores.crema, fontFamily: fuentes.texto, fontSize: 11, lineHeight: 14, opacity: 0.75 },
  circulo: {
    alignItems: "center", backgroundColor: mesaColores.sombra, borderRadius: 14, borderWidth: 2, height: 28,
    justifyContent: "center", width: 28,
  },
  circuloDeTurno: { backgroundColor: "rgba(255, 232, 132, 0.3)" },
  inicial: { color: mesaColores.crema, fontFamily: fuentes.textoFuerte, fontSize: 13 },
  muestra: { color: mesaColores.crema, fontFamily: fuentes.texto, fontSize: 10.5, lineHeight: 13, textAlign: "center" },
  muestraCarta: { fontFamily: fuentes.textoFuerte },
  voz: { color: "#233d31", fontFamily: fuentes.textoFuerte, fontSize: 13 },
});
