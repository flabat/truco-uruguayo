import type { ReactNode } from "react";
import { Img, staticFile } from "remotion";
import { Naipe } from "@site/components/jugar/Tapete";
import { nombrar } from "@site/components/jugar/HistorialDeMano";
import type { CardId } from "@site/motor/cartas";

const base = staticFile("img").slice(0, -3);

interface Props {
  muestra: CardId;
  nota: string;
  rotulo: string;
  derecha: string;
  /** 0 a 1: brillo dorado alrededor de la muestra cuando la narración la nombra. */
  pulso: number;
  children: ReactNode;
}

/** La franja de paño: muestra, nota y el espacio de la mano. Ocupa de y 128 a y 442. */
export const BandaPano = ({ muestra, nota, rotulo, derecha, pulso, children }: Props) => (
  <div style={{ position: "absolute", top: 128, left: 0, right: 0, height: 314, background: "var(--pano)", color: "var(--crema)", padding: "12px 16px" }}>
    <div style={{ display: "flex", gap: 14, alignItems: "center", height: 80 }}>
      <div style={{ position: "relative", width: 70, height: 78, borderRadius: 8,
        boxShadow: `0 0 0 ${2 * pulso}px rgba(255, 224, 153, ${pulso})` }}>
        <Img src={base + "img/cartas/tatu/reverso.webp"} style={{ position: "absolute", width: 46, left: 12, top: 18, transform: "rotate(90deg)" }} />
        <div style={{ position: "absolute", left: 13, top: 2, width: 44 }}><Naipe base={base} id={muestra} /></div>
      </div>
      <div>
        <div className="rotulo" style={{ color: "var(--oro)" }}>Muestra</div>
        <div style={{ font: "400 26px/1.05 var(--serif)", marginTop: 3 }}>{nombrar(muestra)}</div>
        <div style={{ font: "400 12px/1.3 var(--sans)", opacity: .88, marginTop: 4 }}>{nota}</div>
      </div>
    </div>
    <div className="rotulo" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 28,
      borderTop: "1px solid #6c886f", color: "#d6dcc6" }}>
      <span>{rotulo}</span><span style={{ color: "var(--oro)" }}>{derecha}</span>
    </div>
    {children}
  </div>
);
