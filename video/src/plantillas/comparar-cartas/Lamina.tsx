// Lámina de «comparar cartas»: dos cartas por vuelta, pausa para decidir y la ganadora resaltada.
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/dm-serif-text/latin-400.css";
import "@site/styles/site.css";
import "../../piezas/piezas.css";
import { useMemo } from "react";
import { AbsoluteFill, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Naipe } from "@site/components/jugar/Tapete";
import { nombrar } from "@site/components/jugar/HistorialDeMano";
import { paloDe, rangoDe, type CardId } from "@site/motor/cartas";
import type { Vuelta } from "../../lib/episodio.ts";
import { momentosDeCartas, valoresDePiezas } from "../../lib/escena.ts";
import { armarLinea, type LineaGuion } from "../../lib/linea.ts";
import type { Voz } from "../../lib/voz.ts";
import { BandaPano } from "../../piezas/BandaPano";
import { Cabecera } from "../../piezas/Cabecera";
import { Cierre } from "../../piezas/Cierre";
import { EscalaFuerza } from "../../piezas/EscalaFuerza";
import { Narracion } from "../../piezas/Narracion";
import { PieGrabado } from "../../piezas/PieGrabado";
import { Titulo } from "../../piezas/Titulo";

export type PropsComparar = {
  muestra: CardId;
  gancho: string;
  vueltas: Vuelta[];
  lineas: LineaGuion[];
  voz: Voz;
};

const base = staticFile("img").slice(0, -3);
const corto: Record<number, string> = { 1: "as", 10: "sota", 11: "caballo", 12: "rey" };
/** «rey de copas», «2 de bastos»: el nombre de la carta dentro de una oración. */
const enOracion = (carta: CardId) => nombrar(carta).charAt(0).toLowerCase() + nombrar(carta).slice(1);

/** «Piezas: 2, 4, 5, caballo y sota de bastos.» con el rey en lugar de la pieza que salió de muestra. */
function notaPiezas(muestra: CardId): string {
  const r = valoresDePiezas(muestra).map((v) => corto[rangoDe(v.carta)] ?? String(rangoDe(v.carta)));
  return `Piezas: ${r.slice(0, -1).join(", ")} y ${r.at(-1)} de ${paloDe(muestra)}.`;
}

type Estado = "neutral" | "gana" | "pierde" | "parda";

/** Antes de la primera vuelta, dos cartas boca abajo esperan en el paño. */
const Dorso = () => (
  <div style={{ width: 94, background: "#fff", borderRadius: 6, padding: 3, opacity: 0.9 }}>
    <img src={base + "img/cartas/tatu/reverso.webp"} alt="" width={384} height={596} />
  </div>
);

const Carta = ({ carta, entrada, estado, brillo }: { carta: CardId; entrada: number; estado: Estado; brillo: number }) => {
  const resaltada = estado === "gana" || estado === "parda";
  const escala = estado === "gana" ? 1 + 0.07 * brillo : estado === "pierde" ? 1 - 0.06 * brillo : 1;
  return (
    <figure style={{ margin: 0, width: 94, textAlign: "center", opacity: entrada * (estado === "pierde" ? 1 - 0.62 * brillo : 1),
      transform: `translateY(${(1 - entrada) * 40}px) scale(${escala})`, filter: estado === "pierde" ? `grayscale(${brillo})` : "none" }}>
      <div style={{ background: "#fff", borderRadius: 6, padding: 3,
        boxShadow: resaltada ? `0 0 0 ${3 * brillo}px var(--oro), 0 0 ${18 * brillo}px rgba(255, 224, 153, ${0.55 * brillo})` : "none" }}>
        <Naipe base={base} id={carta} />
      </div>
      <figcaption style={{ font: "600 12px/1.2 var(--sans)", marginTop: 7, whiteSpace: "nowrap",
        color: resaltada && brillo > 0.5 ? "var(--oro)" : "var(--crema)" }}>{nombrar(carta)}</figcaption>
    </figure>
  );
};

export const LaminaComparar = ({ muestra, gancho, vueltas, lineas, voz }: PropsComparar) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const L = useMemo(() => armarLinea(lineas, voz.palabras), [lineas, voz]);
  const hay = (id: string) => lineas.some((l) => l.id === id);
  const desde = (id: string) => (hay(id) ? L.inicio(id) : Infinity);
  const actual = L.tramos.findLast((tr) => tr.inicio <= t)?.id ?? lineas[0].id;
  const enEscala = actual === "escala";
  const enCierre = actual === "cierre";

  // La vuelta en pantalla: desde que empieza su línea (o su respuesta, si la línea se quitó).
  const comienzo = vueltas.map((_, i) => Math.min(desde(`vuelta${i + 1}`), desde(`respuesta${i + 1}`)));
  const n = Math.max(0, comienzo.findLastIndex((c) => c <= t));
  const vuelta = vueltas[n];
  const antesDeEmpezar = t < comienzo[0];
  const revelacion = desde(`respuesta${n + 1}`);
  const revelada = t >= revelacion;
  const brillo = revelada ? spring({ frame: frame - Math.round(revelacion * fps), fps, config: { damping: 16 } }) : 0;

  const entradas = hay(`vuelta${n + 1}`) ? momentosDeCartas(L, `vuelta${n + 1}`, vuelta.cartas) : vuelta.cartas.map(() => comienzo[n]);
  const estado = (carta: CardId): Estado => !revelada ? "neutral"
    : vuelta.ganadora === null ? "parda" : carta === vuelta.ganadora ? "gana" : "pierde";

  const pausa = L.pausas.find((p) => t >= p.desde && t < p.hasta);
  const muestraDicha = hay("pregunta") ? L.cuando("pregunta", "muestra") : null;
  const pulso = muestraDicha === null ? 0 : Math.max(0, 1 - Math.abs(t - muestraDicha - 0.2) / 0.35);

  // Cada fila de la escala aparece cuando la voz la nombra.
  const aparece = (palabra: string, ocurrencia = 0) => {
    const cuando = hay("escala") ? L.cuando("escala", palabra, ocurrencia) ?? L.inicio("escala") : Infinity;
    return interpolate(t, [cuando - 0.1, cuando + 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  };

  const titulo = enCierre ? "Probá otras vueltas."
    : enEscala ? "De mayor a menor"
    : antesDeEmpezar ? gancho
    : !revelada ? "¿Cuál gana?"
    : vuelta.ganadora === null ? "Parda" : null;

  return (
    <AbsoluteFill className="lamina">
      <Cabecera />
      {titulo === null
        ? <Titulo largo={("Gana el " + enOracion(vuelta.ganadora!)).length + 6}>
            Gana {rangoDe(vuelta.ganadora!) === 10 ? "la" : "el"} <span style={{ color: "var(--accent)" }}>{enOracion(vuelta.ganadora!)}</span>
          </Titulo>
        : <Titulo largo={titulo.length}>{titulo === "Parda" ? <span style={{ color: "var(--accent)" }}>Parda</span> : titulo}</Titulo>}
      <BandaPano muestra={muestra} pulso={pulso}
        nota={enCierre ? "" : notaPiezas(muestra)}
        rotulo={enEscala ? "La fuerza de las cartas" : enCierre ? "eltru.co" : `Vuelta ${n + 1} de ${vueltas.length}`}
        derecha={pausa ? `Tu turno ${Math.ceil(pausa.hasta - t)}` : enEscala || enCierre ? "" : "¿Cuál gana?"}>
        {enEscala
          ? <EscalaFuerza muestra={muestra} aparicion={{ piezas: aparece("piezas"), matas: aparece("matas"), comunes: aparece("tres"), parda: aparece("parda") }} />
          : enCierre ? <Cierre texto="Practicá comparar cartas con vueltas nuevas, gratis y en el navegador." />
          : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginTop: 6 }}>
              {antesDeEmpezar ? <><Dorso /><div style={{ width: 70 }} /><Dorso /></> : <>
              <Carta carta={vuelta.cartas[0]} estado={estado(vuelta.cartas[0])} brillo={brillo}
                entrada={spring({ frame: frame - Math.round(entradas[0] * fps), fps, config: { damping: 14 } })} />
              <div style={{ width: 70, textAlign: "center" }}>
                {revelada && vuelta.ganadora === null
                  ? <div style={{ font: "400 28px/1 var(--serif)", color: "var(--oro)", transform: `scale(${0.6 + 0.4 * brillo})` }}>Parda</div>
                  : <div className="rotulo" style={{ color: "#d6dcc6", opacity: revelada ? 0.4 : 1 }}>contra</div>}
              </div>
              <Carta carta={vuelta.cartas[1]} estado={estado(vuelta.cartas[1])} brillo={brillo}
                entrada={spring({ frame: frame - Math.round(entradas[1] * fps), fps, config: { damping: 14 } })} />
              </>}
            </div>
          )}
      </BandaPano>
      <Narracion L={L} voz={voz} />
      <PieGrabado />
    </AbsoluteFill>
  );
};
