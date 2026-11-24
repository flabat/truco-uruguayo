// Composición de humo: prueba que los componentes, el CSS, las fuentes y el motor del sitio cargan al renderizar.
import "@fontsource/dm-serif-text/latin-400.css";
import "@site/styles/site.css";
import { AbsoluteFill, staticFile } from "remotion";
import { Naipe } from "@site/components/jugar/Tapete";
import { evaluarTantos } from "@site/motor/tantos";

const base = staticFile("img").slice(0, -3);

export const Prueba = () => (
  <AbsoluteFill style={{ background: "var(--paper)", padding: 24, gap: 16, alignItems: "center", justifyContent: "center" }}>
    <style>{".prueba img { width: 100%; height: auto; }"}</style>
    <div className="prueba" style={{ width: 160 }}><Naipe base={base} id="oros-02" /></div>
    <p style={{ font: "400 64px var(--serif)", margin: 0 }}>{evaluarTantos(["copas-04", "copas-07", "espadas-01"], "bastos-06").total}</p>
  </AbsoluteFill>
);
