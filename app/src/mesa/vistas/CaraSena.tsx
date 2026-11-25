import { useId } from "react";
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from "react-native-svg";
import type { GestoPie } from "@eltruco/motor/senas-pie.ts";

// Las posiciones finales de las animaciones de `senas-pie.css`.
const transformacionDeBoca: Partial<Record<GestoPie, string>> = {
  "labios-derecha": "translate(-10 0)",
  "labios-izquierda": "translate(10 0)",
  beso: "translate(32 45) scale(1.16) translate(-32 -45)",
};

/**
 * La cara de `src/components/jugar/CaraSena.tsx` en react-native-svg. Las coordenadas siempre
 * miran al emisor de frente: su lado derecho queda a nuestra izquierda.
 */
export function CaraSena({ gesto, tamano = 34 }: { gesto: GestoPie; tamano?: number }) {
  // El id va en `url(#…)`: sin los signos que React pone en `useId`.
  const degradado = "cara" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const besito = gesto === "beso" || gesto.startsWith("labios-");
  const lengua = gesto === "lengua";
  const mordida = gesto === "labio-inferior";
  const abrir = gesto === "boca" || lengua || mordida;
  return (
    <Svg testID="cara-sena" width={tamano} height={tamano} viewBox="0 0 64 64" aria-hidden>
      <Defs>
        <RadialGradient id={degradado} cx="0.36" cy="0.28" r="0.79">
          <Stop offset="0" stopColor="#ffe884" />
          <Stop offset="0.7" stopColor="#ffcc35" />
          <Stop offset="1" stopColor="#f2a81c" />
        </RadialGradient>
      </Defs>
      <Circle cx={32} cy={32} r={29} fill={`url(#${degradado})`} stroke="#693c11" strokeWidth={2.5} />
      <G fill="none" stroke="#49301e" strokeWidth={2.9} strokeLinecap="round">
        <G transform={gesto === "cejas" ? "translate(0 -6)" : undefined}>
          <Path d="M13 22Q18 18 24 21 M40 21Q46 18 51 22" />
        </G>
        {[20, 44].map((x, i) => {
          const cerrado = gesto === "ojos-cerrados" || gesto === (i === 0 ? "ojo-derecho" : "ojo-izquierdo");
          return cerrado ? (
            <Path key={x} d={`M${x - 4} 31q4 3 8 0`} strokeWidth={2.4} />
          ) : (
            <G key={x}>
              <Ellipse cx={x} cy={30} rx={3.1} ry={4.4} fill="#432b19" stroke="none" />
              <Circle cx={x - 0.8} cy={28.6} r={0.9} fill="#fff6dc" stroke="none" />
            </G>
          );
        })}
        <G transform={gesto === "nariz" ? "translate(0 -2.5)" : undefined}>
          <Path d="M29 36q3-4 6 0" stroke="#945818" strokeWidth={2} />
          {gesto === "nariz" && <Path d="m24 33 3 1m10 0 3-1m-10-2 4-1" strokeWidth={1.4} />}
        </G>
        <G transform={transformacionDeBoca[gesto]}>
          {besito ? (
            <Path d="M29 43q5-4 5 0l-3 2 3 2q0 3-5 1" strokeWidth={2.5} />
          ) : abrir ? (
            <G>
              <Ellipse cx={32} cy={45} rx={mordida ? 7 : 5.5} ry={mordida ? 3.7 : 5.8} fill="#623025" strokeWidth={1.6} />
              {lengua && <Path d="M28 46h8v3q0 6-4 6t-4-6z" fill="#ef8a85" strokeWidth={1.2} />}
              {mordida && (
                <G>
                  <Path d="M26 44q6 0 8 2l2 2q-7 2-10-1z" fill="#e88d80" strokeWidth={0.8} />
                  <Path d="M30 42h4l-1 3-2 .4z" fill="#fff7e6" strokeWidth={0.7} />
                </G>
              )}
            </G>
          ) : (
            <Path d="M25 45q7 1 14 0" />
          )}
        </G>
      </G>
    </Svg>
  );
}
