import { useEffect, useState } from "react";
import { BlurMask, Group, Image, RoundedRect, Shadow } from "@shopify/react-native-skia";
import {
  Easing, useDerivedValue, useSharedValue, withSpring, withTiming, type DerivedValue, type SharedValue,
} from "react-native-reanimated";
import type { Carta, Punto } from "@eltruco/mesa-geometria";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { curvaDeVuelo, dorado, movimiento, rebote } from "../movimiento.ts";
import { scheduleOnUI } from "react-native-worklets";
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
  const transform = useDerivedValue(() => {
    const p = pose.value;
    const base = [
      { translateX: p.x + p.ancho / 2 },
      { translateY: p.y + p.alto / 2 },
      { rotate: (p.rotacion * Math.PI) / 180 },
      { scale: p.escala },
    ];
    const angosta = giro ? [{ scaleX: Math.max(0.001, Math.abs(Math.cos(giro.value * Math.PI))) }] : [];
    return [...base, ...angosta, { translateX: -p.ancho / 2 }, { translateY: -p.alto / 2 }];
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
  const medidas = { ancho, alto };

  return (
    <Group transform={transform} opacity={opacidad ?? 1}>
      {brillo ? <Halo pose={pose} brillo={brillo} /> : null}
      <RoundedRect x={0} y={0} width={ancho} height={alto} r={radio} color="white">
        <Shadow dx={0} dy={s.dy} blur={s.blur} color={s.color} />
      </RoundedRect>
      <Group clip={borde}>
        {giro ? <CaraYDorso id={id} giro={giro} {...medidas} /> : <Cara id={id} {...medidas} />}
      </Group>
      {oscuridad ? <Oscuridad oscuridad={oscuridad} radio={radio} {...medidas} /> : null}
    </Group>
  );
}

type Medidas = { ancho: Valor<number>; alto: Valor<number> };

function Cara({ id, ancho, alto, opacidad }: Medidas & { id: CardId | "reverso"; opacidad?: Valor<number> }) {
  const imagen = useImagenDeCarta(id);
  return imagen ? <Image image={imagen} x={0} y={0} width={ancho} height={alto} fit="fill" opacity={opacidad ?? 1} /> : null;
}

/** Hasta la mitad del giro se ve el dorso; desde ahí, la cara. */
function CaraYDorso({ id, giro, ancho, alto }: Medidas & { id: CardId | "reverso"; giro: Valor<number> }) {
  const cara = useDerivedValue<number>(() => (giro.value >= 0.5 ? 1 : 0));
  const dorso = useDerivedValue(() => 1 - cara.value);
  return (
    <>
      <Cara id={id} ancho={ancho} alto={alto} opacidad={cara} />
      <Cara id="reverso" ancho={ancho} alto={alto} opacidad={dorso} />
    </>
  );
}

/** El halo y el borde dorados de la carta ganadora. */
function Halo({ pose, brillo }: { pose: Valor<Pose>; brillo: Valor<number> }) {
  const cajaHalo = useDerivedValue(() => marcoDe(pose.value, halo.mas));
  const cajaBorde = useDerivedValue(() => marcoDe(pose.value, bordeDorado));
  const desenfoque = useDerivedValue(() => pose.value.ancho * halo.blur);
  return (
    <Group opacity={brillo}>
      <RoundedRect rect={cajaHalo} color={halo.color}>
        <BlurMask blur={desenfoque} style="normal" />
      </RoundedRect>
      <RoundedRect rect={cajaBorde} color={dorado} />
    </Group>
  );
}

function Oscuridad({ oscuridad, radio, ancho, alto }: Medidas & { oscuridad: Valor<number>; radio: Valor<number> }) {
  const opacidad = useDerivedValue(() => oscuridad.value * oscuridadMaxima);
  return <RoundedRect x={0} y={0} width={ancho} height={alto} r={radio} color="black" opacity={opacidad} />;
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
 * brilla y las demás se oscurecen. Con `alCentro` (el chico terminó) va a la pila del centro.
 */
export function CartaDelPano({ id, carta, desde, ganadora, oscura, liviano, alCentro = null }: {
  id: CardId;
  carta: Carta;
  /** La carta animada de la mano propia, el ancla del asiento ajeno o null si ya estaba. */
  desde: CartaAnimada | Punto | null;
  ganadora: boolean;
  oscura: boolean;
  liviano: boolean;
  alCentro?: Carta | null;
}) {
  const { vuelo, ganadora: brillo, festejo } = movimiento(liviano);
  // La pose de la mano se lee en el hilo de la interfaz, nunca durante el render.
  const [origen] = useState<{ ajena: Pose } | { propia: CartaAnimada } | null>(() => {
    if (!desde) return null;
    if ("fase" in desde) return { propia: desde };
    return { ajena: { ...carta, x: desde.x - carta.ancho / 2, y: desde.y - carta.alto / 2, escala: 1 } };
  });
  const propia = origen !== null && "propia" in origen ? origen.propia : null;
  // En liviano la carta aparece en su lugar, sin un cuadro de dorso en el asiento.
  const vuela = origen !== null && vuelo.duracion > 0;
  const avance = useSharedValue(vuela ? 0 : 1);
  // De dónde sale: la ajena lo sabe al montarse; la propia lo toma al arrancar el vuelo. Hasta
  // entonces se dibuja donde está en la mano, que es el mismo lugar.
  const salida = useSharedValue<Pose | null>(origen !== null && "ajena" in origen ? origen.ajena : null);
  const destino = usePose(carta);
  useEffect(() => {
    if (!vuela) return;
    const conRebote = propia !== null && vuelo.rebote;
    const { duracion } = vuelo;
    scheduleOnUI(() => {
      "worklet";
      if (propia) salida.value = poseDeMano(propia);
      if (conRebote) avance.value = withSpring(1, { duration: duracion, ...rebote });
      else avance.value = withTiming(1, { duration: duracion, easing: curvaVuelo });
    });
  }, [avance]);

  // En liviano el festejo no mueve las cartas.
  const juntar = alCentro !== null && festejo !== null;
  const junta = useSharedValue(0);
  const centro = usePose(alCentro ?? carta);
  useEffect(() => {
    junta.value = juntar ? withTiming(1, { duration: festejo.juntar, easing: curvaVuelo }) : 0;
  }, [junta, juntar]);

  const pose = useDerivedValue<Pose>(() => {
    let lugar = destino.value;
    if (vuela) lugar = mezclar(salida.value ?? (propia ? poseDeMano(propia) : lugar), lugar, avance.value);
    return junta.value > 0 ? mezclar(lugar, centro.value, junta.value) : lugar;
  });
  // La ajena vuela de dorso y se da vuelta en el aire; la propia ya se veía de cara.
  const [gira] = useState(() => vuela && propia === null);

  const luz = useSharedValue(ganadora ? 1 : 0);
  const sombra = useSharedValue(oscura ? 1 : 0);
  useEffect(() => {
    luz.value = brillo.duracion > 0 ? withTiming(ganadora ? 1 : 0, { duration: brillo.duracion }) : ganadora ? 1 : 0;
  }, [luz, ganadora, brillo.duracion]);
  useEffect(() => {
    sombra.value = brillo.duracion > 0 ? withTiming(oscura ? 1 : 0, { duration: brillo.duracion }) : oscura ? 1 : 0;
  }, [sombra, oscura, brillo.duracion]);

  // Los efectos se montan solo en las cartas que los usan. Cuando la vuelta se limpia, las cartas se
  // desmontan, así que no hace falta apagarlos de a poco.
  return (
    <CartaSkia id={id} pose={pose} sombra="pano" giro={gira ? avance : undefined}
      brillo={ganadora ? luz : undefined} oscuridad={oscura ? sombra : undefined} />
  );
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
  if (gira === null) return <CartaSkia id="reverso" pose={pose} sombra="pano" opacidad={opacidad} />;
  return <CartaRepartidaPropia id={id} pose={pose} opacidad={opacidad} reloj={reloj} gira={gira} duracion={duracion} />;
}

/** Una carta propia del reparto: llega de dorso y se da vuelta en la mano. */
function CartaRepartidaPropia({ id, pose, opacidad, reloj, gira, duracion }: {
  id: CardId | "reverso"; pose: Valor<Pose>; opacidad: Valor<number>; reloj: SharedValue<number>; gira: number; duracion: number;
}) {
  const giro = useDerivedValue(() => Math.min(1, Math.max(0, (reloj.value - gira) / duracion)));
  return <CartaSkia id={id} pose={pose} sombra="mano" opacidad={opacidad} giro={giro} />;
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
export function CartaDeMano({ id, carta, encima, resaltada = false }: {
  id: CardId; carta: CartaAnimada; encima: boolean; resaltada?: boolean;
}) {
  const pose = useDerivedValue(() => poseDeMano(carta));
  const opacidad = useDerivedValue<number>(() => ((carta.fase.value !== enMano) === encima ? 1 : 0));
  // La carta que nombró el pie lleva el halo de la ganadora mientras está quieta en la mano.
  const brillo = useDerivedValue<number>(() => (resaltada && carta.fase.value === enMano ? 1 : 0));
  return <CartaSkia id={id} pose={pose} sombra="mano" opacidad={opacidad} brillo={resaltada ? brillo : undefined} />;
}
