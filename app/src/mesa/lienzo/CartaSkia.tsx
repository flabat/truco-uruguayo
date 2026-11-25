import { useEffect, useState } from "react";
import { Group, Image, RoundedRect, Shadow } from "@shopify/react-native-skia";
import {
  useDerivedValue, useSharedValue, withTiming, type DerivedValue, type SharedValue,
} from "react-native-reanimated";
import type { Carta, Punto } from "@eltruco/mesa-geometria";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { enMano, type CartaAnimada } from "../useManoAnimada.ts";
import { useImagenDeCarta } from "./useImagenesDeCartas.ts";

/** Dónde se ve una carta: su rectángulo sin rotar, la rotación en grados y la escala, ambas desde el centro. */
export interface Pose extends Carta {
  escala: number;
}

export type Sombra = "mano" | "pano";

// Como en movimiento.html: 0 4px 10px #0008 en la mano y 0 2px 6px #0007 en el paño.
const sombras = {
  mano: { dy: 4, blur: 5, color: "rgba(0,0,0,0.53)" },
  pano: { dy: 2, blur: 3, color: "rgba(0,0,0,0.44)" },
} as const;

// border-radius 6px sobre una carta de 88px.
const radioRelativo = 6 / 88;
const subida = 18;
const escalaLevantada = 0.06;
const duracionDeAparicion = 320;

interface Props {
  id: CardId | "reverso";
  pose: SharedValue<Pose> | DerivedValue<Pose>;
  sombra: Sombra;
  oscura?: boolean;
  opacidad?: SharedValue<number> | DerivedValue<number>;
}

/** Una carta Tatú con sombra fija y esquinas redondeadas, ubicada con valores compartidos. */
export function CartaSkia({ id, pose, sombra, oscura = false, opacidad }: Props) {
  const imagen = useImagenDeCarta(id);
  const transform = useDerivedValue(() => {
    const p = pose.value;
    return [
      { translateX: p.x + p.ancho / 2 },
      { translateY: p.y + p.alto / 2 },
      { rotate: (p.rotacion * Math.PI) / 180 },
      { scale: p.escala },
      { translateX: -p.ancho / 2 },
      { translateY: -p.alto / 2 },
    ];
  });
  const ancho = useDerivedValue(() => pose.value.ancho);
  const alto = useDerivedValue(() => pose.value.alto);
  const radio = useDerivedValue(() => pose.value.ancho * radioRelativo);
  const borde = useDerivedValue(() => {
    const p = pose.value;
    const r = p.ancho * radioRelativo;
    return { rect: { x: 0, y: 0, width: p.ancho, height: p.alto }, rx: r, ry: r };
  });
  const s = sombras[sombra];

  return (
    <Group transform={transform} opacity={opacidad ?? 1}>
      <RoundedRect x={0} y={0} width={ancho} height={alto} r={radio} color="white">
        <Shadow dx={0} dy={s.dy} blur={s.blur} color={s.color} />
      </RoundedRect>
      <Group clip={borde}>
        {imagen && <Image image={imagen} x={0} y={0} width={ancho} height={alto} fit="fill" />}
      </Group>
      {oscura && <RoundedRect x={0} y={0} width={ancho} height={alto} r={radio} color="rgba(0,0,0,0.45)" />}
    </Group>
  );
}

/** Una carta quieta: dorsos, el mazo y la muestra. */
export function CartaFija({ id, carta, sombra }: { id: CardId | "reverso"; carta: Carta; sombra: Sombra }) {
  const pose = useSharedValue<Pose>({ ...carta, escala: 1 });
  const { x, y, ancho, alto, rotacion } = carta;
  useEffect(() => {
    pose.value = { x, y, ancho, alto, rotacion, escala: 1 };
  }, [pose, x, y, ancho, alto, rotacion]);
  return <CartaSkia id={id} pose={pose} sombra={sombra} />;
}

/**
 * Una carta del paño. Al montarse sale de `desde` (el ancla de su asiento, o la pose donde quedó la
 * carta propia) hasta su rectángulo; sin `desde`, ya estaba y aparece en su lugar.
 */
export function CartaDelPano({ id, carta, desde, oscura, duracion = duracionDeAparicion }: {
  id: CardId;
  carta: Carta;
  desde: Pose | Punto | null;
  oscura: boolean;
  duracion?: number;
}) {
  const [origen] = useState<Pose | null>(() => {
    if (!desde) return null;
    if ("ancho" in desde) return desde;
    return { ...carta, x: desde.x - carta.ancho / 2, y: desde.y - carta.alto / 2, escala: 1 };
  });
  const avance = useSharedValue(origen ? 0 : 1);
  const destino = useSharedValue<Pose>({ ...carta, escala: 1 });
  const { x, y, ancho, alto, rotacion } = carta;
  useEffect(() => {
    destino.value = { x, y, ancho, alto, rotacion, escala: 1 };
  }, [destino, x, y, ancho, alto, rotacion]);
  useEffect(() => {
    avance.value = withTiming(1, { duration: duracion });
  }, [avance, duracion]);

  const pose = useDerivedValue<Pose>(() => {
    const d = destino.value;
    if (!origen || avance.value >= 1) return d;
    const t = avance.value;
    const mezcla = (a: number, b: number) => a + (b - a) * t;
    return {
      x: mezcla(origen.x, d.x),
      y: mezcla(origen.y, d.y),
      ancho: mezcla(origen.ancho, d.ancho),
      alto: mezcla(origen.alto, d.alto),
      rotacion: mezcla(origen.rotacion, d.rotacion),
      escala: mezcla(origen.escala, d.escala),
    };
  });
  return <CartaSkia id={id} pose={pose} sombra="pano" oscura={oscura} />;
}

/** Dónde se ve ahora una carta de la mano propia. */
export function poseDeMano(a: CartaAnimada): Pose {
  "worklet";
  const levantada = a.levantada.value;
  return {
    x: a.x.value + a.dx.value,
    y: a.y.value + a.dy.value - subida * levantada,
    ancho: a.ancho.value,
    alto: a.alto.value,
    rotacion: a.rotacion.value,
    escala: 1 + escalaLevantada * levantada,
  };
}

/**
 * Una carta de la mano propia con los valores que mueve el gesto. Se dibuja dos veces: en la mano y
 * por encima de todo; cada copia se ve según la carta esté quieta o en manos del jugador.
 */
export function CartaDeMano({ id, carta, encima }: { id: CardId; carta: CartaAnimada; encima: boolean }) {
  const pose = useDerivedValue(() => poseDeMano(carta));
  const opacidad = useDerivedValue<number>(() => ((carta.fase.value !== enMano) === encima ? 1 : 0));
  return <CartaSkia id={id} pose={pose} sombra="mano" opacidad={opacidad} />;
}
