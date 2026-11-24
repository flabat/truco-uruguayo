import { staticFile } from "remotion";
import { Naipe } from "@site/components/jugar/Tapete";
import type { CardId } from "@site/motor/cartas";
import { valoresDePiezas } from "../lib/escena.ts";
import { palabraDeRango } from "../lib/numeros.ts";

const base = staticFile("img").slice(0, -3);
const nombreCorto = (carta: CardId) => {
  const p = palabraDeRango(Number(carta.slice(-2)) as never);
  return p.charAt(0).toUpperCase() + p.slice(1);
};

/** Las cinco piezas del palo de la muestra y lo que valen. */
export const TablaValores = ({ muestra, modalidad }: { muestra: CardId; modalidad: "envido" | "flor" }) => (
  <div>
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      {valoresDePiezas(muestra).map((v) => (
        <div key={v.carta} style={{ flex: 1, textAlign: "center" }}>
          <div style={{ background: "#fff", borderRadius: 5, padding: 2 }}><Naipe base={base} id={v.carta} /></div>
          <div style={{ font: "600 11px var(--sans)", marginTop: 6 }}>{nombreCorto(v.carta)}</div>
          <div style={{ font: "400 26px/1.1 var(--serif)", color: "var(--oro)" }}>{modalidad === "envido" ? v.envido : "+" + v.flor}</div>
        </div>
      ))}
    </div>
    <div style={{ font: "400 13px var(--sans)", marginTop: 14 }}>Las figuras comunes valen 0.</div>
  </div>
);
