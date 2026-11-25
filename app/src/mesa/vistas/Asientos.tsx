import { StyleSheet, Text, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import type { Geometria, GeometriaAsiento, Rect } from "@eltruco/mesa-geometria";
import { nombrar } from "@eltruco/cliente/textos.ts";
import { fuentes } from "../../tema.ts";
import type { AsientoVisible, MesaVisible } from "../modelo.ts";
import { enRect, mesaColores } from "./estilo.ts";
import { cajasDelMazo, Globo } from "./Globo.tsx";

// Los dos equipos de tercetos, con los tonos de la maqueta tercetos-v2.
const colorDeEquipo = ["#f2d27a", "#c9886f"] as const;

// En tercetos, al cambiar de duelo el rótulo del rival nuevo se desliza de su punto al lugar grande.
const deslizar = LinearTransition.duration(320);

function Contenido({ asiento, forma, propio, papel }: {
  asiento: AsientoVisible; forma: GeometriaAsiento["forma"]; propio: boolean; papel: string;
}) {
  if (forma === "punto") {
    return (
      <View style={[estilos.fila, estilos.tenue]}>
        <View style={[estilos.circuloChico, { backgroundColor: colorDeEquipo[asiento.equipo] }]}>
          <Text style={estilos.inicialChica}>{asiento.inicial}</Text>
        </View>
        <View style={estilos.encoger}>
          <Text style={estilos.nombreChico} numberOfLines={1}>{propio ? asiento.nombre + " · Vos" : asiento.nombre}</Text>
          {asiento.estadoPico ? <Text style={estilos.estadoPico} numberOfLines={1}>{asiento.estadoPico}</Text> : null}
        </View>
      </View>
    );
  }
  if (forma === "circulo") {
    return (
      <>
        <View style={[estilos.circulo, { backgroundColor: colorDeEquipo[asiento.equipo] }, asiento.turno && estilos.circuloDeTurno]}>
          <Text style={estilos.inicial}>{asiento.inicial}</Text>
        </View>
        <Text style={[estilos.nombreChico, asiento.turno && estilos.nombreDeTurno]} numberOfLines={1}>{asiento.nombre}</Text>
      </>
    );
  }
  return (
    <View style={[estilos.placa, asiento.turno && estilos.placaDeTurno]}>
      <Text style={[estilos.nombre, asiento.turno && estilos.nombreDeTurno]} numberOfLines={1}>
        {propio ? asiento.nombre + " · Vos" : asiento.nombre}
      </Text>
      {papel ? <Text style={estilos.papel} numberOfLines={1}>{papel}</Text> : null}
    </View>
  );
}

const anchoDelPunto = 104;

/**
 * El punto del pico a pico es chico para un nombre largo: el rótulo se ensancha hacia adentro de la
 * columna desde su borde, así el avatar queda en su lugar de la mesa.
 */
function rectDelPunto(r: Rect, columna: Rect): { rect: Rect; alineado: "izquierda" | "centro" | "derecha" } {
  const ancho = Math.min(Math.max(r.ancho, anchoDelPunto), columna.ancho);
  const centro = r.x + r.ancho / 2;
  const medio = columna.x + columna.ancho / 2;
  if (Math.abs(centro - medio) < r.ancho / 2) return { rect: { ...r, x: centro - ancho / 2, ancho }, alineado: "centro" };
  if (centro < medio) return { rect: { ...r, x: Math.max(columna.x, r.x), ancho }, alineado: "izquierda" };
  return { rect: { ...r, x: Math.min(columna.x + columna.ancho, r.x + r.ancho) - ancho, ancho }, alineado: "derecha" };
}

function Rotulo({ asiento, geo, columna, propio, tercetos }: {
  asiento: AsientoVisible; geo: GeometriaAsiento; columna: Rect; propio: boolean; tercetos: boolean;
}) {
  const papel = [propio ? null : asiento.papel, ...asiento.etiquetas].filter(Boolean).join(" · ");
  const etiqueta = [asiento.nombre, propio ? "Vos" : null, papel, asiento.estadoPico, asiento.turno ? "tiene el turno" : null]
    .filter(Boolean).join(", ");
  const punto = geo.forma === "punto" && !propio ? rectDelPunto(geo.rotulo!, columna) : null;
  const alineado = propio ? "izquierda" : punto?.alineado ?? "centro";
  return (
    <Animated.View layout={tercetos ? deslizar : undefined} accessibilityLabel={etiqueta}
      style={[enRect(punto?.rect ?? geo.rotulo!), estilos[alineado]]}>
      <Contenido asiento={asiento} forma={geo.forma} propio={propio} papel={papel} />
    </Animated.View>
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
        return <Rotulo key={a.asiento} asiento={a} geo={geo} columna={geometria.columna}
          propio={a.asiento === mesa.propio} tercetos={mesa.modalidad === "3v3"} />;
      })}
      {geometria.lance && mesa.etiquetaLance ? (
        <View style={[enRect(geometria.lance), estilos.centro]}>
          <Text testID="etiqueta-lance" style={estilos.lance} numberOfLines={1}>{mesa.etiquetaLance}</Text>
        </View>
      ) : null}
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
  derecha: { alignItems: "flex-end", justifyContent: "center" },
  tenue: { opacity: 0.55 },
  fila: { alignItems: "center", flexDirection: "row", gap: 4, maxWidth: "100%" },
  encoger: { flexShrink: 1 },
  placa: { alignItems: "center", borderColor: "transparent", borderRadius: 10, borderWidth: 1, maxWidth: "100%", paddingHorizontal: 6 },
  placaDeTurno: { backgroundColor: "rgba(255, 232, 132, 0.16)", borderColor: "rgba(255, 232, 132, 0.75)" },
  nombre: { color: mesaColores.crema, fontFamily: fuentes.textoFuerte, fontSize: 13, lineHeight: 16 },
  nombreChico: { color: mesaColores.crema, fontFamily: fuentes.textoFuerte, fontSize: 11, lineHeight: 14 },
  nombreDeTurno: { color: mesaColores.brillo },
  papel: { color: mesaColores.crema, fontFamily: fuentes.texto, fontSize: 11, lineHeight: 14, opacity: 0.75 },
  circulo: {
    alignItems: "center", borderColor: mesaColores.crema, borderRadius: 14, borderWidth: 2, height: 28,
    justifyContent: "center", width: 28,
  },
  circuloDeTurno: { borderColor: mesaColores.brillo, boxShadow: "0 0 10px 3px rgba(255, 232, 132, 0.8)" },
  inicial: { color: "#233d31", fontFamily: fuentes.textoFuerte, fontSize: 13 },
  circuloChico: { alignItems: "center", borderRadius: 9, height: 18, justifyContent: "center", width: 18 },
  inicialChica: { color: "#233d31", fontFamily: fuentes.textoFuerte, fontSize: 9 },
  estadoPico: { color: mesaColores.crema, fontFamily: fuentes.texto, fontSize: 10, lineHeight: 13 },
  lance: {
    backgroundColor: mesaColores.tira, borderRadius: 999, color: mesaColores.crema, fontFamily: fuentes.texto, fontSize: 11,
    lineHeight: 14, overflow: "hidden", paddingHorizontal: 12, paddingVertical: 4,
  },
  muestra: { color: mesaColores.crema, fontFamily: fuentes.texto, fontSize: 10.5, lineHeight: 13, textAlign: "center" },
  muestraCarta: { fontFamily: fuentes.textoFuerte },
  voz: { color: "#233d31", fontFamily: fuentes.textoFuerte, fontSize: 13 },
});
