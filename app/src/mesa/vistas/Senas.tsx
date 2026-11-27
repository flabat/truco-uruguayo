import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect as SvgRect } from "react-native-svg";
import type { Geometria, GeometriaAsiento } from "@eltruco/mesa-geometria";
import { textoFrasePie, type CartaPedida, type FrasePie } from "@eltruco/motor/senas-pie.ts";
import { colores, fuentes } from "../../tema.ts";
import type { SenasEnMesa } from "../senas.ts";
import { CaraSena } from "./CaraSena.tsx";
import { mesaColores } from "./estilo.ts";
import { limitesDeGlobo } from "../lugar-globo.ts";
import { Globo } from "./Globo.tsx";

export type Indicar = (destinatario: number, frase: FrasePie | "sin-indicacion", vuelta: number, carta?: CartaPedida) => void;

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

const fichaAncho = 62;
const fichaAlto = 24;

/** La ficha del globo achicado: al lado del nombre del compañero, del lado que entra en la columna. */
function lugarDeFicha(asiento: GeometriaAsiento, { columna }: Geometria) {
  const r = asiento.rotulo ?? { x: asiento.ancla.x, y: asiento.ancla.y, ancho: 0, alto: 0 };
  const top = r.y + (r.alto - fichaAlto) / 2;
  const derecha = r.x + r.ancho + 4;
  const left = derecha + fichaAncho <= columna.x + columna.ancho - 4 ? derecha : Math.max(columna.x + 4, r.x - 4 - fichaAncho);
  return { left, top };
}

/**
 * Los globos con candado del pie, colgados del asiento de cada compañero. Tocar un globo lo achica a
 * una ficha junto al nombre; tocar la ficha lo vuelve a abrir. Si llegan señas nuevas, se abre solo.
 */
export function Senas({ senas, geometria, liviano = false }: { senas: SenasEnMesa; geometria: Geometria; liviano?: boolean }) {
  const [achicados, cambiarAchicados] = useState<ReadonlySet<string>>(new Set());
  if (senas.tipo !== "pie") return null;
  const alternar = (clave: string) => cambiarAchicados(antes => {
    const despues = new Set(antes);
    if (!despues.delete(clave)) despues.add(clave);
    return despues;
  });
  return (
    <>
      {senas.globos.map(g => {
        const geo = geometria.asientos[g.emisor];
        if (!geo || g.gestos.length === 0) return null;
        const clave = g.emisor + ":" + senas.vuelta + ":" + g.gestos.map(x => x.gesto).join(",");
        if (achicados.has(clave)) {
          return (
            <Pressable key={clave} testID={"ficha-senas-" + g.emisor} accessibilityRole="button"
              accessibilityLabel={"Ver las señas de " + g.nombre} onPress={() => alternar(clave)}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              style={({ pressed }) => [estilos.ficha, lugarDeFicha(geo, geometria), pressed && estilos.apretado]}>
              <Candado color={colores.tinta} />
              <CaraSena gesto={g.gestos[0].gesto} tamano={16} />
              {g.gestos.length > 1 ? <Text style={estilos.textoFicha}>+{g.gestos.length - 1}</Text> : null}
            </Pressable>
          );
        }
        return (
          <Globo key={clave} asiento={geo} posicion="debajo" limites={limitesDeGlobo(geometria, g.emisor)}
            testID={"globo-senas-" + g.emisor} etiqueta={"Señas de " + g.nombre} liviano={liviano}
            alTocar={() => alternar(clave)}>
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
    </>
  );
}

/**
 * La fila que reemplaza la indicación del estado: las frases del pie y «Dejar jugar», o la píldora
 * con lo que le mostraste al pie. Null si no hay nada que mostrar. Solo llega acá lo que la regla
 * `pairs-private-senas` deja ver: rivales y espectadores reciben `ninguna`.
 */
export function franjaDeSenas(senas: SenasEnMesa, indicar: Indicar): ReactNode {
  if (senas.tipo === "companero" && senas.pedido) {
    // Lo que pidió el pie importa más que recordar lo que se le mostró: queda junto a la mano hasta tirar.
    return (
      <View testID="pedido-del-pie" style={[estilos.pildora, estilos.pedido]} accessibilityLabel={senas.pedido.texto}>
        <Text style={[estilos.textoPildora, estilos.textoPedido]} numberOfLines={1}>{senas.pedido.texto}</Text>
      </View>
    );
  }
  if (senas.tipo === "companero") {
    return (
      <View testID="pildora-senas" style={estilos.pildora} accessibilityLabel={senas.texto}>
        <Candado color={mesaColores.crema} />
        <Text style={estilos.textoPildora} numberOfLines={1}>{senas.texto}</Text>
      </View>
    );
  }
  const conFrases = frasesDe(senas);
  if (senas.tipo !== "pie" || conFrases.length === 0) return null;
  return (
    <ScrollView testID="frases-pie" horizontal showsHorizontalScrollIndicator={false} style={estilos.desplazable}
      contentContainerStyle={estilos.frases}>
      {conFrases.map(f => (
        <View key={f.destinatario} style={estilos.grupoFrases} accessibilityLabel={"Para " + f.nombre}>
          {conFrases.length > 1 ? <Text style={estilos.para}>A {f.nombre}:</Text> : null}
          {f.frases.map(frase => (
            <Pressable key={frase} accessibilityRole="button" onPress={() => indicar(f.destinatario, frase, senas.vuelta)}
              hitSlop={{ top: 8, bottom: 8 }} style={({ pressed }) => [estilos.chip, pressed && estilos.apretado]}>
              <Text style={estilos.textoChip}>{textoFrasePie[frase]}</Text>
            </Pressable>
          ))}
          {f.pedidas.map(({ carta, texto }) => (
            <Pressable key={carta} accessibilityRole="button" onPress={() => indicar(f.destinatario, "juga", senas.vuelta, carta)}
              hitSlop={{ top: 8, bottom: 8 }} style={({ pressed }) => [estilos.chip, pressed && estilos.apretado]}>
              <Text style={estilos.textoChip}>{texto}</Text>
            </Pressable>
          ))}
          {f.esperando ? (
            <Pressable accessibilityRole="button" onPress={() => indicar(f.destinatario, "sin-indicacion", senas.vuelta)}
              hitSlop={{ top: 8, bottom: 8 }} style={({ pressed }) => [estilos.chip, estilos.chipSecundario, pressed && estilos.apretado]}>
              <Text style={[estilos.textoChip, estilos.textoSecundario]}>Dejar jugar</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
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
  ficha: {
    alignItems: "center", backgroundColor: mesaColores.hoja, borderRadius: 999, boxShadow: "0 2px 6px rgba(0, 0, 0, 0.4)",
    flexDirection: "row", gap: 3, height: fichaAlto, justifyContent: "center", paddingHorizontal: 7, width: fichaAncho,
    position: "absolute",
  },
  textoFicha: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 11 },
  tituloGlobo: { alignItems: "center", flexDirection: "row", gap: 5 },
  textoTitulo: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 12 },
  gestos: { flexDirection: "row", gap: 8, marginTop: 4 },
  gesto: { alignItems: "center", width: 64 },
  significado: { color: mesaColores.gris, fontFamily: fuentes.texto, fontSize: 10, lineHeight: 12, textAlign: "center" },
  desplazable: { flexGrow: 0, maxWidth: "100%" },
  frases: { alignItems: "center", flexDirection: "row", flexGrow: 1, gap: 10, justifyContent: "center" },
  grupoFrases: { alignItems: "center", flexDirection: "row", gap: 6 },
  para: { color: mesaColores.crema, fontFamily: fuentes.textoFuerte, fontSize: 12 },
  chip: {
    alignItems: "center", backgroundColor: mesaColores.crema, borderColor: mesaColores.crema, borderRadius: 999, borderWidth: 1,
    height: 24, justifyContent: "center", paddingHorizontal: 11,
  },
  chipSecundario: { backgroundColor: "rgba(255, 248, 231, 0.15)", borderColor: "rgba(255, 248, 231, 0.4)" },
  apretado: { opacity: 0.75 },
  textoChip: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 12.5, lineHeight: 16 },
  textoSecundario: { color: mesaColores.crema },
  pildora: {
    alignItems: "center", backgroundColor: mesaColores.tira, borderRadius: 999, flexDirection: "row", gap: 6, height: 24,
    maxWidth: "100%", paddingHorizontal: 10,
  },
  textoPildora: { color: mesaColores.crema, flexShrink: 1, fontFamily: fuentes.texto, fontSize: 11.5, lineHeight: 15 },
  pedido: { borderColor: mesaColores.brillo, borderWidth: 1 },
  textoPedido: { color: mesaColores.brillo, fontFamily: fuentes.textoFuerte, fontSize: 12.5, lineHeight: 16 },
  recibidas: { gap: 4, marginTop: 12 },
  tituloRecibidas: {
    color: mesaColores.gris, fontFamily: fuentes.textoFuerte, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase",
  },
  recibida: { color: colores.tinta, fontFamily: fuentes.texto, fontSize: 14 },
  quien: { fontFamily: fuentes.textoFuerte },
});
