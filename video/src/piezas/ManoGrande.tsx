import { staticFile } from "remotion";
import { Naipe } from "@site/components/jugar/Tapete";
import { nombrar } from "@site/components/jugar/HistorialDeMano";
import type { CardId } from "@eltruco/motor/cartas.ts";

const base = staticFile("img").slice(0, -3);

export interface EstadoCarta {
  carta: CardId;
  /** 0 a 1: cuánto entró la carta (resorte). */
  entrada: number;
  /** null: sin resaltar. true: cuenta. false: queda afuera. */
  cuenta: boolean | null;
  /** 1 a -1 durante el giro (coseno); el signo elige la cara. */
  giro?: { escala: number; antes: CardId };
}

/** Las tres cartas de la mano, grandes, con nombre y barra. */
export const ManoGrande = ({ cartas }: { cartas: EstadoCarta[] }) => (
  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
    {cartas.map(({ carta, entrada, cuenta, giro }, i) => {
      const cara = giro && giro.escala > 0 ? giro.antes : carta;
      return (
        <figure key={i} style={{ margin: 0, flex: 1, textAlign: "center", opacity: entrada * (cuenta === false ? 0.38 : 1),
          transform: `translateY(${(1 - entrada) * 40}px)` }}>
          <div style={{ background: "#fff", borderRadius: 6, padding: 3, transform: `scaleX(${giro ? Math.abs(giro.escala) : 1})`,
            outline: cuenta ? "2px solid var(--oro)" : "none", outlineOffset: 2 }}>
            <Naipe base={base} id={cara} />
          </div>
          <figcaption style={{ font: `600 ${nombrar(cara).length > 15 ? 10 : 12}px/1.2 var(--sans)`, marginTop: 6, whiteSpace: "nowrap" }}>{nombrar(cara)}</figcaption>
          <div style={{ height: 3, borderRadius: 2, marginTop: 5, background: cuenta ? "var(--oro)" : "#4e6b58" }} />
        </figure>
      );
    })}
  </div>
);
