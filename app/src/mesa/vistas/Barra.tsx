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
function Puntos({ valor, eventos, duracion }: { valor: number; eventos?: EventosDeMesa; duracion: number }) {
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
      <Text style={[estilos.tanteador, estilos.puntos]}>{contando ?? valor}</Text>
    </Animated.View>
  );
}

/** «Nos 12 · 9 Ellos · a 30» con los números destacados, como en la maqueta. */
function Tanteador({ texto, eventos, liviano }: { texto: string; eventos?: EventosDeMesa; liviano: boolean }) {
  const partes = forma.exec(texto);
  if (!partes) return <Text style={estilos.tanteador} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{texto}</Text>;
  const [, nos, puntosNos, puntosEllos, ellos, meta] = partes;
  const { duracion } = movimiento(liviano).contador;
  // Cada número va en su propia vista para poder saltar; los nombres largos se cortan.
  return (
    <View style={estilos.fila}>
      <Text style={[estilos.tanteador, estilos.nombre]} numberOfLines={1}>{nos + espacio}</Text>
      <Puntos valor={Number(puntosNos)} eventos={eventos} duracion={duracion} />
      <Text style={estilos.tanteador}>{espacio + "·" + espacio}</Text>
      <Puntos valor={Number(puntosEllos)} eventos={eventos} duracion={duracion} />
      <Text style={[estilos.tanteador, estilos.nombre]} numberOfLines={1}>{espacio + ellos}</Text>
      <Text style={[estilos.tanteador, estilos.meta]} numberOfLines={1}>{espacio + "· a " + meta}</Text>
    </View>
  );
}

export function Barra({ rect, tanteador, conectada, abrirMas, eventos, liviano = false }: {
  rect: Rect; tanteador: MesaVisible["tanteador"]; conectada: boolean; abrirMas?: () => void;
  eventos?: EventosDeMesa; liviano?: boolean;
}) {
  return (
    <View style={[enRect(rect), estilos.barra]} pointerEvents="box-none">
      <View style={estilos.pildoras} pointerEvents="none">
        <View accessibilityLabel="Tanteador" style={estilos.pildora}>
          <Tanteador texto={tanteador.texto} eventos={eventos} liviano={liviano} />
        </View>
        {conectada ? null : (
          <View style={estilos.pildora} accessibilityLiveRegion="polite">
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
  pildoras: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: 6 },
  pildora: { backgroundColor: mesaColores.sombra, borderRadius: 999, flexShrink: 1, paddingHorizontal: 12, paddingVertical: 5 },
  fila: { alignItems: "center", flexDirection: "row", flexShrink: 1 },
  tanteador: { color: mesaColores.crema, fontFamily: fuentes.texto, fontSize: 13 },
  nombre: { flexShrink: 1 },
  puntos: { fontFamily: fuentes.textoFuerte, fontSize: 16 },
  meta: { fontSize: 12, opacity: 0.8 },
  red: { color: mesaColores.brillo, fontFamily: fuentes.textoFuerte, fontSize: 12 },
  menu: {
    alignItems: "center", backgroundColor: mesaColores.sombra, borderRadius: 18, height: 36, justifyContent: "center", width: 36,
  },
  icono: { color: mesaColores.crema, fontSize: 17 },
});
