import { staticFile } from "remotion";
import { Naipe } from "@site/components/jugar/Tapete";
import type { CardId } from "@site/motor/cartas";
import { matas, rangosComunes } from "@site/motor/jerarquia";
import { valoresDePiezas } from "../lib/escena.ts";

const base = staticFile("img").slice(0, -3);
const corto: Record<number, string> = { 1: "as", 10: "sota", 11: "caballo", 12: "rey" };

/** 0 a 1 por fila: cuánto apareció cada parte de la escala mientras la voz la nombra. */
export interface Apariciones { piezas: number; matas: number; comunes: number; parda: number }

const Fila = ({ rotulo, opacidad, children }: { rotulo: string; opacidad: number; children: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: opacidad, transform: `translateX(${(1 - opacidad) * 16}px)` }}>
    <div className="rotulo" style={{ width: 56, color: "var(--oro)" }}>{rotulo}</div>
    <div style={{ flex: 1 }}>{children}</div>
  </div>
);

const Cartas = ({ cartas }: { cartas: readonly CardId[] }) => (
  <div style={{ display: "flex", gap: 5 }}>
    {cartas.map((c) => (
      <div key={c} style={{ width: 28, background: "#fff", borderRadius: 4, padding: 2 }}><Naipe base={base} id={c} /></div>
    ))}
  </div>
);

/** La jerarquía resumida para la muestra: piezas, matas, cartas comunes y la parda. */
export const EscalaFuerza = ({ muestra, aparicion }: { muestra: CardId; aparicion: Apariciones }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
    <Fila rotulo="Piezas" opacidad={aparicion.piezas}><Cartas cartas={valoresDePiezas(muestra).map((v) => v.carta)} /></Fila>
    <Fila rotulo="Matas" opacidad={aparicion.matas}><Cartas cartas={matas} /></Fila>
    <Fila rotulo="Comunes" opacidad={aparicion.comunes}>
      <div style={{ font: "600 13px/1.25 var(--sans)", whiteSpace: "nowrap" }}>{rangosComunes.map((r) => corto[r] ?? String(r)).join(" · ")}</div>
    </Fila>
    <Fila rotulo="Iguales" opacidad={aparicion.parda}>
      <div style={{ font: "400 13px var(--sans)" }}>Mismo puesto: <span style={{ color: "var(--oro)", fontWeight: 700 }}>parda</span>.</div>
    </Fila>
  </div>
);
