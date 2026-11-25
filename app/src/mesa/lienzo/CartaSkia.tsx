import { useEffect, useState } from "react";
import { BlurMask, Group, Image, RoundedRect, Shadow } from "@shopify/react-native-skia";
import {
  Easing, useDerivedValue, useSharedValue, withSpring, withTiming, type DerivedValue, type SharedValue,
} from "react-native-reanimated";
import type { Carta, Punto } from "@eltruco/mesa-geometria";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { curvaDeVuelo, dorado, movimiento, rebote } from "../movimiento.ts";
import { enMano, type CartaAnimada } from "../useManoAnimada.ts";
import { useImagenDeCarta } from "./useImagenesDeCartas.ts";

/** Dónde se ve una carta: su rectángulo sin rotar, la rotación en grados y la escala, ambas desde el centro. */
export interface Pose extends Carta {
  escala: number;
}

export type Sombra = "mano" | "pano";

type Valor<T> = SharedValue<T> | DerivedValue<T>;

// Como en movimiento.html: 0 4px 10px #0008 en la mano y 0 2px 6px #0007 en el paño.
const sombras = {
  mano: { dy: 4, blur: 5, color: "rgba(0,0,0,0.53)" },
  pano: { dy: 2, blur: 3, color: "rgba(0,0,0,0.44)" },
} as const;

// border-radius 6px sobre una carta de 88px.
const radioRelativo = 6 / 88;
const subida = 18;
const escalaLevantada = 0.06;
const oscuridadMaxima = 0.45;
// `.ganadora` del prototipo: un borde de 3px y un halo de 18px con 6px de más sobre la carta jugada de 46px.
const bordeDorado = 3 / 46;
const halo = { mas: 6 / 46, blur: 9 / 46, color: dorado + "88" };
const curvaVuelo = Easing.bezier(...curvaDeVuelo);
const curvaVueloFn = Easing.bezierFn(...curvaDeVuelo);

function marcoDe(p: Pose, mas: number) {
  "worklet";
  const m = p.ancho * mas;
  const r = p.ancho * radioRelativo + m;
  return { rect: { x: -m, y: -m, width: p.ancho + 2 * m, height: p.alto + 2 * m }, rx: r, ry: r };
}

interface Props {
  id: CardId | "reverso";
  pose: Valor<Pose>;
  sombra: Sombra;
  opacidad?: Valor<number>;
  /** De 0 (se ve el dorso) a 1 (se ve la cara): la carta se angosta hasta la mitad y se ensancha con la otra cara. */
  giro?: Valor<number>;
  /** De 0 a 1: el halo dorado de la carta ganadora. */
  brillo?: Valor<number>;
  /** De 0 a 1: la sombra encima de las cartas que no ganaron la vuelta. */
  oscuridad?: Valor<number>;
}

/** Una carta Tatú con sombra fija y esquinas redondeadas, ubicada con valores compartidos. */
export function CartaSkia({ id, pose, sombra, opacidad, giro, brillo, oscuridad }: Props) {
  const imagen = useImagenDeCarta(id);
  const dorso = useImagenDeCarta("reverso");
  const transform = useDerivedValue(() => {
    const p = pose.value;
    const g = giro ? giro.value : 1;
    return [
      { translateX: p.x + p.ancho / 2 },
      { translateY: p.y + p.alto / 2 },
      { rotate: (p.rotacion * Math.PI) / 180 },
      { scale: p.escala },
      { scaleX: Math.max(0.001, Math.abs(Math.cos(g * Math.PI))) },
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
  const cara = useDerivedValue<number>(() => (!giro || giro.value >= 0.5 ? 1 : 0));
  const deDorso = useDerivedValue(() => 1 - cara.value);
  const conBrillo = useDerivedValue(() => brillo?.value ?? 0);
  const sombraEncima = useDerivedValue(() => (oscuridad?.value ?? 0) * oscuridadMaxima);
  // El halo y el borde dorado, alrededor de la carta.
  const cajaHalo = useDerivedValue(() => marcoDe(pose.value, halo.mas));
  const cajaBorde = useDerivedValue(() => marcoDe(pose.value, bordeDorado));
  const desenfoque = useDerivedValue(() => pose.value.ancho * halo.blur);
  const s = sombras[sombra];

  return (
    <Group transform={transform} opacity={opacidad ?? 1}>
      {brillo ? (
        <Group opacity={conBrillo}>
          <RoundedRect rect={cajaHalo} color={halo.color}>
            <BlurMask blur={desenfoque} style="normal" />
          </RoundedRect>
          <RoundedRect rect={cajaBorde} color={dorado} />
        </Group>
      ) : null}
      <RoundedRect x={0} y={0} width={ancho} height={alto} r={radio} color="white">
        <Shadow dx={0} dy={s.dy} blur={s.blur} color={s.color} />
      </RoundedRect>
      <Group clip={borde}>
        {imagen && <Image image={imagen} x={0} y={0} width={ancho} height={alto} fit="fill" opacity={cara} />}
        {giro && dorso ? <Image image={dorso} x={0} y={0} width={ancho} height={alto} fit="fill" opacity={deDorso} /> : null}
      </Group>
      {oscuridad ? <RoundedRect x={0} y={0} width={ancho} height={alto} r={radio} color="black" opacity={sombraEncima} /> : null}
    </Group>
  );
}

/** Una carta quieta: dorsos, el mazo y la muestra. */
export function CartaFija({ id, carta, sombra }: { id: CardId | "reverso"; carta: Carta; sombra: Sombra }) {
  const pose = usePose(carta);
  return <CartaSkia id={id} pose={pose} sombra={sombra} />;
}

/** Los valores compartidos de una pose que llega por props como números sueltos. */
function usePose(carta: Carta) {
  const pose = useSharedValue<Pose>({ ...carta, escala: 1 });
  const { x, y, ancho, alto, rotacion } = carta;
  useEffect(() => {
    pose.value = { x, y, ancho, alto, rotacion, escala: 1 };
  }, [pose, x, y, ancho, alto, rotacion]);
  return pose;
}

function mezclar(a: Pose, b: Pose, t: number): Pose {
  "worklet";
  const m = (u: number, v: number) => u + (v - u) * t;
  return {
    x: m(a.x, b.x), y: m(a.y, b.y), ancho: m(a.ancho, b.ancho), alto: m(a.alto, b.alto),
    rotacion: m(a.rotacion, b.rotacion), escala: m(a.escala, b.escala),
  };
}

/**
 * Una carta del paño. Al montarse sale de `desde` hasta su rectángulo; sin `desde`, ya estaba y
 * aparece en su lugar. La propia sale de donde quedó en la mano y se apoya con un rebote leve; la
 * de otro jugador sale del ancla de su asiento y se da vuelta en el aire. La ganadora de la vuelta
 * brilla y las demás se oscurecen.
 */
export function CartaDelPano({ id, carta, desde, ganadora, oscura, liviano }: {
  id: CardId;
  carta: Carta;
  desde: Pose | Punto | null;
  ganadora: boolean;
  oscura: boolean;
  liviano: boolean;
}) {
  const { vuelo, ganadora: brillo } = movimiento(liviano);
  const [origen] = useState<{ pose: Pose; propia: boolean } | null>(() => {
    if (!desde) return null;
    if ("ancho" in desde) return { pose: desde, propia: true };
    return { pose: { ...carta, x: desde.x - carta.ancho / 2, y: desde.y - carta.alto / 2, escala: 1 }, propia: false };
  });
  const avance = useSharedValue(origen ? 0 : 1);
  const destino = usePose(carta);
  useEffect(() => {
    if (!origen || vuelo.duracion <= 0) avance.value = 1;
    else if (origen.propia && vuelo.rebote) avance.value = withSpring(1, { duration: vuelo.duracion, ...rebote });
    else avance.value = withTiming(1, { duration: vuelo.duracion, easing: curvaVuelo });
  }, [avance]);

  const pose = useDerivedValue<Pose>(() => (origen ? mezclar(origen.pose, destino.value, avance.value) : destino.value));
  // La ajena empieza de dorso; la propia ya se veía de cara.
  const giro = useDerivedValue(() => (origen && !origen.propia ? Math.min(1, avance.value) : 1));

  const luz = useSharedValue(ganadora ? 1 : 0);
  const sombra = useSharedValue(oscura ? 1 : 0);
  useEffect(() => {
    luz.value = brillo.duracion > 0 ? withTiming(ganadora ? 1 : 0, { duration: brillo.duracion }) : ganadora ? 1 : 0;
  }, [luz, ganadora, brillo.duracion]);
  useEffect(() => {
    sombra.value = brillo.duracion > 0 ? withTiming(oscura ? 1 : 0, { duration: brillo.duracion }) : oscura ? 1 : 0;
  }, [sombra, oscura, brillo.duracion]);

  return <CartaSkia id={id} pose={pose} sombra="pano" giro={giro} brillo={luz} oscuridad={sombra} />;
}

/**
 * Una carta del reparto: vuela de dorso desde el mazo hasta `carta` cuando el reloj del reparto
 * llega a `sale`. Las propias se dan vuelta en el lugar a partir de `gira`.
 */
export function CartaRepartida({ id, desde, carta, reloj, sale, gira, duracion }: {
  id: CardId | "reverso";
  desde: Carta;
  carta: Carta;
  reloj: SharedValue<number>;
  sale: number;
  /** Null para las ajenas, que quedan de dorso. */
  gira: number | null;
  duracion: number;
}) {
  const destino = usePose(carta);
  const inicio = usePose(desde);
  const pose = useDerivedValue<Pose>(() => {
    const t = Math.min(1, Math.max(0, (reloj.value - sale) / duracion));
    return mezclar(inicio.value, destino.value, curvaVueloFn(t));
  });
  const opacidad = useDerivedValue<number>(() => (reloj.value >= sale ? 1 : 0));
  const giro = useDerivedValue(() => (gira === null ? 0 : Math.min(1, Math.max(0, (reloj.value - gira) / duracion))));
  return <CartaSkia id={id} pose={pose} sombra={gira === null ? "pano" : "mano"} opacidad={opacidad} giro={giro} />;
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
