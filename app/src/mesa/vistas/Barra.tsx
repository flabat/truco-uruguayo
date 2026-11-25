import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import type { Rect } from "@eltruco/mesa-geometria";
import { fuentes } from "../../tema.ts";
import type { EventosDeMesa } from "../eventos.ts";
import type { MesaVisible } from "../modelo.ts";
import { movimiento, saltoDelTanteador } from "../movimiento.ts";
import { enRect, mesaColores } from "./estilo.ts";

// Sin cortar renglón, la web se come los espacios del borde de cada texto.
const espacio = "\u00a0";
const forma = /^(.+) (\d+) · (\d+) (.+) · a (\d+)$/;

/**
 * Un número del tanteador. Al oír un cobro, si cambió desde el último que se vio, salta y cuenta
 * desde ahí. Sin cobro (al reconectar o al empezar otro chico) aparece el número nuevo quieto.
 */
function Puntos({ valor, eventos, duracion, letra }: { valor: number; eventos?: EventosDeMesa; duracion: number; letra: number }) {
  const [contando, contar] = useState<number | null>(null);
  const escala = useSharedValue(1);
  // El número que ya se vio. Se pone al día después de pintar: el cobro llega antes, en la misma pasada.
  const visto = useRef(valor);
  useEffect(() => {
    if (contando === null) visto.current = valor;
  }, [valor, contando]);

  const vigente = useRef({ valor, duracion });
  useLayoutEffect(() => {
    vigente.current = { valor, duracion };
  });

  useLayoutEffect(() => {
    if (!eventos) return;
    let cuadro: ReturnType<typeof requestAnimationFrame> | null = null;
    const quitar = eventos.escuchar(e => {
      const { valor: hasta, duracion: d } = vigente.current;
      const desde = visto.current;
      if (e.tipo !== "cobro" || desde === hasta) return;
      visto.current = hasta;
      if (cuadro !== null) cancelAnimationFrame(cuadro);
      if (d <= 0) {
        contar(null);
        return;
      }
      escala.value = withSequence(withTiming(saltoDelTanteador, { duration: d / 2 }), withTiming(1, { duration: d / 2 }));
      const inicio = Date.now();
      contar(desde);
      const paso = () => {
        const t = Math.min(1, (Date.now() - inicio) / d);
        if (t >= 1) {
          cuadro = null;
          contar(null);
          return;
        }
        contar(Math.round(desde + (hasta - desde) * t));
        cuadro = requestAnimationFrame(paso);
      };
      cuadro = requestAnimationFrame(paso);
    });
    return () => {
      quitar();
      if (cuadro !== null) cancelAnimationFrame(cuadro);
    };
  }, [eventos, escala]);

  const animado = useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }));
  return (
    <Animated.View style={animado}>
      <Text style={[estilos.tanteador, estilos.puntos, { fontSize: letra }]}>{contando ?? valor}</Text>
    </Animated.View>
  );
}

const letraMinima = 0.75;
const tamanos = { texto: 13, puntos: 16, meta: 12 };
const rellenoDePildora = 24;
const separacion = 6;

/** Las piezas del tanteador con la letra multiplicada por `escala`. */
function Fila({ partes, escala, eventos, duracion, alMedir }: {
  partes: string[]; escala: number; eventos?: EventosDeMesa; duracion: number; alMedir?: (ancho: number) => void;
}) {
  const [, nos, puntosNos, puntosEllos, ellos, meta] = partes;
  const texto = { fontSize: tamanos.texto * escala };
  const puntos = tamanos.puntos * escala;
  // Cada número va en su propia vista para poder saltar.
  return (
    <View style={alMedir ? estilos.medida : estilos.fila} onLayout={alMedir && (e => alMedir(e.nativeEvent.layout.width))}>
      <Text style={[estilos.tanteador, texto, estilos.nombre]} numberOfLines={1}>{nos + espacio}</Text>
      <Puntos valor={Number(puntosNos)} eventos={eventos} duracion={duracion} letra={puntos} />
      <Text style={[estilos.tanteador, texto]}>{espacio + "·" + espacio}</Text>
      <Puntos valor={Number(puntosEllos)} eventos={eventos} duracion={duracion} letra={puntos} />
      <Text style={[estilos.tanteador, texto, estilos.nombre]} numberOfLines={1}>{espacio + ellos}</Text>
      <Text style={[estilos.tanteador, estilos.meta, { fontSize: tamanos.meta * escala }]} numberOfLines={1}>{espacio + "· a " + meta}</Text>
    </View>
  );
}

/**
 * «Nos 12 · 9 Ellos · a 30» con los números destacados, como en la maqueta. Si no entra, la letra se
 * achica hasta tres cuartos, como con `adjustsFontSizeToFit`. La web no tiene esa opción y además
 * no deja saltar un número dentro de un texto. Por debajo de eso se cortan los nombres.
 */
function Tanteador({ partes, texto, eventos, liviano, escala }: {
  partes: string[] | null; texto: string; eventos?: EventosDeMesa; liviano: boolean; escala: number;
}) {
  if (!partes) return <Text style={estilos.tanteador} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={letraMinima}>{texto}</Text>;
  return <Fila partes={partes} escala={escala} eventos={eventos} duracion={movimiento(liviano).contador.duracion} />;
}

export function Barra({ rect, tanteador, conectada, abrirMas, eventos, liviano = false }: {
  rect: Rect; tanteador: MesaVisible["tanteador"]; conectada: boolean; abrirMas?: () => void;
  eventos?: EventosDeMesa; liviano?: boolean;
}) {
  const [ancho, medirAncho] = useState(0);
  const [red, medirRed] = useState(0);
  const [natural, medirNatural] = useState(0);
  const partes = forma.exec(tanteador.texto);
  const disponible = ancho - (conectada ? 0 : red + separacion) - rellenoDePildora;
  const escala = natural > 0 && disponible > 0 ? Math.max(letraMinima, Math.min(1, (disponible - 1) / natural)) : 1;
  return (
    <View style={[enRect(rect), estilos.barra]} pointerEvents="box-none">
      {partes ? (
        // Una copia invisible a tamaño completo mide cuánto ocupa el tanteador sin achicar.
        <View style={estilos.oculta} pointerEvents="none" aria-hidden accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <View style={estilos.lienzoDeMedida}>
            <Fila partes={partes} escala={1} duracion={0}
              alMedir={a => medirNatural(n => (Math.abs(n - a) > 0.5 ? a : n))} />
          </View>
        </View>
      ) : null}
      <View style={estilos.pildoras} pointerEvents="none" onLayout={e => medirAncho(e.nativeEvent.layout.width)}>
        <View accessibilityLabel="Tanteador" style={estilos.pildora}>
          <Tanteador partes={partes} texto={tanteador.texto} eventos={eventos} liviano={liviano} escala={escala} />
        </View>
        {conectada ? null : (
          <View style={[estilos.pildora, estilos.fija]} accessibilityLiveRegion="polite" onLayout={e => medirRed(e.nativeEvent.layout.width)}>
            <Text style={estilos.red}>Reconectando…</Text>
          </View>
        )}
      </View>
      {abrirMas ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Más" onPress={abrirMas} hitSlop={8} style={estilos.menu}>
          <Text style={estilos.icono}>☰</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 4 },
  // Ocupa todo el ancho libre para medirlo; las píldoras quedan a la izquierda.
  pildoras: { alignItems: "center", flex: 1, flexDirection: "row", gap: separacion },
  pildora: { backgroundColor: mesaColores.sombra, borderRadius: 999, flexShrink: 1, paddingHorizontal: 12, paddingVertical: 5 },
  fija: { flexShrink: 0 },
  fila: { alignItems: "center", flexDirection: "row", flexShrink: 1 },
  oculta: { height: 0, left: 0, opacity: 0, overflow: "hidden", position: "absolute", top: 0, width: 0 },
  lienzoDeMedida: { width: 10000 },
  medida: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row" },
  tanteador: { color: mesaColores.crema, fontFamily: fuentes.texto, fontSize: tamanos.texto },
  nombre: { flexShrink: 1 },
  puntos: { fontFamily: fuentes.textoFuerte },
  meta: { opacity: 0.8 },
  red: { color: mesaColores.brillo, fontFamily: fuentes.textoFuerte, fontSize: 12 },
  menu: {
    alignItems: "center", backgroundColor: mesaColores.sombra, borderRadius: 18, height: 36, justifyContent: "center", width: 36,
  },
  icono: { color: mesaColores.crema, fontSize: 17 },
});
