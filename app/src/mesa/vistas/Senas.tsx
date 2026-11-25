import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect as SvgRect } from "react-native-svg";
import type { Geometria } from "@eltruco/mesa-geometria";
import { textoFrasePie, type FrasePie } from "@eltruco/motor/senas-pie.ts";
import { colores, fuentes } from "../../tema.ts";
import type { SenasEnMesa } from "../senas.ts";
import { CaraSena } from "./CaraSena.tsx";
import { mesaColores } from "./estilo.ts";
import { Globo } from "./Globo.tsx";

export type Indicar = (destinatario: number, frase: FrasePie | "sin-indicacion", vuelta: number) => void;

function Candado({ color }: { color: string }) {
  return (
    <Svg viewBox="0 0 16 18" width={11} height={13} fill="none" stroke={color} strokeWidth={1.8} aria-hidden>
      <SvgRect x={2} y={8} width={12} height={8} rx={2} />
      <Path d="M4.7 8V5a3.3 3.3 0 016.6 0v3" />
    </Svg>
  );
}

const frasesDe = (senas: SenasEnMesa) =>
  senas.tipo === "pie" ? senas.frases.filter(f => f.frases.length > 0 || f.esperando) : [];

/** Las frases del pie y la píldora van en la fila del rótulo propio, que se oculta mientras tanto. */
export const ocupaElRotulo = (senas: SenasEnMesa) => senas.tipo === "companero" || frasesDe(senas).length > 0;

/**
 * La fila de abajo, entre el rótulo propio y el botón Cantos: el único lugar libre que no pisa el
 * mazo, que cae en la fila de abajo del paño cuando el propio jugador da. Con una hoja abierta no
 * hay rótulo y la franja apoya sobre el estado.
 */
function JuntoALaMano({ geometria, propio, conCantos, testID, children }: {
  geometria: Geometria; propio: number | null; conCantos: boolean; testID: string; children: ReactNode;
}) {
  const { columna, estado, pantalla, cantos } = geometria;
  const rotulo = propio != null ? geometria.asientos[propio]?.rotulo : null;
  const derecha = conCantos && cantos ? cantos.x - 8 : columna.x + columna.ancho - 8;
  const lugar = rotulo
    ? { left: rotulo.x, width: derecha - rotulo.x, top: rotulo.y - 8, height: rotulo.alto + 16, alignItems: "flex-start" as const }
    : { left: columna.x + 8, width: columna.ancho - 16, bottom: pantalla.alto - estado.y + 4, alignItems: "center" as const };
  return (
    <View testID={testID} pointerEvents="box-none" style={[estilos.franja, lugar]}>
      {children}
    </View>
  );
}

/**
 * Las señas al pie según `senasEnMesa`. Solo llega acá lo que la regla `pairs-private-senas` deja
 * ver: rivales y espectadores reciben `ninguna`.
 */
export function Senas({ senas, geometria, propio, conCantos, indicar }: {
  senas: SenasEnMesa; geometria: Geometria; propio: number | null; conCantos: boolean; indicar: Indicar;
}) {
  const franja = { geometria, propio, conCantos };
  if (senas.tipo === "pie") {
    const limites = { columna: geometria.columna, arriba: geometria.barra.y + geometria.barra.alto, estado: geometria.estado };
    const conFrases = frasesDe(senas);
    return (
      <>
        {senas.globos.map(g => {
          const geo = geometria.asientos[g.emisor];
          if (!geo || g.gestos.length === 0) return null;
          return (
            <Globo key={g.emisor + ":" + senas.vuelta} asiento={geo} posicion="debajo" limites={limites}
              testID={"globo-senas-" + g.emisor} etiqueta={"Señas de " + g.nombre}>
              <View style={estilos.tituloGlobo}>
                <Candado color={colores.tinta} />
                <Text style={estilos.textoTitulo}>Señas de {g.nombre}</Text>
              </View>
              <View style={estilos.gestos}>
                {g.gestos.map(({ gesto, significado }) => (
                  <View key={gesto} style={estilos.gesto} accessibilityLabel={significado}>
                    <CaraSena gesto={gesto} />
                    <Text style={estilos.significado}>{significado}</Text>
                  </View>
                ))}
              </View>
            </Globo>
          );
        })}
        {conFrases.length > 0 ? (
          <JuntoALaMano {...franja} testID="frases-pie">
            {conFrases.map(f => (
              <View key={f.destinatario} style={estilos.filaFrases} accessibilityLabel={"Para " + f.nombre}>
                {conFrases.length > 1 ? <Text style={estilos.para}>{f.nombre}</Text> : null}
                {f.frases.map(frase => (
                  <Pressable key={frase} accessibilityRole="button" onPress={() => indicar(f.destinatario, frase, senas.vuelta)}
                    style={({ pressed }) => [estilos.chip, pressed && estilos.apretado]}>
                    <Text style={estilos.textoChip}>{textoFrasePie[frase]}</Text>
                  </Pressable>
                ))}
                {f.esperando ? (
                  <Pressable accessibilityRole="button" onPress={() => indicar(f.destinatario, "sin-indicacion", senas.vuelta)}
                    style={({ pressed }) => [estilos.chip, estilos.chipSecundario, pressed && estilos.apretado]}>
                    <Text style={[estilos.textoChip, estilos.textoSecundario]}>Dejar jugar</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </JuntoALaMano>
        ) : null}
      </>
    );
  }
  if (senas.tipo === "companero") {
    return (
      <JuntoALaMano {...franja} testID="pildora-senas">
        <View style={estilos.pildora} accessibilityLabel={senas.texto}>
          <Candado color={mesaColores.crema} />
          <Text style={estilos.textoPildora} numberOfLines={2}>{senas.texto}</Text>
        </View>
      </JuntoALaMano>
    );
  }
  return null;
}

/** En las mesas con seña elegida a mano: las señas que llegaron del compañero, para la hoja Mano. */
export function SenasRecibidas({ recibidas }: { recibidas: Extract<SenasEnMesa, { tipo: "silencio" }>["recibidas"] }) {
  if (recibidas.length === 0) return null;
  return (
    <View style={estilos.recibidas}>
      <Text style={estilos.tituloRecibidas}>Señas recibidas</Text>
      {recibidas.map((r, i) => (
        <Text key={i} style={estilos.recibida}>
          <Text style={estilos.quien}>{r.nombre}</Text> · {r.sena} · {r.jugada}
        </Text>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  tituloGlobo: { alignItems: "center", flexDirection: "row", gap: 5 },
  textoTitulo: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 12 },
  gestos: { flexDirection: "row", gap: 8, marginTop: 4 },
  gesto: { alignItems: "center", width: 64 },
  significado: { color: mesaColores.gris, fontFamily: fuentes.texto, fontSize: 10, lineHeight: 12, textAlign: "center" },
  franja: { gap: 6, justifyContent: "center", position: "absolute" },
  filaFrases: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  para: { color: mesaColores.crema, fontFamily: fuentes.textoFuerte, fontSize: 12 },
  chip: {
    alignItems: "center", backgroundColor: mesaColores.crema, borderColor: mesaColores.crema, borderRadius: 999, borderWidth: 1,
    justifyContent: "center", minHeight: 36, paddingHorizontal: 16,
  },
  chipSecundario: { backgroundColor: "rgba(255, 248, 231, 0.15)", borderColor: "rgba(255, 248, 231, 0.4)" },
  apretado: { opacity: 0.75 },
  textoChip: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 14 },
  textoSecundario: { color: mesaColores.crema },
  pildora: {
    alignItems: "center", backgroundColor: mesaColores.tira, borderRadius: 999, flexDirection: "row", gap: 6, maxWidth: "100%",
    paddingHorizontal: 12, paddingVertical: 5,
  },
  textoPildora: { color: mesaColores.crema, flexShrink: 1, fontFamily: fuentes.texto, fontSize: 12 },
  recibidas: { gap: 4, marginTop: 12 },
  tituloRecibidas: {
    color: mesaColores.gris, fontFamily: fuentes.textoFuerte, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase",
  },
  recibida: { color: colores.tinta, fontFamily: fuentes.texto, fontSize: 14 },
  quien: { fontFamily: fuentes.textoFuerte },
});
