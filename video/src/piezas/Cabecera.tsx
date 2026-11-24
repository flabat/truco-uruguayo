import { Img, staticFile } from "remotion";

export const Cabecera = () => (
  <div style={{ position: "absolute", top: 20, left: 20, right: 20, height: 26, display: "flex", alignItems: "center", gap: 8 }}>
    <Img src={staticFile("marca/favicon.svg")} style={{ width: 22 }} />
    <b style={{ font: "400 19px var(--serif)" }}>El Truco</b>
    <span className="rotulo" style={{ marginLeft: "auto", color: "var(--accent)" }}>Truco uruguayo</span>
  </div>
);
