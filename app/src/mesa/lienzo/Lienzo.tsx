import { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { Canvas, RadialGradient, Rect } from "@shopify/react-native-skia";
import type { Geometria } from "@eltruco/mesa-geometria";
import type { CardId } from "@eltruco/motor/cartas.ts";
import type { MesaVisible } from "../modelo.ts";
import type { CartaAnimada } from "../useManoAnimada.ts";
import { CartaDeMano, CartaDelPano, CartaFija, poseDeMano, type Pose } from "./CartaSkia.tsx";

export interface PropsLienzo {
  geometria: Geometria;
  mesa: MesaVisible;
  mano: Map<CardId, CartaAnimada>;
  liviano: boolean;
}

const colores = ["#3a614a", "#244936", "#1c392d"];
const posiciones = [0, 0.67, 1];

/** El paño, el mazo y todas las cartas, dibujados con Skia al fondo de la mesa. Nada de texto. */
export default function Lienzo({ geometria, mesa, mano, liviano }: PropsLienzo) {
  const { ancho, alto } = geometria.pantalla;
  const claves = mesa.asientos.flatMap(a => (a.jugada ? [a.asiento + ":" + a.jugada] : []));

  // Las cartas que ya estaban en el paño al montar el lienzo (al reconectar o al terminar de cargar
  // CanvasKit) aparecen en su lugar; las que llegan después salen de su asiento.
  // Se renueva después de cada render: una carta solo es nueva en el render en que aparece.
  const [alMontar] = useState(() => new Set(claves));
  const yaEstaban = useRef(alMontar);
  const clavesJuntas = claves.join(" ");
  useEffect(() => {
    yaEstaban.current = new Set(clavesJuntas ? clavesJuntas.split(" ") : []);
  }, [clavesJuntas]);

  // La carta propia ya salió de la mano cuando aparece en el paño: su último lugar está en la mano anterior.
  const manoAnterior = useRef(mano);
  useEffect(() => {
    manoAnterior.current = mano;
  }, [mano]);

  const hayGanadora = mesa.asientos.some(a => a.ganadora);

  // Como `radial-gradient(ellipse at 50% 38%, …)`: la elipse que pasa por la esquina más lejana.
  const centro = { x: ancho / 2, y: alto * 0.38 };
  const radioX = (ancho / 2) * Math.SQRT2;
  const radioY = alto * 0.62 * Math.SQRT2;

  const origenDe = (asiento: number, carta: CardId): Pose | { x: number; y: number } => {
    if (asiento === mesa.propio) {
      const animada = mano.get(carta) ?? manoAnterior.current.get(carta);
      if (animada) return poseDeMano(animada);
    }
    return geometria.asientos[asiento]!.ancla;
  };

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={ancho} height={alto}>
        <RadialGradient c={centro} r={radioX} colors={colores} positions={posiciones}
          origin={centro} transform={[{ scaleY: radioY / radioX }]} />
      </Rect>
      <CartaFija id={mesa.muestra} carta={geometria.mazo.muestra} sombra="pano" />
      <CartaFija id="reverso" carta={geometria.mazo.mazo} sombra="pano" />
      {geometria.asientos.flatMap(g => g.dorsos.map((dorso, i) => (
        <CartaFija key={"dorso-" + g.asiento + "-" + i} id="reverso" carta={dorso} sombra="pano" />
      )))}
      {mesa.asientos.map(a => {
        const lugar = geometria.asientos[a.asiento]?.jugada;
        if (!a.jugada || !lugar) return null;
        const clave = a.asiento + ":" + a.jugada;
        return (
          <CartaDelPano key={clave} id={a.jugada} carta={lugar}
            desde={yaEstaban.current.has(clave) ? null : origenDe(a.asiento, a.jugada)}
            oscura={hayGanadora && !a.ganadora} duracion={liviano ? 0 : undefined} />
        );
      })}
      {[...mano].map(([id, carta]) => <CartaDeMano key={"mano-" + id} id={id} carta={carta} encima={false} />)}
      {[...mano].map(([id, carta]) => <CartaDeMano key={"encima-" + id} id={id} carta={carta} encima />)}
    </Canvas>
  );
}
